import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMcpServer} from './mcp.mjs';
import {toolResult} from './result.mjs';
import {validate} from './validation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}};
const notified={jsonrpc:'2.0',method:'notifications/initialized'};
function harness(options={}){
 const sent=[];const native={status:async()=>({platform:'windows',verified:false}),call:async()=>({ok:true}),close:async()=>{}};
 const firefox={start:async()=>{},status:()=>({state:'idle',connected:false}),call:async()=>({ok:true}),close:async()=>{}};
 const server=createMcpServer({projectRoot:root,nativeBridge:native,firefoxBridge:firefox,send:m=>sent.push(m),...options});
 return {server,sent};
}
async function ready(server){await server.receive(init);await server.receive(notified);}
test('MCP initialization, readiness, method errors and public schemas',async t=>{
 const {server,sent}=harness();t.after(()=>server.close());
 await server.receive({jsonrpc:'2.0',id:0,method:'tools/list'});assert.equal(sent.pop().error.code,-32002);
 await ready(server);assert.equal(sent[0].result.protocolVersion,'2025-11-25');
 await server.receive({jsonrpc:'2.0',id:2,method:'tools/list'});
 const tools=sent.at(-1).result.tools;assert(tools.length>15);assert(tools.every(t=>!Object.hasOwn(t,'method')));
 assert(tools.some(t=>t.name==='native_get_window_state'));
 await server.receive({jsonrpc:'2.0',id:3,method:'missing'});assert.equal(sent.at(-1).error.code,-32601);
 await server.receive({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'native_get_window',arguments:{id:'1'}}});
 assert.equal(sent.at(-1).result.isError,true);assert.match(sent.at(-1).result.content[0].text,/INVALID_ARGUMENT/);
 await server.receive({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'not_a_tool',arguments:{}}});
 assert.equal(sent.at(-1).result.isError,true);
});
test('schema validator rejects nested unknown keys and integer overflow',()=>{
 const schema={type:'object',properties:{window:{type:'object',properties:{id:{type:'integer'}},required:['id'],additionalProperties:false}},required:['window'],additionalProperties:false};
 assert.throws(()=>validate({window:{id:1,bogus:true}},schema),/unknown/);
 assert.throws(()=>validate({window:{id:2**60}},schema),/integer/);
 assert.throws(()=>validate({window:{}},schema),/required/);
});
test('image adaptation emits one PNG block and preserves observation metadata',()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 const result=toolResult({snapshot_id:'snapshot',accessibility:{tree:'[0] Button'},screenshots:[{id:'frame',url:'data:image/png;base64,'+png,width:1,height:1}]});
 assert.equal(result.content.length,2);assert.equal(result.content[1].mimeType,'image/png');assert.equal(result.content[1].data,png);
 assert.match(result.content[0].text,/snapshot/);assert.match(result.content[0].text,/url_attached/);assert(!result.content[0].text.includes(png));
 assert.throws(()=>toolResult({url:'data:image/png;base64,!!!'}),/encoding/);
});
test('MCP asynchronous cancellation aborts active operation without replay',async t=>{
 let calls=0,closed=0;
 const native={status:async()=>({}),close:async()=>{closed++;},call:async(method,args,{signal})=>{calls++;return await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('cancelled'),{code:'CANCELLED'})),{once:true}));}};
 const nativeTools=[{name:'native_wait',method:'wait',description:'fixture',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
 const {server,sent}=harness({nativeBridge:native,nativeTools});t.after(()=>server.close());await ready(server);
 const pending=server.receive({jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'native_wait',arguments:{}}});
 await Promise.resolve();assert.equal(server.activeCount,1);
 await server.receive({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:9}});
 await pending;assert.equal(calls,1);assert.equal(sent.at(-1).id,9);assert.equal(sent.at(-1).result.isError,true);
 await server.close();assert.equal(closed,1);
});
test('portable and compatibility manifests agree on identity and stdio path arrays',async()=>{
 const plugin=JSON.parse(await readFile(path.join(root,'plugin.json'),'utf8'));
 const compatibility=JSON.parse(await readFile(path.join(root,'.codex-plugin','plugin.json'),'utf8'));
 const mcp=JSON.parse(await readFile(path.join(root,'mcp.json'),'utf8'));
 const legacy=JSON.parse(await readFile(path.join(root,'.mcp.json'),'utf8'));
 assert.match(plugin.name,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert.equal(plugin.name,compatibility.name);
 assert.equal(plugin.extensions['com.openai'].interface.displayName,'Computer-Use 2.0');
 assert.equal(compatibility.mcpServers,'./.mcp.json');assert.deepEqual(mcp.mcpServers,legacy.mcpServers);
 const entry=mcp.mcpServers.computer_use_2;
 assert(Array.isArray(entry.args));assert.equal(entry.args[0],'${PLUGIN_ROOT}/runtime/server.mjs');
 assert.equal(entry.cwd,'${PLUGIN_ROOT}');assert.equal(entry.command,'node');
});
test('actual stdio launches from manifest placeholder with spaces, handles MCP and cleans up',async t=>{
 const config=JSON.parse(await readFile(path.join(root,'mcp.json'),'utf8')).mcpServers.computer_use_2;
 const expand=s=>s.replaceAll('${PLUGIN_ROOT}',root);
 const child=spawn(config.command,config.args.map(expand),{cwd:expand(config.cwd),windowsHide:true,stdio:['pipe','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill();});
 let buffer='',diagnostics='';const responses=new Map(),waiters=new Map();
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stderr.on('data',s=>diagnostics+=s);
 child.stdout.on('data',s=>{buffer+=s;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line.trim())continue;const msg=JSON.parse(line);const fn=waiters.get(msg.id);if(fn){waiters.delete(msg.id);fn(msg);}else responses.set(msg.id,msg);}});
 const wait=id=>responses.has(id)?Promise.resolve(responses.get(id)):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('MCP response timeout '+id)),10000);waiters.set(id,m=>{clearTimeout(timer);resolve(m);});});
 const send=m=>child.stdin.write(JSON.stringify(m)+'\n');
 send(init);assert.equal((await wait(1)).result.serverInfo.name,'computer-use-2');send(notified);
 send({jsonrpc:'2.0',id:2,method:'tools/list'});assert((await wait(2)).result.tools.length>15);
 send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'native_status',arguments:{}}});
 assert.equal((await wait(3)).result.isError,false);
 child.stdin.write('{bad json}\n');assert.equal((await wait(null)).error.code,-32700);
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.stdin.end();
 assert.deepEqual(await exit,{code:0,signal:null});assert.equal(diagnostics,'');assert.equal(buffer,'');
});
