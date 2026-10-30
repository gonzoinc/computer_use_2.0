#!/usr/bin/env node
import {readFile,writeFile,mkdir,readdir,stat,copyFile,unlink,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=path.join(root,'.codex');
const stage=path.join(work,'marketplace');
const pluginRoot=path.join(stage,'plugins','computer-use-2');
const record=path.join(work,'plugin-stage-manifest.json');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
async function exists(p){try{await stat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function owned(relative){const resolved=path.resolve(stage,relative);if(!resolved.startsWith(stage+path.sep))throw new Error('Staging path escapes task-owned output.');return resolved;}
async function files(dir){
 const output=[];if(!await exists(dir))return output;
 for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Staging does not admit symlinks: '+full);if(entry.isDirectory())output.push(...await files(full));else if(entry.isFile())output.push(full);}
 return output;
}
async function main(){
 await mkdir(work,{recursive:true});
 if(await exists(path.join(root,'firefox','extension'))||await exists(path.join(root,'firefox','Host')))throw new Error('Obsolete Firefox extension/relay prototype is still present. Finish the direct Firefox adapter before staging.');
 const nativeDir=path.join(work,'native-host');
 if(!await exists(path.join(nativeDir,'ComputerUse.NativeHost.exe')))throw new Error('Build native host first with scripts/build.ps1.');
 const sources=[];
 const add=(source,target)=>sources.push({source:path.join(root,source),target:path.join(pluginRoot,target??source)});
 for(const f of ['plugin.json','mcp.json','.mcp.json','.codex-plugin/plugin.json','README.md','LICENSE','native/bridge.mjs','native/README.md','firefox/README.md'])add(f);
 for(const area of ['assets','docs'])for(const f of await files(path.join(root,area)))add(path.relative(root,f));
 for(const area of ['runtime','firefox','skills']){
  for(const f of await files(path.join(root,area))){
   const relative=path.relative(root,f);
   if(area!=='skills'&&(!f.endsWith('.mjs')||f.endsWith('.test.mjs')))continue;
   add(relative);
  }
 }
 for(const f of await files(nativeDir))if(/\.(exe|dll|json)$/i.test(f))sources.push({source:f,target:path.join(pluginRoot,'runtime','native',path.basename(f))});
 let prior=null;if(await exists(record))prior=JSON.parse(await readFile(record,'utf8'));
 const present=await files(stage);
 if(present.length){
  if(prior?.sourceRoot!==root||prior?.stageRoot!==stage)throw new Error('Existing stage has no matching task ownership record; preserved without changes.');
  const known=new Map(prior.files.map(f=>[f.path,f.sha256]));
  for(const f of present){const relative=path.relative(stage,f);if(!known.has(relative)||hash(await readFile(f))!==known.get(relative))throw new Error('Unmanaged or modified stage file preserved: '+relative);}
  for(const f of prior.files){const full=owned(f.path);if(await exists(full))await unlink(full);}
 }
 const generated=[];
 for(const entry of sources){await mkdir(path.dirname(entry.target),{recursive:true});await copyFile(entry.source,entry.target);generated.push(entry.target);}
 const marketplace={name:'computer-use-2-local',interface:{displayName:'Computer-Use 2.0 Local'},plugins:[{name:'computer-use-2',source:{source:'local',path:'./plugins/computer-use-2'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}]};
 const catalog=path.join(stage,'.agents','plugins','marketplace.json');await mkdir(path.dirname(catalog),{recursive:true});await writeFile(catalog,JSON.stringify(marketplace,null,2)+'\n');generated.push(catalog);
 const notices=path.join(pluginRoot,'runtime','native','THIRD-PARTY-NOTICES.txt');
 await writeFile(notices,'Computer-Use 2.0 includes Microsoft Windows SDK .NET projection and WinRT.Runtime runtime assemblies from Microsoft.Windows.SDK.NET.Ref 10.0.19041.57.\nWindows SDK license: https://aka.ms/WinSDKLicenseURL\nThe independent plugin does not include OpenAI Computer Use binaries or @oai/sky.\n');generated.push(notices);
 const metadata={sourceRoot:root,stageRoot:stage,files:await Promise.all(generated.map(async f=>({path:path.relative(stage,f),sha256:hash(await readFile(f))})))};
 await writeFile(record,JSON.stringify(metadata,null,2)+'\n');
 console.log(JSON.stringify({prepared:true,marketplaceRoot:stage,pluginRoot,files:metadata.files.length,registered:false,installed:false,enabled:false},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
