import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import net from 'node:net';
import { FirefoxBridge, FirefoxTools } from './direct-bridge.mjs';
import { stopOwnedFixture, configureProfile, inspectProfile } from './launcher.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = `function breakpointTarget(value) {
  const intermediate = value + 1;
  const result = intermediate * 2;
  return result;
}
window.breakpointTarget = breakpointTarget;
document.querySelector('#debug').onclick = () => { document.querySelector('#status').textContent = String(breakpointTarget(20)); };
console.log('CU2 native cached console', 42);
//# sourceMappingURL=script.js.map
`;
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>CU2 Direct RDP Fixture</title><style>#status{color:rgb(0, 90, 170);padding:8px}</style></head><body><p id="status">Ready</p><input id="field" value="original"><button id="button" onclick="document.querySelector('#status').textContent='clicked'">Click</button><button id="debug">Run debugger target</button><script src="/script.js"></script></body></html>`;
async function freePort() { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function until(check, timeout = 5000) { const start = Date.now(); while (true) { const value = await check(); if (value) return value; if (Date.now() - start > timeout) throw new Error('Condition not observed before timeout.'); await new Promise(resolve => setTimeout(resolve, 50)); } }

test('direct tool schemas preserve explicit targets, idle startup and cancellation', async () => {
  const bridge = new FirefoxBridge({ projectRoot: root });
  assert.equal((await bridge.start()).state, 'idle');
  assert.equal(bridge.connection, null);
  assert.equal(FirefoxTools.length, new Set(FirefoxTools.map(x => x.name)).size);
  await assert.rejects(bridge.call('dom.click', { selector: '#button' }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(bridge.call('tabs.list', { unknown: true }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(bridge.call('browser.connect', { host: '0.0.0.0', port: 6000 }), { code: 'INVALID_ARGUMENT' });
  const abort = new AbortController(); abort.abort();
  await assert.rejects(bridge.call('tabs.list', {}, { signal: abort.signal }), { code: 'CANCELLED' });
  await bridge.close();
});

test('real isolated Firefox: DOM CSS, native console/network, sources/maps, debugger, screenshot, navigation', { timeout: 90000, skip: process.platform !== 'win32' || process.env.CU2_FIREFOX_LIVE !== '1' }, async t => {
  const workArea = path.resolve(root, '.codex'); await fs.mkdir(workArea, { recursive: true });
  const profile = await fs.mkdtemp(path.join(workArea, 'firefox-rdp-test-'));
  await fs.writeFile(path.join(profile, 'user.js'), 'user_pref("devtools.debugger.remote-enabled", false);\nuser_pref("devtools.chrome.enabled", false);\nuser_pref("devtools.debugger.force-local", true);\nuser_pref("devtools.debugger.prompt-connection", false);\nuser_pref("browser.aboutwelcome.enabled", false);\nuser_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("datareporting.policy.dataSubmissionEnabled", false);\n');
  let child, bridge;
  const server = http.createServer((request, response) => {
    if (request.url === '/script.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script); }
    else if (request.url === '/script.js.map') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ version: 3, sources: ['original.ts'], names: [], mappings: script.split('\n').map((_, i) => i ? 'AACA' : 'AAAA').join(';'), sourcesContent: [script] })); }
    else if (request.url === '/ok.json') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ ok: true, expected: 42 })); }
    else if (request.url === '/missing') { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('CU2 expected missing'); }
    else if (request.url === '/unicode') { response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.end('😀é'); }
    else { response.setHeader('Content-Type', 'text/html'); response.end(fixture); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await bridge?.close(); await stopOwnedFixture(child ?? bridge?.launch?.child); await new Promise(resolve => server.close(resolve));
    const relative = path.relative(workArea, path.resolve(profile));
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Cleanup target must remain under owned project .codex.');
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const url = `http://127.0.0.1:${server.address().port}/`, port = await freePort();
  bridge = new FirefoxBridge({ projectRoot: root, port, requestTimeoutMs: 7000 });
  const pending = await bridge.call('browser.launch', { profilePath: profile, port, headless: true, url, configureProfile: true }, { timeoutMs: 15000 });
  assert.equal(pending.pending, true); assert.equal(pending.connected, false);
  const launched = await until(async () => {
    const status = await bridge.call('browser.status');
    if (status.connectionOperation?.error) throw new Error(JSON.stringify(status.connectionOperation.error));
    return status.connected && status;
  }, 30000); child = bridge.launch.child;
  assert.equal(launched.launch.profilePath, profile);
  await assert.rejects(configureProfile(profile, { remove: true }), { code: 'PROFILE_IN_USE' });
  const tab = await until(async () => (await bridge.call('tabs.list')).tabs.find(x => x.url === url)); const tabId = tab.tabId;
  console.log('RDP fixture tab', tabId);
  assert.equal((await bridge.call('tabs.attach', { tabId })).attached, true);
  const inspected = await bridge.call('dom.inspect', { tabId, selector: '#status' });
  assert.equal(inspected.nodes[0].text, 'Ready'); assert.equal(inspected.nodes[0].styles.color, 'rgb(0, 90, 170)');
  await bridge.call('dom.fill', { tabId, selector: '#field', value: 'native RDP field' });
  assert.equal((await bridge.call('page.evaluate', { tabId, expression: "document.querySelector('#field').value" })).value.text, 'native RDP field');
  await bridge.call('dom.style', { tabId, selector: '#status', property: 'color', value: 'rgb(200, 0, 0)' });
  assert.equal((await bridge.call('dom.inspect', { tabId, selector: '#status' })).nodes[0].styles.color, 'rgb(200, 0, 0)');
  await bridge.call('dom.click', { tabId, selector: '#button' });
  assert.equal((await bridge.call('dom.inspect', { tabId, selector: '#status' })).nodes[0].text, 'clicked');
  await assert.rejects(bridge.call('dom.click', { tabId, selector: 'button' }), { code: 'AMBIGUOUS_SELECTOR' });
  const cached = await bridge.call('console.read', { tabId }); assert.match(JSON.stringify(cached), /CU2 native cached console/);
  await bridge.call('page.evaluate', { tabId, expression: "console.error('CU2 native error resource');setTimeout(()=>{throw new Error('CU2 native page exception')},0);'scheduled'" });
  await until(async () => /CU2 native page exception/.test(JSON.stringify(await bridge.call('console.read', { tabId }))));
  assert.equal((await bridge.call('page.evaluate', { tabId, expression: "fetch('/ok.json').then(r=>r.text())", awaitPromise: true })).value.text, '{"ok":true,"expected":42}');
  await bridge.call('page.evaluate', { tabId, expression: "fetch('/missing').then(r=>r.status)", awaitPromise: true });
  const request = await until(async () => (await bridge.call('network.list', { tabId })).records.find(x => x.url?.endsWith('/ok.json')));
  assert.equal(Number((await until(async () => (await bridge.call('network.list', { tabId })).records.find(x => x.url?.endsWith('/missing') && x.status))).status), 404);
  const body = await until(async () => { try { return await bridge.call('network.body', { tabId, requestId: request.requestId }); } catch (e) { if (e.code === 'BODY_UNAVAILABLE') return false; throw e; } });
  assert.match(body.text, /"expected":42/);
  await bridge.call('page.evaluate', { tabId, expression: "fetch('/unicode').then(r=>r.text())", awaitPromise: true });
  const unicode = await until(async () => (await bridge.call('network.list', { tabId })).records.find(x => x.url?.endsWith('/unicode')));
  const boundedUnicode = await bridge.call('network.body', { tabId, requestId: unicode.requestId, maxBytes: 5 });
  assert.equal(boundedUnicode.text, '😀'); assert.equal(boundedUnicode.returnedBytes, 4); assert.equal(boundedUnicode.truncated, true);
  console.log('STAGE native response body passed');
  const sources = await bridge.call('sources.list', { tabId, limit: 500 });
  const source = sources.sources.find(x => x.url === `${url}script.js`); assert.ok(source, 'External source actor captured.');
  assert.match((await bridge.call('sources.read', { tabId, sourceId: source.actor })).text, /breakpointTarget/);
  console.log('STAGE source listing/read passed');
  const map = await bridge.call('sources.map', { tabId, sourceId: source.actor, generatedLine: 3, generatedColumn: 0, includeContent: true });
  assert.equal(map.original.originalLine, 3); assert.ok(map.sources[0].endsWith('/original.ts'));
  console.log('STAGE source map passed');
  const breakpoint = await bridge.call('debugger.setBreakpoint', { tabId, sourceId: source.actor, line: 3, originalSource: map.sources[0] });
  console.log('STAGE breakpoint set', JSON.stringify(breakpoint));
  // Trigger asynchronously: the click evaluation can remain in flight while a breakpoint pauses it.
  const trigger = bridge.call('page.evaluate', { tabId, expression: "setTimeout(()=>document.querySelector('#debug').click(),0);'triggered'" });
  await trigger;
  console.log('STAGE trigger evaluation returned');
  const pause = await bridge.call('debugger.waitForPause', { tabId }); console.log('PAUSE', JSON.stringify(pause));
  const stack = await bridge.call('debugger.stack', { tabId }); assert.ok(stack.frames.length > 0); console.log('FRAME', JSON.stringify(stack.frames[0]));
  const variables = await bridge.call('debugger.variables', { tabId, frameActor: stack.frames[0].actor }); assert.match(JSON.stringify(variables), /intermediate/);
  assert.equal((await bridge.call('page.evaluate', { tabId, expression: 'intermediate', frameActor: stack.frames[0].actor })).value, 21);
  await bridge.call('debugger.step', { tabId, kind: 'over' });
  const stepped = await bridge.call('debugger.stack', { tabId }); assert.ok(stepped.frames.length > 0);
  await bridge.call('debugger.removeBreakpoint', { tabId, breakpointId: breakpoint.breakpointId });
  await bridge.call('debugger.resume', { tabId });
  assert.equal((await bridge.call('debugger.pause', { tabId })).pause.why.type, 'interrupted');
  await bridge.call('debugger.resume', { tabId });
  const screenshot = await bridge.call('page.screenshot', { tabId }); assert.ok(screenshot.dataUrl.startsWith('data:image/png;base64,'));
  await bridge.call('tabs.navigate', { tabId, url: `${url}second` });
  assert.equal((await bridge.call('dom.inspect', { tabId, selector: '#status' })).nodes[0].text, 'Ready');
  await bridge.call('tabs.reload', { tabId });
  assert.equal((await bridge.call('dom.inspect', { tabId, selector: '#status' })).nodes[0].text, 'Ready');
  const windows = await bridge.call('windows.list'); assert.equal(windows.windows.length, 1);
  const created = await bridge.call('tabs.create', { windowId: windows.windows[0].windowId, url: `${url}created` }); assert.ok(created.tabId > 0); assert.equal(created.windowId, windows.windows[0].windowId);
  const controller = new AbortController();
  const waiting = bridge.call('page.evaluate', { tabId, expression: 'new Promise(()=>{})', awaitPromise: true }, { signal: controller.signal });
  const cancelled = assert.rejects(waiting, { code: 'CANCELLED' });
  setTimeout(() => controller.abort(), 30); await cancelled; assert.equal(bridge.status().connected, false);
  await bridge.call('browser.connect', { port, waitForConnection: true });
  assert.equal(bridge.status().attachedTabs.length, 0);
  assert.equal((await bridge.call('dom.inspect', { tabId, selector: '#status' })).nodes[0].text, 'Ready');
  await bridge.close(); await stopOwnedFixture(child);
  // Windows may release the already-stopped owned fixture's lock shortly after taskkill returns.
  // The production operation still refuses any locked/live profile; only this disposable test waits.
  const restored = await until(async () => { try { return await configureProfile(profile, { remove: true }); } catch (error) { if (error.code === 'PROFILE_IN_USE') return false; throw error; } }); assert.equal(restored.restored, true);
  assert.equal((await inspectProfile(profile)).prefs['devtools.debugger.remote-enabled'], false);
  assert.equal((await inspectProfile(profile)).prefs['devtools.chrome.enabled'], false);
});
