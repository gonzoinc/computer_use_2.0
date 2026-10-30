using System.Runtime.InteropServices;
using System.Text;
namespace ComputerUse.NativeHost;
internal static class Native{
 [StructLayout(LayoutKind.Sequential)]internal struct POINT{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)]internal struct INPUT{public uint Type;public INPUTUNION Union;}
 [StructLayout(LayoutKind.Explicit)]internal struct INPUTUNION{[FieldOffset(0)]public MOUSEINPUT Mouse;[FieldOffset(0)]public KEYBDINPUT Keyboard;}
 [StructLayout(LayoutKind.Sequential)]internal struct MOUSEINPUT{public int Dx,Dy;public uint MouseData,Flags,Time;public UIntPtr ExtraInfo;}
 [StructLayout(LayoutKind.Sequential)]internal struct KEYBDINPUT{public ushort Vk,Scan;public uint Flags,Time;public UIntPtr ExtraInfo;}
 [StructLayout(LayoutKind.Sequential)]internal struct GUITHREADINFO{public uint Size,Flags;public IntPtr Active,Focus,Capture,MenuOwner,MoveSize,Caret;public Rect CaretRect;}
 internal delegate bool EnumWindowProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll",SetLastError=true)]internal static extern bool GetGUIThreadInfo(uint thread,ref GUITHREADINFO info);
 [DllImport("user32.dll")]internal static extern bool EnumWindows(EnumWindowProc callback,IntPtr p);
 [DllImport("user32.dll")]internal static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")]internal static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]internal static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")]internal static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]internal static extern IntPtr GetWindow(IntPtr h,uint c);
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]internal static extern IntPtr GetWindowLongPtr(IntPtr h,int index);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="GetClassNameW")]internal static extern int GetClassName(IntPtr h,StringBuilder name,int max);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="GetWindowTextW")]internal static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll",EntryPoint="GetWindowTextLengthW")]internal static extern int GetWindowTextLength(IntPtr h);
 [DllImport("user32.dll")]internal static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")]internal static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]internal static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]internal static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")]internal static extern IntPtr GetThreadDpiAwarenessContext();
 [DllImport("user32.dll")]internal static extern bool AreDpiAwarenessContextsEqual(IntPtr a,IntPtr b);
 [DllImport("user32.dll")]internal static extern bool PrintWindow(IntPtr h,IntPtr dc,uint f);
 [DllImport("user32.dll")]internal static extern uint SendInput(uint count,INPUT[] inputs,int size);
 [DllImport("user32.dll")]internal static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")]internal static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]internal static extern int GetSystemMetrics(int metric);
 [DllImport("user32.dll")]internal static extern IntPtr OpenInputDesktop(uint f,bool inherit,uint access);
 [DllImport("user32.dll")]internal static extern bool CloseDesktop(IntPtr d);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="GetUserObjectInformationW")]internal static extern bool GetUserObjectInformation(IntPtr obj,int i,StringBuilder s,int length,out int needed);
 [DllImport("user32.dll")]internal static extern short GetAsyncKeyState(int key);
 [DllImport("kernel32.dll")]internal static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll")]internal static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,EntryPoint="QueryFullProcessImageNameW")]internal static extern bool QueryFullProcessImageName(IntPtr p,uint flags,StringBuilder s,ref int n);
 [DllImport("advapi32.dll")]internal static extern bool OpenProcessToken(IntPtr p,uint access,out IntPtr token);
 [DllImport("advapi32.dll")]internal static extern bool GetTokenInformation(IntPtr token,int i,IntPtr info,int length,out int needed);
 [DllImport("advapi32.dll")]internal static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")]internal static extern IntPtr GetSidSubAuthority(IntPtr sid,uint i);
}
