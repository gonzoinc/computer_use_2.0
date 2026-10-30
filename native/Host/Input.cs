using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Automation;
namespace ComputerUse.NativeHost;
internal static partial class Program{
 static readonly Dictionary<string,ushort> Keys=BuildKeys();
 static (int X,int Y) ValidatePoint(int x,int y,Rect b){if(x<0||y<0||x>=b.Width||y>=b.Height)throw new Fault("coordinate_outside","Coordinates must be inside observed image in physical pixels.");return(checked(b.Left+x),checked(b.Top+y));}
 static (int X,int Y) Point(JsonElement a,string x,string y,Snapshot s)=>ValidatePoint(Int(a,x),Int(a,y),s.FrameBounds??s.Target.Bounds);
 static (int X,int Y) Center(Node n,Target t)=>ValidatePoint(n.Bounds.Left+n.Bounds.Width/2-t.Bounds.Left,n.Bounds.Top+n.Bounds.Height/2-t.Bounds.Top,t.Bounds);
 static void Hit(Target t,(int X,int Y) p){var h=Native.WindowFromPoint(new(){X=p.X,Y=p.Y});if(h==IntPtr.Zero||Native.GetAncestor(h,2).ToInt64()!=t.Id)throw new Fault("point_occluded","Point is covered by another window; reobserve.");}
 static object Click(JsonElement a){
  bool indexed=a.TryGetProperty("element_index",out _);var(t,s)=Observe(a,!indexed);var count=a.TryGetProperty("click_count",out _)?Int(a,"click_count"):1;
  if(count<1||count>3)throw new Fault("invalid_arguments","click_count must be 1..3.");var flags=MouseFlags(OptStr(a,"mouse_button")??"left");
  var p=indexed?Center(Indexed(s,a),t):Point(a,"x","y",s);Snapshots.Clear();Foreground(t);Hit(t,p);
  for(int i=0;i<count;i++){VerifyForeground(t);Move(p);bool held=false;try{Mouse(flags.Down);held=true;Thread.Sleep(35);}finally{if(held)Mouse(flags.Up);}if(i+1<count)Thread.Sleep(65);}
  return new{clicked=true,reobserve=true};
 }
 static object PressKey(JsonElement a){
  var(t,_)=Observe(a);var keys=Chord(Str(a,"key"));Snapshots.Clear();Foreground(t);var held=new List<ushort>();
  try{foreach(var k in keys){VerifyForeground(t);Key(k,false);held.Add(k);}}
  finally{foreach(var k in held.AsEnumerable().Reverse())Key(k,true);}
  return new{pressed=true,reobserve=true};
 }
 static bool Belongs(AutomationElement e,Target t)=>IsOwnedElement(e,t,out _);
 static object TypeText(JsonElement a){
  var(t,s)=Observe(a);var text=Str(a,"text",true);if(text.Length>100000)throw new Fault("invalid_arguments","Text exceeds 100,000 UTF-16 units.");
  if(text.Any(char.IsControl))throw new Fault("invalid_arguments","Use press_key for control characters, Tab and Return.");
  if(s.FocusRuntimeId is null)throw new Fault("focus_unobserved","Observe accessibility and verify focus before typing.");
  Snapshots.Clear();Foreground(t);var focus=AutomationElement.FocusedElement;
  if(focus is null||!MatchesObservedFocus(focus,s,t))throw new Fault("focus_changed","Focused element changed or is outside target.");
  foreach(var c in text){VerifyForeground(t);var currentFocus=AutomationElement.FocusedElement;if(currentFocus is null||!MatchesObservedFocus(currentFocus,s,t))throw new Fault("focus_changed","Typing focus changed; partial text may have been entered.");bool held=false;try{Unicode(c,false);held=true;}finally{if(held)Unicode(c,true);}}
  return new{typed_utf16_units=text.Length,reobserve=true};
 }
 static object Scroll(JsonElement a){
  var(t,s)=Observe(a,true);var p=Point(a,"x","y",s);var dx=Int(a,"scrollX");var dy=Int(a,"scrollY");
  if(Math.Abs((long)dx)>12000||Math.Abs((long)dy)>12000)throw new Fault("invalid_arguments","Scroll delta exceeds 12,000.");
  Snapshots.Clear();Foreground(t);Hit(t,p);Move(p);VerifyForeground(t);if(dy!=0)Mouse(0x800,unchecked((uint)-dy));if(dx!=0)Mouse(0x1000,unchecked((uint)dx));
  return new{scrolled=true,reobserve=true};
 }
 static object Drag(JsonElement a){
  var(t,s)=Observe(a,true);var p=Point(a,"from_x","from_y",s);var end=Point(a,"to_x","to_y",s);
  Snapshots.Clear();Foreground(t);Hit(t,p);Hit(t,end);Move(p);bool held=false;
  try{Mouse(2);held=true;for(int i=1;i<=20;i++){VerifyForeground(t);Move((p.X+(end.X-p.X)*i/20,p.Y+(end.Y-p.Y)*i/20));Thread.Sleep(10);}}
  finally{if(held)Mouse(4);}return new{dragged=true,reobserve=true};
 }
 static object SetValue(JsonElement a){
  var(t,s)=Observe(a);var n=Indexed(s,a);var value=Str(a,"value",true);if(value.Length>100000)throw new Fault("invalid_arguments","Value exceeds 100,000 chars.");
  if(!n.Element.TryGetCurrentPattern(ValuePattern.Pattern,out var p)||((ValuePattern)p).Current.IsReadOnly)throw new Fault("unsupported_pattern","Element has no writable ValuePattern.");
  Snapshots.Clear();Foreground(t);VerifyForeground(t);Indexed(s,a);((ValuePattern)p).SetValue(value);return new{value_set=true,reobserve=true};
 }
 static object Secondary(JsonElement a){
  var(t,s)=Observe(a);var n=Indexed(s,a);var action=Str(a,"action").Trim().ToLowerInvariant();
  if(!Actions(n.Element).Any(v=>v.Equals(action,StringComparison.OrdinalIgnoreCase)))throw new Fault("unsupported_action","Action is not exposed by observed element.");
  Snapshots.Clear();Foreground(t);VerifyForeground(t);Indexed(s,a);
  switch(action){
   case "invoke":((InvokePattern)n.Element.GetCurrentPattern(InvokePattern.Pattern)).Invoke();break;
   case "expand":((ExpandCollapsePattern)n.Element.GetCurrentPattern(ExpandCollapsePattern.Pattern)).Expand();break;
   case "collapse":((ExpandCollapsePattern)n.Element.GetCurrentPattern(ExpandCollapsePattern.Pattern)).Collapse();break;
   case "toggle":((TogglePattern)n.Element.GetCurrentPattern(TogglePattern.Pattern)).Toggle();break;
   case "select":((SelectionItemPattern)n.Element.GetCurrentPattern(SelectionItemPattern.Pattern)).Select();break;
   case "raise":((WindowPattern)n.Element.GetCurrentPattern(WindowPattern.Pattern)).SetWindowVisualState(WindowVisualState.Normal);break;
   case "scroll up":((ScrollPattern)n.Element.GetCurrentPattern(ScrollPattern.Pattern)).Scroll(ScrollAmount.NoAmount,ScrollAmount.SmallDecrement);break;
   case "scroll down":((ScrollPattern)n.Element.GetCurrentPattern(ScrollPattern.Pattern)).Scroll(ScrollAmount.NoAmount,ScrollAmount.SmallIncrement);break;
   case "scroll left":((ScrollPattern)n.Element.GetCurrentPattern(ScrollPattern.Pattern)).Scroll(ScrollAmount.SmallDecrement,ScrollAmount.NoAmount);break;
   case "scroll right":((ScrollPattern)n.Element.GetCurrentPattern(ScrollPattern.Pattern)).Scroll(ScrollAmount.SmallIncrement,ScrollAmount.NoAmount);break;
   default:throw new Fault("unsupported_action","Use set_value for Set Value.");
  }return new{performed=true,reobserve=true};
 }
 static void Move((int X,int Y) p){
  int l=Native.GetSystemMetrics(76),t=Native.GetSystemMetrics(77),w=Native.GetSystemMetrics(78),h=Native.GetSystemMetrics(79);
  if(w<=1||h<=1||p.X<l||p.X>=l+w||p.Y<t||p.Y>=t+h)throw new Fault("coordinate_off_desktop","Point outside virtual desktop.");
  Send(new(){Type=0,Union=new(){Mouse=new(){Dx=(int)Math.Round((p.X-l)*65535d/(w-1)),Dy=(int)Math.Round((p.Y-t)*65535d/(h-1)),Flags=0xc001}}});
 }
 static void Mouse(uint flags,uint data=0)=>Send(new(){Type=0,Union=new(){Mouse=new(){Flags=flags,MouseData=data}}});
 static (uint Down,uint Up) MouseFlags(string s)=>s.ToLowerInvariant()switch{"left" or "l"=>(2,4),"right" or "r"=>(8,16),"middle" or "m"=>(32,64),_=>throw new Fault("invalid_button","Button must be left, right or middle.")};
 static bool Extended(ushort k)=>k is 0x21 or 0x22 or 0x23 or 0x24 or 0x25 or 0x26 or 0x27 or 0x28 or 0x2d or 0x2e or 0x6f or 0xa3 or 0xa5;
 static void Key(ushort k,bool up)=>Send(new(){Type=1,Union=new(){Keyboard=new(){Vk=(ushort)(k&0xff),Flags=(up?2u:0u)|((k>0xff||Extended(k))?1u:0u)}}});
 static void Unicode(char c,bool up)=>Send(new(){Type=1,Union=new(){Keyboard=new(){Scan=c,Flags=4u|(up?2u:0u)}}});
 static void Send(Native.INPUT i){if(Native.SendInput(1,[i],Marshal.SizeOf<Native.INPUT>())!=1)throw new Fault("input_failed","SendInput rejected event; outcome may be partial. Reobserve.");}
 static ushort[] Chord(string chord){
  var p=chord.Split('+',StringSplitOptions.TrimEntries);if(p.Length==0||p.Length>6||p.Any(string.IsNullOrWhiteSpace))throw new Fault("invalid_key","Use non-empty + separated chord.");
  return p.Select(s=>Keys.TryGetValue(s,out var k)?k:s.Length==1&&char.IsAsciiLetterOrDigit(s[0])?(ushort)char.ToUpperInvariant(s[0]):throw new Fault("invalid_key","Unsupported key: "+s)).ToArray();
 }
 static Dictionary<string,ushort> BuildKeys(){
  var k=new Dictionary<string,ushort>(StringComparer.OrdinalIgnoreCase);void Add(ushort c,params string[] n){foreach(var s in n)k[s]=c;}
  Add(0x11,"Control","Ctrl","Control_L");Add(0xa3,"Control_R");Add(0x10,"Shift","Shift_L");Add(0xa1,"Shift_R");Add(0x12,"Alt","Alt_L");Add(0xa5,"Alt_R");
  Add(0x0d,"Return","Enter");Add(0x10d,"KP_Enter","Numpad_Enter");Add(9,"Tab");Add(0x1b,"Escape","Esc");Add(8,"BackSpace");Add(0x20,"space","Spacebar");
  Add(0x25,"Left");Add(0x26,"Up");Add(0x27,"Right");Add(0x28,"Down");Add(0x24,"Home");Add(0x23,"End");Add(0x21,"Prior","PageUp");Add(0x22,"Next","PageDown");Add(0x2d,"Insert");Add(0x2e,"Delete");
  Add(0x6a,"KP_Multiply","Numpad_Multiply");Add(0x6b,"KP_Add","Numpad_Add");Add(0x6d,"KP_Subtract","Numpad_Subtract");Add(0x6e,"KP_Decimal","Numpad_Decimal");Add(0x6f,"KP_Divide","Numpad_Divide");
  Add(0xbe,"period","greater");Add(0xbc,"comma","less");Add(0xbf,"slash","question");Add(0xbb,"equal","plus");Add(0xbd,"minus","underscore");Add(0xba,"semicolon","colon");Add(0xde,"apostrophe","quotedbl");Add(0xdb,"bracketleft","braceleft");Add(0xdd,"bracketright","braceright");Add(0xdc,"backslash","bar");Add(0xc0,"grave","asciitilde");
  for(ushort i=0;i<24;i++)Add((ushort)(0x70+i),"F"+(i+1));for(ushort i=0;i<10;i++)Add((ushort)(0x60+i),"KP_"+i,"Numpad_"+i);return k;
 }
}
