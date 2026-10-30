import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeBridge,NativeTools} from './bridge.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('native definitions expose supported methods with strict object schemas',()=>{
 assert.equal(NativeTools.length,14);
 assert.equal(new Set(NativeTools.map(t=>t.name)).size,14);
 assert(NativeTools.every(t=>t.inputSchema.type==='object'&&t.inputSchema.additionalProperties===false));
 assert(NativeTools.some(t=>t.method==='get_window_state'));
});
test('bridge rejects missing project root',()=>{
 assert.throws(()=>new NativeBridge(),/projectRoot/);
});
test('already cancelled request never launches the host',async()=>{
 const bridge=new NativeBridge({projectRoot:root});const abort=new AbortController();abort.abort();
 await assert.rejects(bridge.call('status',{}, {signal:abort.signal}),e=>e.code==='cancelled');
 assert.equal(bridge.child,null);
});
test('native JSONL status, errors and graceful close do not capture content or inject input',async t=>{
 const bridge=new NativeBridge({projectRoot:root});t.after(()=>bridge.close());
 const status=await bridge.status();
 assert.equal(status.platform,'windows');assert.equal(status.dpi_aware,true);
 assert.equal(status.capture.primary,'Windows.Graphics.Capture');
 assert.equal(status.methods.length,13);
 await assert.rejects(bridge.call('get_window',{id:1,app:'not-a-real-app.exe'}),e=>e.code==='unknown_window');
 await assert.rejects(bridge.call('definitely_missing',{}),e=>e.code==='unknown_method');
 const status2=await bridge.status();assert.equal(status2.version,'0.1.0');
 await bridge.close();assert.equal(bridge.child,null);
});
