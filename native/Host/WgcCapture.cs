using System.Runtime.InteropServices;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;
using WinRT;
namespace ComputerUse.NativeHost;
internal sealed record CaptureResult(byte[] Png,int Width,int Height,Rect Bounds,string Method,string Limitations);
internal static class WgcCapture{
 internal static bool IsSupported(){try{return GraphicsCaptureSession.IsSupported();}catch{return false;}}
 internal static void CheckSize(int w,int h){if(w<=0||h<=0||w>8192||h>8192||(long)w*h>24000000)throw new Fault("capture_too_large","Capture exceeds 24 MP or dimension 8192.");}
 // All WinRT capture work runs in an MTA; the host main thread remains STA for UIA.
 internal static Task<CaptureResult> Capture(IntPtr hwnd,Rect outer)=>Task.Run(()=>CaptureMta(hwnd,outer));
 static async Task<CaptureResult> CaptureMta(IntPtr hwnd,Rect outer){
  if(!IsSupported())throw new Fault("wgc_unsupported","Windows Graphics Capture is unavailable.");
  var item=CreateItem(hwnd);CheckSize(item.Size.Width,item.Size.Height);
  using var device=CreateDevice();
  using var pool=Direct3D11CaptureFramePool.CreateFreeThreaded(device,DirectXPixelFormat.B8G8R8A8UIntNormalized,2,item.Size);
  using var session=pool.CreateCaptureSession(item);
  // Preserve OS capture borders and permission enforcement; do not disable capture protections.
  session.StartCapture();
  var deadline=DateTime.UtcNow.AddSeconds(4);Direct3D11CaptureFrame? frame=null;
  while(frame is null&&DateTime.UtcNow<deadline){frame=pool.TryGetNextFrame();if(frame is null)await Task.Delay(15).ConfigureAwait(false);}
  if(frame is null)throw new Fault("wgc_timeout","No Windows Graphics Capture frame arrived within 4 seconds.");
  using(frame){
   var size=frame.ContentSize;CheckSize(size.Width,size.Height);
   if(size.Width!=item.Size.Width||size.Height!=item.Size.Height)throw new Fault("wgc_resize","Window resized during capture; reobserve.");
   using var bitmap=await SoftwareBitmap.CreateCopyFromSurfaceAsync(frame.Surface,BitmapAlphaMode.Ignore);if(bitmap.PixelWidth!=size.Width||bitmap.PixelHeight!=size.Height)throw new Fault("wgc_resize","Capture surface and content geometry differ; reobserve.");
   using var stream=new InMemoryRandomAccessStream();
   var encoder=await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId,stream);encoder.SetSoftwareBitmap(bitmap);await encoder.FlushAsync();
   if(stream.Size>32000000)throw new Fault("capture_too_large","Encoded PNG exceeds 32 MB.");
   stream.Seek(0);using var reader=new DataReader(stream.GetInputStreamAt(0));await reader.LoadAsync((uint)stream.Size);
   var data=new byte[(int)stream.Size];reader.ReadBytes(data);
   // WGC HWND frames use DWM extended frame bounds rather than invisible resize margins.
   var bounds=outer;
   if(DwmGetWindowAttribute(hwnd,9,out Rect extended,Marshal.SizeOf<Rect>())==0&&extended.Width==size.Width&&extended.Height==size.Height)bounds=extended;
   else if(outer.Width!=size.Width||outer.Height!=size.Height)throw new Fault("wgc_geometry_unverified","Cannot map captured pixels to verified HWND geometry.");
   return new(data,size.Width,size.Height,bounds,"Windows.Graphics.Capture","Occluded-window capture supported by WGC. Protected/minimized windows and GPU/device loss can still fail. Capture border follows OS policy.");
  }
 }
 static IDirect3DDevice CreateDevice(){
  IntPtr native=IntPtr.Zero,context=IntPtr.Zero,dxgi=IntPtr.Zero,abi=IntPtr.Zero;
  try{
   var hr=D3D11CreateDevice(IntPtr.Zero,1,IntPtr.Zero,0x20,IntPtr.Zero,0,7,out native,out _,out context);
   if(hr<0){if(native!=IntPtr.Zero){Marshal.Release(native);native=IntPtr.Zero;}if(context!=IntPtr.Zero){Marshal.Release(context);context=IntPtr.Zero;}hr=D3D11CreateDevice(IntPtr.Zero,5,IntPtr.Zero,0x20,IntPtr.Zero,0,7,out native,out _,out context);}if(hr<0)Marshal.ThrowExceptionForHR(hr);
   var iid=new Guid("54EC77FA-1377-44E6-8C32-88FD5F44C84C");Marshal.ThrowExceptionForHR(Marshal.QueryInterface(native,in iid,out dxgi));
   Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgi,out abi));return MarshalInterface<IDirect3DDevice>.FromAbi(abi);
  }finally{if(abi!=IntPtr.Zero)Marshal.Release(abi);if(dxgi!=IntPtr.Zero)Marshal.Release(dxgi);if(context!=IntPtr.Zero)Marshal.Release(context);if(native!=IntPtr.Zero)Marshal.Release(native);}
 }
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int CreateForWindowDelegate(IntPtr self,IntPtr hwnd,ref Guid iid,out IntPtr result);
 static GraphicsCaptureItem CreateItem(IntPtr hwnd){
  IntPtr name=IntPtr.Zero,factory=IntPtr.Zero,item=IntPtr.Zero;
  try{
   const string className="Windows.Graphics.Capture.GraphicsCaptureItem";Marshal.ThrowExceptionForHR(WindowsCreateString(className,className.Length,out name));
   var interop=new Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356");Marshal.ThrowExceptionForHR(RoGetActivationFactory(name,ref interop,out factory));
   var table=Marshal.ReadIntPtr(factory);var create=Marshal.GetDelegateForFunctionPointer<CreateForWindowDelegate>(Marshal.ReadIntPtr(table,3*IntPtr.Size));
   var iid=new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");Marshal.ThrowExceptionForHR(create(factory,hwnd,ref iid,out item));
   return MarshalInspectable<GraphicsCaptureItem>.FromAbi(item);
  }finally{if(item!=IntPtr.Zero)Marshal.Release(item);if(factory!=IntPtr.Zero)Marshal.Release(factory);if(name!=IntPtr.Zero)WindowsDeleteString(name);}
 }
 [DllImport("d3d11.dll")]static extern int D3D11CreateDevice(IntPtr adapter,int driver,IntPtr software,uint flags,IntPtr levels,uint count,uint version,out IntPtr device,out uint level,out IntPtr context);
 [DllImport("d3d11.dll")]static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgi,out IntPtr device);
 [DllImport("combase.dll",CharSet=CharSet.Unicode)]static extern int WindowsCreateString(string value,int length,out IntPtr hstring);
 [DllImport("combase.dll")]static extern int WindowsDeleteString(IntPtr hstring);
 [DllImport("combase.dll")]static extern int RoGetActivationFactory(IntPtr name,ref Guid iid,out IntPtr factory);
 [DllImport("dwmapi.dll")]static extern int DwmGetWindowAttribute(IntPtr hwnd,uint attr,out Rect value,int size);
}
