using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Automation;
namespace ComputerUse.NativeHost;
internal static partial class Program {
 static object State(JsonElement a){
  var t=Resolve(a);Usable(t);var image=Bool(a,"include_screenshot",true);var text=Bool(a,"include_text",false);
  if(!image&&!text)throw new Fault("invalid_arguments","Request screenshot, text or both.");
  Snapshots.Remove(t.Id);var s=new Snapshot(t);object? ax=text?Accessibility(s):null;object[] screenshots=image?[Capture(s)]:[];
  var now=Describe(new(t.Id));if(now.Pid!=t.Pid||now.Bounds!=t.Bounds)throw new Fault("window_changed","Window changed during observation; reobserve.");
  Snapshots[t.Id]=s;return new{window=WindowObject(t),snapshot_id=s.Id,accessibility=ax,screenshots,expires_after_ms=30000};
 }
 static object Accessibility(Snapshot s){
  var root=AutomationElement.FromHandle(new(s.Target.Id));var tree=new StringBuilder();var partial=false;var sw=Stopwatch.StartNew();
  var selected=new List<string>();string? focus=null,selection=null,document=null;var walker=TreeWalker.ControlViewWalker;
  void Walk(AutomationElement e,int depth){
   if(depth>32||s.Nodes.Count>=1199||tree.Length>=24000||sw.ElapsedMilliseconds>2500){partial=true;return;}
   try{
    var c=e.Current;var index=s.Nodes.Count;var name=Cut(c.Name,300);var type=c.ControlType.ProgrammaticName;var bounds=UiaRect(c.BoundingRectangle);
    s.Nodes.Add(new(e,e.GetRuntimeId(),name,type,bounds));var actions=Actions(e);
    var row=$"[{index}] {type.Replace("ControlType.","")} {name}{(c.IsEnabled?"":" (disabled)")}{(c.IsPassword?" (password)":"")}{(actions.Count>0?" actions="+string.Join(",",actions):"")}";
    tree.Append(' ',Math.Min(depth*2,64)).AppendLine(row);if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out var selectionItem)&&((SelectionItemPattern)selectionItem).Current.IsSelected&&selected.Count<100)selected.Add(row);
    // Focus is bound after traversal through the independent global focused-element API.
    if(!c.IsPassword&&e.TryGetCurrentPattern(TextPattern.Pattern,out var tp)){
     var p=(TextPattern)tp;if(document is null&&c.ControlType==ControlType.Document)document=Cut(p.DocumentRange.GetText(12000),12000);

    }
    var child=walker.GetFirstChild(e);while(child is not null){if(partial)break;Walk(child,depth+1);child=walker.GetNextSibling(child);}
   }catch(ElementNotAvailableException){partial=true;}catch(InvalidOperationException){partial=true;}catch(COMException){partial=true;}
  }
  Walk(root,0);var beforeFocus=s.Nodes.Count;var capturedFocus=CaptureAuthoritativeFocus(s);focus=capturedFocus.Row;selection=capturedFocus.Selection;document??=capturedFocus.Document;
  if(s.Nodes.Count>beforeFocus&&focus is not null)tree.AppendLine(focus+" (separately observed focus)");
  return new{tree=tree.ToString(),focused_element=focus,selected_text=selection,selected_elements=selected,document_text=document,truncated=partial,node_count=s.Nodes.Count,focus_diagnostics=capturedFocus.Diagnostics};
 }
 static List<string> Actions(AutomationElement e){
  var a=new List<string>();if(e.TryGetCurrentPattern(InvokePattern.Pattern,out _))a.Add("Invoke");
  if(e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern,out _))a.AddRange(["Expand","Collapse"]);
  if(e.TryGetCurrentPattern(ScrollPattern.Pattern,out _))a.AddRange(["Scroll Up","Scroll Down","Scroll Left","Scroll Right"]);
  if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out _))a.Add("Select");
  if(e.TryGetCurrentPattern(TogglePattern.Pattern,out _))a.Add("Toggle");
  if(e.TryGetCurrentPattern(ValuePattern.Pattern,out _))a.Add("Set Value");
  if(e.TryGetCurrentPattern(WindowPattern.Pattern,out _))a.Add("Raise");return a;
 }
 static Rect UiaRect(System.Windows.Rect r)=>r.IsEmpty?new(0,0,0,0):new((int)Math.Round(r.Left),(int)Math.Round(r.Top),(int)Math.Round(r.Right),(int)Math.Round(r.Bottom));
 static object Capture(Snapshot s){
  var t=s.Target;WgcCapture.CheckSize(t.Bounds.Width,t.Bounds.Height);
  CaptureResult f;string? fallback=null;
  try{f=WgcCapture.Capture(new(t.Id),t.Bounds).GetAwaiter().GetResult();}
  catch(Exception e){fallback=e.Message;f=PrintCapture(t);}
  s.FrameId=Guid.NewGuid().ToString("N");s.FrameBounds=f.Bounds;
  return new{id=s.FrameId,url="data:image/png;base64,"+Convert.ToBase64String(f.Png),width=f.Width,height=f.Height,
   origin_x=f.Bounds.Left,origin_y=f.Bounds.Top,z_index=0,scale=1,method=f.Method,fallback_reason=fallback,limitations=f.Limitations};
 }
 static CaptureResult PrintCapture(Target t){
  using var b=new Bitmap(t.Bounds.Width,t.Bounds.Height,PixelFormat.Format32bppArgb);
  using(var g=Graphics.FromImage(b)){var dc=g.GetHdc();try{if(!Native.PrintWindow(new(t.Id),dc,2))throw new Fault("capture_failed","WGC and PrintWindow failed.");}finally{g.ReleaseHdc(dc);}}
  bool nonBlack=false;for(int y=0;y<b.Height&&!nonBlack;y+=Math.Max(1,b.Height/32))for(int x=0;x<b.Width;x+=Math.Max(1,b.Width/32)){var c=b.GetPixel(x,y);if(c.R>3||c.G>3||c.B>3){nonBlack=true;break;}}
  if(!nonBlack)throw new Fault("capture_blank","PrintWindow returned blank/black image. This frame is unusable.");
  using var stream=new MemoryStream();b.Save(stream,ImageFormat.Png);
  return new(stream.ToArray(),b.Width,b.Height,t.Bounds,"PrintWindow","Provider-dependent fallback. Incomplete GPU content cannot always be detected; no WGC or full occlusion guarantee.");
 }
 static (Target T,Snapshot S) Observe(JsonElement a,bool frame=false){
  var t=Resolve(a);Usable(t);if(!Snapshots.TryGetValue(t.Id,out var s)||OptStr(a,"snapshot_id")!=s.Id)throw new Fault("stale_observation","Input requires current snapshot_id.");
  if(!s.WasForeground||Native.GetForegroundWindow().ToInt64()!=t.Id)throw new Fault("focus_not_observed","Activate target then capture a fresh foreground observation before input.");Validate(s,t,OptStr(a,"screenshot_id")??OptStr(a,"screenshotId"),frame);return(t,s);
 }
 static void Validate(Snapshot s,Target t,string? frameId,bool frame,DateTime? now=null){
  if((now??DateTime.UtcNow)-s.Captured>TimeSpan.FromSeconds(30)||s.Target.Bounds!=t.Bounds||s.Target.Pid!=t.Pid||!s.Target.App.Equals(t.App,StringComparison.OrdinalIgnoreCase))throw new Fault("stale_observation","Snapshot expired or target changed.");
  if(frame&&(s.FrameId is null||frameId!=s.FrameId))throw new Fault("stale_frame","Coordinate input needs current screenshot_id.");
 }
 static Node Indexed(Snapshot s,JsonElement a){
  var i=Int(a,"element_index");if(i<0||i>=s.Nodes.Count)throw new Fault("invalid_element","Index is not in current accessibility snapshot.");var n=s.Nodes[i];
  try{var c=n.Element.Current;
   if(!n.RuntimeId.SequenceEqual(n.Element.GetRuntimeId())||Cut(c.Name,300)!=n.Name||c.ControlType.ProgrammaticName!=n.Type||UiaRect(c.BoundingRectangle)!=n.Bounds||!c.IsEnabled||c.IsOffscreen)throw new Fault("stale_element","Element changed or is not interactable.");
   if(c.IsPassword)throw new Fault("password_element","Password fields are unsupported by this desktop input interface.");
  }catch(ElementNotAvailableException){throw new Fault("stale_element","Element is unavailable.");}return n;
 }
}
