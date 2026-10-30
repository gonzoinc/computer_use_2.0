#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stage=path.join(root,'.codex','marketplace','plugins','computer-use-2');
const entry=JSON.parse(await readFile(path.join(stage,'mcp.json'),'utf8')).mcpServers.computer_use_2;
const expand=s=>s.replaceAll('${PLUGIN_ROOT}',stage);
const child=spawn(entry.command,entry.args.map(expand),{cwd:expand(entry.cwd),windowsHide:true,stdio:['pipe','pipe','pipe']});
let buffer='',errors='';const pending=new Map();
child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
child.stderr.on('data',s=>{errors+=s;});
child.stdout.on('data',s=>{buffer+=s;let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!line.trim())continue;const response=JSON.parse(line);const p=pending.get(response.id);if(p){pending.delete(response.id);clearTimeout(p.timer);p.resolve(response);}}});
child.on('error',e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();});
const request=(id,method,params={})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Staged MCP response timeout: '+method)),10000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
try{
 const initialized=await request(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'staged-smoke',version:'1'}});
 assert.equal(initialized.result.serverInfo.name,'computer-use-2');
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const list=await request(2,'tools/list');const names=list.result.tools.map(t=>t.name);
 assert(names.includes('firefox_browser_connect'));assert(names.includes('firefox_browser_launch'));assert(names.includes('native_get_window_state'));
 assert(list.result.tools.every(t=>!Object.hasOwn(t,'method')));
 const status=await request(3,'tools/call',{name:'computer_use_status',arguments:{}});
 assert.equal(status.result.isError,false);
 const metadata=JSON.parse(status.result.content[0].text.split('\n').slice(1).join('\n'));
 assert.equal(metadata.native.platform,'windows');assert.equal(metadata.firefox.connected,false);
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.stdin.end();
 assert.deepEqual(await exit,{code:0,signal:null});assert.equal(errors,'');
 console.log(JSON.stringify({passed:true,stagedRoot:stage,toolCount:names.length,nativeHost:'bundled runtime/native',firefoxConnected:false,browserLaunched:false,userContentCaptured:false,globalConfigChanged:false},null,2));
}catch(error){child.kill();console.error(error);process.exitCode=1;}
