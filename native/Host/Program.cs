using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Automation;
namespace ComputerUse.NativeHost;
internal sealed class Fault(string code,string message):Exception(message){public string Code{get;}=code;}
[StructLayout(LayoutKind.Sequential)]
internal readonly record struct Rect(int Left,int Top,int Right,int Bottom){public int Width=>Right-Left;public int Height=>Bottom-Top;}
internal sealed record Target(long Id,string App,string Title,uint Pid,Rect Bounds);
internal sealed record WindowCandidate(Target Window,long Owner,bool Valid,bool Visible,long ExtendedStyle,string ClassName);
internal sealed record Node(AutomationElement Element,int[] RuntimeId,string Name,string Type,Rect Bounds);
internal sealed class Snapshot(Target target){
 public string Id{get;}=Guid.NewGuid().ToString("N");public DateTime Captured{get;}=DateTime.UtcNow;
 public Target Target{get;}=target;public string? FrameId{get;set;}public Rect? FrameBounds{get;set;}
 public List<Node> Nodes{get;}=[];public int[]? FocusRuntimeId{get;set;}public int? FocusNodeIndex{get;set;}public bool WasForeground{get;}=Native.GetForegroundWindow().ToInt64()==target.Id;
}
internal static partial class Program{
 static readonly JsonSerializerOptions JsonOptions=new(){PropertyNamingPolicy=JsonNamingPolicy.SnakeCaseLower};
 static readonly Dictionary<long,Snapshot> Snapshots=[];static readonly Dictionary<long,(uint Pid,string App)> KnownWindows=[];
 static bool DpiAware;
 [STAThread]static int Main(string[] argv){
  if(argv.Length==2&&argv[0]=="--cancel")return SignalCancel(argv[1]);
  if(argv.Length==2&&argv[0]=="--cancel-event"){if(!argv[1].StartsWith("Local\\ComputerUse2-",StringComparison.Ordinal)||argv[1].Length>120)return 1;CancelEvent=new EventWaitHandle(false,EventResetMode.ManualReset,argv[1]);}
  Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
  DpiAware=Native.SetProcessDpiAwarenessContext(new(-4));
  if(!DpiAware)DpiAware=Native.AreDpiAwarenessContextsEqual(Native.GetThreadDpiAwarenessContext(),new(-4));
  if(argv.Contains("--self-test"))return SelfTest();
  string? line;while((line=Console.ReadLine()) is not null){
   object? id=null;try{
    if(line.Length>4194304)throw new Fault("request_too_large","Request exceeds 4 MiB.");
    using var doc=JsonDocument.Parse(line);var root=doc.RootElement;if(root.TryGetProperty("id",out var v))id=v.Clone();
    var method=Str(root,"method");var args=root.TryGetProperty("args",out var a)?a:JsonSerializer.SerializeToElement(new{});
    var result=Dispatch(method,args);Write(new{id,result});if(method=="close")break;
   }catch(Fault e){Write(new{id,error=new{code=e.Code,message=e.Message}});}
   catch(Exception e){Write(new{id,error=new{code="native_error",message=e.Message,data=new{outcome="unknown; reobserve before retrying input"}}});}
  }Snapshots.Clear();CancelEvent?.Dispose();return 0;
 }
 static object? Dispatch(string m,JsonElement a)=>m switch{
  "status"=>Status(),"list_windows"=>Inventory().Select(WindowObject).ToArray(),"list_apps"=>CatalogApps(),
  "get_window"=>WindowObject(Resolve(a,true)),"launch_app"=>Launch(a),"get_window_state"=>State(a),
  "activate_window"=>Activate(a),"click"=>Click(a),"press_key"=>PressKey(a),"type_text"=>TypeText(a),
  "scroll"=>Scroll(a),"drag"=>Drag(a),"set_value"=>SetValue(a),"perform_secondary_action"=>Secondary(a),
  "close"=>new{closed=true},_=>throw new Fault("unknown_method","Unknown native method: "+m)
 };
 static object Status()=>new{
  name="Computer-Use 2.0 native host",version="0.1.0",platform="windows",dpi_aware=DpiAware,
  capture=new{primary="Windows.Graphics.Capture",fallback="PrintWindow",wgc_supported=WgcCapture.IsSupported(),
   limitations="WGC HWND capture requires live acceptance on designated window. Protected/minimized targets can fail; fallback reports its limitations."},
  accessibility="Persistent STA UI Automation, bounded traversal; individual provider calls can hang and bridge timeout terminates host.",
  observations="Input requires snapshot_id; coordinate input also screenshot_id. Snapshots expire after 30 seconds; all input invalidates observations.",
  methods=new[]{"list_windows","get_window","list_apps","launch_app","get_window_state","click","press_key","type_text","scroll","set_value","drag","perform_secondary_action","activate_window"}
 };
 static object WindowObject(Target t)=>new{id=t.Id,app=t.App,title=t.Title};
 static List<Target> SelectTargetableWindows(IEnumerable<WindowCandidate> candidates)=>candidates.Where(c=>
  c.Valid&&c.Visible&&!string.IsNullOrWhiteSpace(c.Window.Title)&&
  (c.ExtendedStyle&0x08000000)==0&&
  ((c.ExtendedStyle&0x80)==0||(c.ExtendedStyle&0x40000)!=0||c.ClassName.Equals("#32770",StringComparison.Ordinal))
 ).Take(1000).Select(c=>c.Window).ToList();
 static List<Target> Inventory(){
  var candidates=new List<WindowCandidate>();Native.EnumWindows((h,_)=>{
   if(!Native.IsWindow(h)||!Native.IsWindowVisible(h))return true;
   try{
    var t=Describe(h);var className=new StringBuilder(256);Native.GetClassName(h,className,className.Capacity);
    candidates.Add(new(t,Native.GetWindow(h,4).ToInt64(),true,true,Native.GetWindowLongPtr(h,-20).ToInt64(),className.ToString()));
   }catch{}
   return candidates.Count<3000;
  },IntPtr.Zero);
  // Ownership is metadata, not an exclusion: modal dialogs keep their own HWND/process identity.
  var list=SelectTargetableWindows(candidates);foreach(var t in list)KnownWindows[t.Id]=(t.Pid,t.App);return list;
 }
 static object ListApps()=>Inventory().GroupBy(t=>t.App,StringComparer.OrdinalIgnoreCase).Select(g=>new{
  id=g.Key,display_name=Path.GetFileNameWithoutExtension(g.Key),is_running=true,windows=g.Select(WindowObject).ToArray()
 }).ToArray();
 static Target Describe(IntPtr h){
  if(!Native.IsWindow(h))throw new Fault("window_closed","Window no longer exists.");
  Native.GetWindowThreadProcessId(h,out var pid);var p=Native.OpenProcess(0x1000,false,pid);
  if(p==IntPtr.Zero)throw new Fault("window_access_denied","Cannot verify target process.");
  string app;try{var s=new StringBuilder(32768);var n=s.Capacity;if(!Native.QueryFullProcessImageName(p,0,s,ref n))throw new Fault("window_access_denied","Cannot resolve target executable.");app=s.ToString();}finally{Native.CloseHandle(p);}
  if(!Native.GetWindowRect(h,out var r))throw new Fault("window_unavailable","Cannot obtain target geometry.");
  var title=new StringBuilder(Math.Min(Native.GetWindowTextLength(h)+1,8192));Native.GetWindowText(h,title,title.Capacity);
  return new(h.ToInt64(),app,title.ToString(),pid,r);
 }
 static Target Resolve(JsonElement a,bool direct=false){
  var w=direct?a:Req(a,"window");var id=Long(w,"id");if(!direct)Str(w,"app");
  if(!KnownWindows.ContainsKey(id))throw new Fault("unknown_window","Select a window returned by list_windows/list_apps first.");
  var t=Describe(new(id));var known=KnownWindows[id];if(known.Pid!=t.Pid||!known.App.Equals(t.App,StringComparison.OrdinalIgnoreCase))throw new Fault("window_identity_changed","Window owner changed since inventory; rediscover.");
  if(w.TryGetProperty("app",out var app)&&!string.Equals(app.GetString(),t.App,StringComparison.OrdinalIgnoreCase))throw new Fault("window_identity_changed","Selected owner differs from current window.");
  return t;
 }
 static void Desktop(){
  var d=Native.OpenInputDesktop(0,false,1);if(d==IntPtr.Zero)throw new Fault("desktop_unavailable","Unlock the Windows desktop before computer control.");
  try{var s=new StringBuilder(256);if(!Native.GetUserObjectInformation(d,2,s,s.Capacity*2,out _)||!s.ToString().Equals("Default",StringComparison.OrdinalIgnoreCase))throw new Fault("secure_desktop","Locked/secure desktops are unavailable.");}
  finally{Native.CloseDesktop(d);}
 }
 static void Usable(Target t){
  Desktop();if(!DpiAware)throw new Fault("dpi_unavailable","Per-monitor DPI awareness unavailable.");
  if(!Native.IsWindowVisible(new(t.Id)))throw new Fault("window_hidden","Target is hidden.");
  if(Native.IsIconic(new(t.Id)))throw new Fault("window_minimized","Restore target before capture/input.");
  if(t.Bounds.Width<=0||t.Bounds.Height<=0)throw new Fault("window_unavailable","Target has no geometry.");
  var ti=Integrity(t.Pid);var own=Integrity((uint)Environment.ProcessId);
  if(ti is null||own is null)throw new Fault("integrity_unverified","Cannot verify target integrity.");
  if(ti>own)throw new Fault("elevated_target","Higher-privilege targets are unavailable.");
 }
 static int? Integrity(uint pid){
  var p=Native.OpenProcess(0x1000,false,pid);if(p==IntPtr.Zero)return null;
  try{if(!Native.OpenProcessToken(p,8,out var token))return null;
   try{Native.GetTokenInformation(token,25,IntPtr.Zero,0,out var n);if(n==0)return null;var data=Marshal.AllocHGlobal(n);
    try{if(!Native.GetTokenInformation(token,25,data,n,out _))return null;var sid=Marshal.ReadIntPtr(data);var count=Marshal.ReadByte(Native.GetSidSubAuthorityCount(sid));return Marshal.ReadInt32(Native.GetSidSubAuthority(sid,(uint)(count-1)));}
    finally{Marshal.FreeHGlobal(data);}
   }finally{Native.CloseHandle(token);}
  }finally{Native.CloseHandle(p);}
 }
 static void Foreground(Target t){Usable(t);var h=new IntPtr(t.Id);if(Native.GetForegroundWindow()!=h)Native.SetForegroundWindow(h);for(int i=0;i<20&&Native.GetForegroundWindow()!=h;i++)Thread.Sleep(15);VerifyForeground(t);}
 static void VerifyForeground(Target t){
  CheckStop();
  var now=Describe(new(t.Id));if(Native.GetForegroundWindow().ToInt64()!=t.Id||now.Pid!=t.Pid||!now.App.Equals(t.App,StringComparison.OrdinalIgnoreCase))throw new Fault("focus_failed","Selected foreground owner could not be verified; no further input sent.");
  if(now.Bounds!=t.Bounds)throw new Fault("window_geometry_changed","Geometry changed; reobserve.");
 }
 static object Activate(JsonElement a){var t=Resolve(a);Foreground(t);Snapshots.Clear();return new{activated=true,window=WindowObject(t)};}
 static object Launch(JsonElement a){
  Desktop();var path=Str(a,"app");if(path.StartsWith("aumid:",StringComparison.OrdinalIgnoreCase))return ActivatePackaged(path);if(!Path.IsPathFullyQualified(path)||!path.EndsWith(".exe",StringComparison.OrdinalIgnoreCase)||!File.Exists(path))throw new Fault("invalid_executable","Provide existing absolute .exe path, not shell commands or arguments.");
  path=Path.GetFullPath(path);using var p=Process.Start(new ProcessStartInfo(path){UseShellExecute=false,WorkingDirectory=Path.GetDirectoryName(path)!,CreateNoWindow=false});
  return new{launched=p is not null,process_id=p?.Id,next="Call list_windows and choose returned window."};
 }
 static JsonElement Req(JsonElement e,string k)=>e.TryGetProperty(k,out var v)?v:throw new Fault("invalid_arguments","Missing "+k+".");
 static string Str(JsonElement e,string k,bool empty=false){var v=Req(e,k);if(v.ValueKind!=JsonValueKind.String||(!empty&&string.IsNullOrWhiteSpace(v.GetString())))throw new Fault("invalid_arguments",k+" must be string.");return v.GetString()!;}
 static string? OptStr(JsonElement e,string k)=>e.TryGetProperty(k,out var v)&&v.ValueKind==JsonValueKind.String?v.GetString():null;
 static long Long(JsonElement e,string k){var v=Req(e,k);if(v.ValueKind!=JsonValueKind.Number||!v.TryGetInt64(out var n)||n<=0)throw new Fault("invalid_arguments",k+" must be positive integer.");return n;}
 static int Int(JsonElement e,string k){var v=Req(e,k);if(v.ValueKind!=JsonValueKind.Number||!v.TryGetInt32(out var n))throw new Fault("invalid_arguments",k+" must be integer.");return n;}
 static bool Bool(JsonElement e,string k,bool fallback){if(!e.TryGetProperty(k,out var v))return fallback;if(v.ValueKind is not JsonValueKind.True and not JsonValueKind.False)throw new Fault("invalid_arguments",k+" must be boolean.");return v.GetBoolean();}
 static string Cut(string? s,int n)=>s is null?"":s.Length<=n?s:s[..n];
 static void Write(object v)=>Console.WriteLine(JsonSerializer.Serialize(v,JsonOptions));
}
