using Microsoft.Win32;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Xml;
using Windows.Management.Deployment;
namespace ComputerUse.NativeHost;
internal sealed record AppEntry(string Id,string Name,string Kind);
internal static partial class Program{
 static readonly Dictionary<string,AppEntry> Catalog=new(StringComparer.OrdinalIgnoreCase);
 static List<AppEntry> InstalledApps(){
  var entries=new Dictionary<string,AppEntry>(StringComparer.OrdinalIgnoreCase);
  void Add(string? exe,string? name){
   if(exe is null)return;exe=Environment.ExpandEnvironmentVariables(exe.Trim().Trim('"'));
   if(Path.IsPathFullyQualified(exe)&&exe.EndsWith(".exe",StringComparison.OrdinalIgnoreCase)&&File.Exists(exe))entries[exe]=new(exe,name??Path.GetFileNameWithoutExtension(exe),"executable");
  }
  foreach(var hive in new[]{Registry.CurrentUser,Registry.LocalMachine}){
   using var root=hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths");
   if(root is null)continue;
   foreach(var sub in root.GetSubKeyNames().Take(1000)){using var key=root.OpenSubKey(sub);Add(key?.GetValue(null) as string,Path.GetFileNameWithoutExtension(sub));}
  }
  object? shell=null;
  try{
   var type=Type.GetTypeFromProgID("WScript.Shell");if(type is not null)shell=Activator.CreateInstance(type);
   if(shell is not null)foreach(var root in new[]{Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu)}){
    if(!Directory.Exists(root))continue;
    foreach(var path in Directory.EnumerateFiles(root,"*.lnk",SearchOption.AllDirectories).Take(2000)){
     object? shortcut=null;
     try{shortcut=((dynamic)shell).CreateShortcut(path);Add((string)((dynamic)shortcut).TargetPath,Path.GetFileNameWithoutExtension(path));}catch{}
     finally{if(shortcut is not null&&Marshal.IsComObject(shortcut))Marshal.FinalReleaseComObject(shortcut);}
    }
   }
  }catch(UnauthorizedAccessException){}catch(IOException){}catch(COMException){}
  finally{if(shell is not null&&Marshal.IsComObject(shell))Marshal.FinalReleaseComObject(shell);}
  try{
   var manager=new PackageManager();foreach(var package in manager.FindPackagesForUser("").Take(500)){
    try{
     var family=package.Id.FamilyName;var manifest=Path.Combine(package.InstalledLocation.Path,"AppxManifest.xml");if(!File.Exists(manifest))continue;
     using var reader=XmlReader.Create(manifest,new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=4000000});
     while(reader.Read()){
      if(reader.NodeType!=XmlNodeType.Element||reader.LocalName!="Application")continue;var id=reader.GetAttribute("Id");
      if(string.IsNullOrWhiteSpace(id))continue;var aumid="aumid:"+family+"!"+id;entries[aumid]=new(aumid,package.DisplayName+" ("+id+")","packaged");
     }
    }catch(UnauthorizedAccessException){}catch(IOException){}catch(COMException){}catch(XmlException){}
   }
  }catch(UnauthorizedAccessException){}catch(COMException){}
  Catalog.Clear();foreach(var e in entries.Values)Catalog[e.Id]=e;return entries.Values.ToList();
 }
 static object CatalogApps(){
  var windows=Inventory();var apps=InstalledApps().ToDictionary(a=>a.Id,StringComparer.OrdinalIgnoreCase);
  foreach(var g in windows.GroupBy(t=>t.App,StringComparer.OrdinalIgnoreCase))apps.TryAdd(g.Key,new(g.Key,Path.GetFileNameWithoutExtension(g.Key),"running"));
  return apps.Values.Select(a=>new{id=a.Id,display_name=a.Name,kind=a.Kind,is_running=windows.Any(t=>t.App.Equals(a.Id,StringComparison.OrdinalIgnoreCase)),
   windows=windows.Where(t=>t.App.Equals(a.Id,StringComparison.OrdinalIgnoreCase)).Select(WindowObject).ToArray()}).ToArray();
 }
 static object ActivatePackaged(string id){
  if(!Catalog.TryGetValue(id,out var app)||app.Kind!="packaged")throw new Fault("unknown_app","Select a packaged app returned by list_apps before launching.");
  var manager=(IApplicationActivationManager)new ApplicationActivationManager();
  try{Marshal.ThrowExceptionForHR(manager.ActivateApplication(id[6..],null,0,out var pid));return new{launched=true,process_id=pid,next="Call list_windows and choose returned window."};}
  finally{Marshal.FinalReleaseComObject(manager);}
 }
 [ComImport,Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]class ApplicationActivationManager{}
 [ComImport,Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IApplicationActivationManager{
  [PreserveSig]int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)]string app,[MarshalAs(UnmanagedType.LPWStr)]string? arguments,uint options,out uint processId);
  [PreserveSig]int ActivateForFile(IntPtr app,IntPtr items,IntPtr verb,out uint processId);
  [PreserveSig]int ActivateForProtocol(IntPtr app,IntPtr items,out uint processId);
 }
}
