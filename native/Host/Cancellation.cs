using System.Threading;
namespace ComputerUse.NativeHost;
internal static partial class Program{
 static EventWaitHandle? CancelEvent;
 static void CheckStop(){
  if(CancelEvent?.WaitOne(0)==true)throw new Fault("cancelled","Computer use was cancelled; reobserve before continuing.");
  if((Native.GetAsyncKeyState(0x1b)&0x8000)!=0)throw new Fault("user_stopped","Escape is held; computer input stopped.");
 }
 static int SignalCancel(string name){
  if(!name.StartsWith("Local\\ComputerUse2-",StringComparison.Ordinal)||name.Length>120){Console.Error.WriteLine("Invalid cancellation event.");return 1;}
  try{using var e=EventWaitHandle.OpenExisting(name);e.Set();return 0;}catch(WaitHandleCannotBeOpenedException){return 0;}
 }
}
