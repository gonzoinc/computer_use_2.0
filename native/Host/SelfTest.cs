using System.Runtime.InteropServices;
namespace ComputerUse.NativeHost;
internal static partial class Program{
 static int SelfTest(){
  var checks=new List<string>();void Assert(bool ok,string label){if(!ok)throw new Exception("Self test failed: "+label);checks.Add(label);}
  void Reject(Action a,string code){try{a();throw new Exception("Expected rejection: "+code);}catch(Fault f){Assert(f.Code==code,code);}}
  try{
   Assert(Marshal.SizeOf<Native.INPUT>()==40,"Win64 INPUT layout");
   Assert(Marshal.SizeOf<Native.GUITHREADINFO>()==72,"Win64 GUITHREADINFO layout");
   var focusTarget=new Target(200,"editor.exe","Editor",10,new(0,0,800,600));
   var observedFocus=new[]{new FocusNodeStamp(2,new[]{17,42},"Unicode field","ControlType.Edit",new(30,30,430,53))};
   var authoritative=new FocusDescriptor(new[]{17,42},10,10,200,201,"Unicode field","ControlType.Edit",new(30,30,430,53),false,true,false,false);
   var binding=DecideFocusBinding(focusTarget,authoritative,observedFocus);
   Assert(binding.Accepted&&binding.Index==2&&!binding.Append,"owned authoritative focus binds despite false traversal focus flag");
   Assert(!DecideFocusBinding(focusTarget,null,observedFocus).Accepted,"null authoritative focus stays blocked");
   Assert(DecideFocusBinding(focusTarget,authoritative with{ProcessId=11},observedFocus).State=="outside-target","unowned UIA process focus stays blocked");
   Assert(DecideFocusBinding(focusTarget,authoritative with{NativeOwnerPid=11},observedFocus).State=="outside-target","actual native owner mismatch stays blocked");
   Assert(DecideFocusBinding(focusTarget,authoritative with{RootWindowId=999},observedFocus).State=="outside-target","different HWND-root focus stays blocked");
   Assert(DecideFocusBinding(focusTarget,authoritative with{Name="Changed field"},observedFocus).State=="fingerprint-changed","conflicting focus fingerprint stays blocked");
   Assert(DecideFocusBinding(focusTarget,authoritative,[observedFocus[0],observedFocus[0] with{Index=3}]).State=="conflicting-runtime-id","ambiguous focus runtime identity stays blocked");
   Assert(DecideFocusBinding(focusTarget,authoritative with{Password=true},observedFocus).State=="password-field","password focus stays blocked");
   Assert(DecideFocusBinding(focusTarget,authoritative with{Offscreen=true},observedFocus).State=="not-interactable","offscreen focus stays blocked");
   Assert(DecideFocusBinding(focusTarget,authoritative,Array.Empty<FocusNodeStamp>()).Append,"independently observed owned focus can be indexed outside control-view traversal");
   var owner=new Target(100,"owner.exe","Parent",10,new(0,0,400,300));var modal=new Target(101,"dialog.exe","Confirm",20,new(20,20,300,200));
   var candidates=new[]{new WindowCandidate(owner,0,true,true,0,"MainWindow"),new WindowCandidate(modal,100,true,true,0,"#32770"),
    new WindowCandidate(modal with{Id=102,Title="Floating Tool"},100,true,true,0x80,"ToolWindow"),
    new WindowCandidate(modal with{Id=103,Title="Tooltip"},100,true,true,0x08000080,"tooltips_class32"),
    new WindowCandidate(modal with{Id=104,Title="Hidden dialog"},100,true,false,0,"#32770"),
    new WindowCandidate(modal with{Id=105,Title="App palette"},100,true,true,0x40080,"AppWindow"),
    new WindowCandidate(modal with{Id=106,Title="Tool-styled modal"},100,true,true,0x80,"#32770")};
   var selected=SelectTargetableWindows(candidates);
   Assert(selected.Select(w=>w.Id).SequenceEqual(new long[]{100,101,105,106}),"owned modal window graph remains selectable; hidden/no-activate/tool layers excluded");
   Assert(selected.Single(w=>w.Id==101).App=="dialog.exe"&&selected.Single(w=>w.Id==101).Pid==20,"owned dialog retains its own process identity");
   Assert(ValidatePoint(2,3,new(-100,-50,200,150))==(-98,-47),"negative monitor origin");
   Reject(()=>ValidatePoint(-1,0,new(0,0,100,100)),"coordinate_outside");
   Reject(()=>ValidatePoint(100,0,new(0,0,100,100)),"coordinate_outside");
   Assert(Chord("Control_L+Shift_L+F12").SequenceEqual(new ushort[]{0x11,0x10,0x7b}),"modifier/function chord");
   Assert(Chord("KP_4")[0]==0x64,"numpad");Assert(Chord("KP_Enter")[0]==0x10d,"distinct extended numpad Enter");
   Reject(()=>Chord("Ctrl++a"),"invalid_key");Reject(()=>Chord("Win+R"),"invalid_key");
   Assert("🙂".Length==2,"Unicode surrogate pair preserves both UTF-16 units");
   var t=new Target(1,"test.exe","test",10,new(0,0,100,100));var s=new Snapshot(t){FrameId="frame"};
   Validate(s,t,"frame",true);Assert(true,"current frame");
   Reject(()=>Validate(s,t,"other",true),"stale_frame");Reject(()=>Validate(s,t,"frame",true,s.Captured.AddSeconds(31)),"stale_observation");
   Reject(()=>Validate(s,t with{Bounds=new(1,0,101,100)},"frame",true),"stale_observation");
   Reject(()=>Validate(s,t with{Pid=11},"frame",true),"stale_observation");
   Reject(()=>WgcCapture.CheckSize(100000,100000),"capture_too_large");
   Write(new{passed=true,checks,interactive_input_sent=false,user_content_captured=false});return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}
 }
}
