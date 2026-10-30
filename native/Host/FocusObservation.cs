using System.Runtime.InteropServices;
using System.Windows.Automation;
namespace ComputerUse.NativeHost;

internal sealed record FocusDescriptor(int[] RuntimeId,int ProcessId,uint NativeOwnerPid,long RootWindowId,long NativeWindowId,string Name,string Type,Rect Bounds,bool Password,bool Enabled,bool Offscreen,bool ReportsKeyboardFocus);
internal sealed record FocusNodeStamp(int Index,int[] RuntimeId,string Name,string Type,Rect Bounds);
internal sealed record FocusDecision(bool Accepted,string State,int? Index=null,bool Append=false);
internal sealed record FocusCapture(string? Row,string? Selection,string? Document,object Diagnostics);

internal static partial class Program {
 // The global focused-element query is independent of per-node HasKeyboardFocus reports.
 // No display text is read until process and actual native HWND ancestry are verified.
 static bool IsOwnedElement(AutomationElement element,Target target,out long nativeHwnd){
  nativeHwnd=0;
  try {
   if(element.Current.ProcessId!=(int)target.Pid)return false;
   var walker=TreeWalker.RawViewWalker;var current=element;
   for(int i=0;i<64&&current is not null;i++,current=walker.GetParent(current)){
    var raw=current.Current.NativeWindowHandle;if(raw==0)continue;
    var h=new IntPtr(unchecked((long)(uint)raw));
    if(!Native.IsWindow(h))return false;
    Native.GetWindowThreadProcessId(h,out var pid);
    if(pid!=target.Pid||Native.GetAncestor(h,2).ToInt64()!=target.Id)return false;
    nativeHwnd=h.ToInt64();return true;
   }
  }catch(ElementNotAvailableException){}catch(InvalidOperationException){}catch(COMException){}
  return false;
 }
 static FocusDecision DecideFocusBinding(Target target,FocusDescriptor? focus,IReadOnlyList<FocusNodeStamp> observed){
  if(focus is null)return new(false,"unavailable");
  if(focus.ProcessId!=(int)target.Pid||focus.NativeOwnerPid!=target.Pid||focus.RootWindowId!=target.Id||focus.NativeWindowId==0)return new(false,"outside-target");
  if(focus.Password)return new(false,"password-field");
  if(!focus.Enabled||focus.Offscreen||focus.Bounds.Width<=0||focus.Bounds.Height<=0)return new(false,"not-interactable");
  var matches=observed.Where(n=>n.RuntimeId.SequenceEqual(focus.RuntimeId)).ToArray();
  if(matches.Length>1)return new(false,"conflicting-runtime-id");
  if(matches.Length==1){
   var node=matches[0];
   if(node.Name!=focus.Name||node.Type!=focus.Type||node.Bounds!=focus.Bounds)return new(false,"fingerprint-changed");
   return new(true,"bound",node.Index);
  }
  return new(true,"bound-separate-focus",Append:true);
 }
 static object NativeFocusDiagnostics(Target target){
  var thread=Native.GetWindowThreadProcessId(new(target.Id),out var selectedPid);
  var info=new Native.GUITHREADINFO{Size=(uint)Marshal.SizeOf<Native.GUITHREADINFO>()};
  if(thread==0||selectedPid!=target.Pid||!Native.GetGUIThreadInfo(thread,ref info))
   return new{query_succeeded=false,focus_in_target=false,focus_hwnd=(long?)null,error=Marshal.GetLastWin32Error()};
  var own=false;
  if(info.Focus!=IntPtr.Zero&&Native.IsWindow(info.Focus)){
   Native.GetWindowThreadProcessId(info.Focus,out var focusPid);
   own=focusPid==target.Pid&&Native.GetAncestor(info.Focus,2).ToInt64()==target.Id;
  }
  // Never expose handles from a different window/app, and never derive typing focus from this probe.
  return new{query_succeeded=true,focus_in_target=own,focus_hwnd=own?(long?)info.Focus.ToInt64():null,error=0};
 }
 static FocusCapture CaptureAuthoritativeFocus(Snapshot snapshot){
  snapshot.FocusRuntimeId=null;snapshot.FocusNodeIndex=null;
  var target=snapshot.Target;var native=NativeFocusDiagnostics(target);
  object Diagnostic(string state,int? index=null,bool? reported=null,int? hresult=null)=>new{
   source="AutomationElement.FocusedElement",state,matched_element_index=index,
   uia_reported_keyboard_focus=reported,native_thread=native,provider_hresult=hresult
  };
  if(!snapshot.WasForeground||Native.GetForegroundWindow().ToInt64()!=target.Id)
   return new(null,null,null,Diagnostic("background-not-queried"));
  try{
   var element=AutomationElement.FocusedElement;
   if(element is null)return new(null,null,null,Diagnostic("unavailable"));
   if(!IsOwnedElement(element,target,out var nativeHwnd))
    return new(null,null,null,Diagnostic("outside-target"));
   // The native HWND owner is checked before any name, selection or document reads.
   var current=element.Current;
   if(current.IsPassword)return new(null,null,null,Diagnostic("password-field"));
   Native.GetWindowThreadProcessId(new(nativeHwnd),out var actualPid);
   var descriptor=new FocusDescriptor(element.GetRuntimeId(),current.ProcessId,actualPid,
    Native.GetAncestor(new(nativeHwnd),2).ToInt64(),nativeHwnd,Cut(current.Name,300),
    current.ControlType.ProgrammaticName,UiaRect(current.BoundingRectangle),current.IsPassword,
    current.IsEnabled,current.IsOffscreen,current.HasKeyboardFocus);
   var decision=DecideFocusBinding(target,descriptor,snapshot.Nodes.Select((node,index)=>new FocusNodeStamp(index,node.RuntimeId,node.Name,node.Type,node.Bounds)).ToArray());
   if(!decision.Accepted)return new(null,null,null,Diagnostic(decision.State,reported:descriptor.ReportsKeyboardFocus));
   int index;
   if(decision.Append){
    if(snapshot.Nodes.Count>=1200)return new(null,null,null,Diagnostic("focus-node-limit",reported:descriptor.ReportsKeyboardFocus));
    index=snapshot.Nodes.Count;
    snapshot.Nodes.Add(new(element,descriptor.RuntimeId,descriptor.Name,descriptor.Type,descriptor.Bounds));
   }else index=decision.Index!.Value;
   snapshot.FocusRuntimeId=descriptor.RuntimeId.ToArray();snapshot.FocusNodeIndex=index;
   var row=$"[{index}] {descriptor.Type.Replace("ControlType.","")} {descriptor.Name}";
   string? selection=null,document=null;
   try{
    if(element.TryGetCurrentPattern(TextPattern.Pattern,out var pattern)){
     var text=(TextPattern)pattern;document=Cut(text.DocumentRange.GetText(12000),12000);
     selection=string.Join("\n",text.GetSelection().Take(8).Select(range=>Cut(range.GetText(2000),2000)));
    }
   }catch(ElementNotAvailableException){}catch(InvalidOperationException){}catch(COMException){}
   return new(row,selection,document,Diagnostic(decision.State,index,descriptor.ReportsKeyboardFocus));
  }catch(ElementNotAvailableException e){return new(null,null,null,Diagnostic("provider-unavailable",hresult:e.HResult));}
   catch(InvalidOperationException e){return new(null,null,null,Diagnostic("provider-error",hresult:e.HResult));}
   catch(COMException e){return new(null,null,null,Diagnostic("provider-error",hresult:e.HResult));}
 }
 static bool MatchesObservedFocus(AutomationElement element,Snapshot snapshot,Target target){
  if(snapshot.FocusNodeIndex is not int index||index<0||index>=snapshot.Nodes.Count||snapshot.FocusRuntimeId is null)return false;
  if(!IsOwnedElement(element,target,out _))return false;
  try{
   var expected=snapshot.Nodes[index];var actual=element.Current;
   return !actual.IsPassword&&actual.IsEnabled&&!actual.IsOffscreen&&
    snapshot.FocusRuntimeId.SequenceEqual(element.GetRuntimeId())&&
    Cut(actual.Name,300)==expected.Name&&actual.ControlType.ProgrammaticName==expected.Type&&
    UiaRect(actual.BoundingRectangle)==expected.Bounds;
  }catch(ElementNotAvailableException){}catch(InvalidOperationException){}catch(COMException){}
  return false;
 }
}
