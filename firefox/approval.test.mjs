import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once, EventEmitter } from 'node:events';
import { FirefoxBridge } from './bridge.mjs';

const encode = value => { const body = Buffer.from(JSON.stringify(value)); return Buffer.concat([Buffer.from(`${body.length}:`), body]); };
async function fakeFirefox(t, { greetingDelay = 0, neverGreet = false, bridgeOptions = {} } = {}) {
  const sockets = new Set(), timers = new Set(); let accepted = 0;
  const server = net.createServer(socket => {
    accepted++; sockets.add(socket); server.emit('accepted'); socket.on('close', () => sockets.delete(socket));
    if (!neverGreet) { const timer = setTimeout(() => { timers.delete(timer); if (!socket.destroyed) socket.write(encode({ from: 'root', applicationType: 'browser', traits: {} })); }, greetingDelay); timers.add(timer); }
    let buffer = Buffer.alloc(0);
    socket.on('data', bytes => {
      buffer = Buffer.concat([buffer, bytes]); let colon;
      while ((colon = buffer.indexOf(58)) >= 0) {
        const length = Number(buffer.subarray(0, colon)); if (buffer.length < colon + 1 + length) return;
        const packet = JSON.parse(buffer.subarray(colon + 1, colon + 1 + length)); buffer = buffer.subarray(colon + 1 + length);
        socket.write(encode({ from: packet.to }));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const bridge = new FirefoxBridge({ requestTimeoutMs: 100, ...bridgeOptions });
  t.after(async () => { await bridge.close(); for (const timer of timers) clearTimeout(timer); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  return { bridge, port: server.address().port, server, get accepted() { return accepted; } };
}
test('one approval socket survives a delayed greeting beyond the former3-second retry cap and normal request timeout', { timeout: 10000 }, async t => {
  const f = await fakeFirefox(t, { greetingDelay: 3200 });
  const started = Date.now();
  const result = await f.bridge.call('browser.connect', { port: f.port, approvalTimeoutMs: 6000, startupTimeoutMs: 1000, waitForConnection: true }, { timeoutMs: 100 });
  assert.equal(result.connected, true); assert.ok(Date.now() - started >= 3000); assert.equal(f.accepted, 1, 'A pending human-approval socket must not be repeatedly replaced.');
});
test('a long human-approval wait remains cancellable and never opens a replacement prompt', async t => {
  const f = await fakeFirefox(t, { neverGreet: true }), controller = new AbortController();
  const accepted = once(f.server, 'accepted');
  const connecting = f.bridge.call('browser.connect', { port: f.port, approvalTimeoutMs: 60000, waitForConnection: true }, { signal: controller.signal });
  const rejection = assert.rejects(connecting, { code: 'CANCELLED' }); await accepted; controller.abort(); await rejection;
  await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(f.accepted, 1); assert.equal(f.bridge.status().connected, false);
});

const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settled(bridge) {
  const deadline = Date.now() + 2000;
  while (bridge.status().pending && Date.now() < deadline) await tick(10);
  assert.equal(bridge.status().pending, false); return bridge.call('browser.status');
}

// Simulate a listener that has not started yet without opening a real browser.
function refusedSocket() {
  const socket = new EventEmitter(); socket.setNoDelay = () => {};
  socket.destroy = () => { if (!socket.destroyed) { socket.destroyed = true; queueMicrotask(() => socket.emit('close')); } };
  queueMicrotask(() => socket.emit('error', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })));
  return socket;
}
const exitedLauncher = (exitCode = 0) => async args => ({ child: { exitCode }, pid: 123, profilePath: args.profilePath, port: args.port, forwardExisting: false, promptExpected: true });

test('launch waits for the debugger listener after a successful launcher exit and keeps one approval socket', async t => {
  let attempts = 0;
  const f = await fakeFirefox(t, { greetingDelay: 200, bridgeOptions: {
    launchBrowser: exitedLauncher(),
    createConnection(options) { attempts++; return attempts <= 2 ? refusedSocket() : net.createConnection(options); },
  } });
  const result = await f.bridge.call('browser.launch', { profilePath: 'C:/explicit-test-profile', port: f.port, startupTimeoutMs: 1000, approvalTimeoutMs: 1000 });
  assert.equal(result.pending, true);
  const ready = await settled(f.bridge);
  assert.equal(ready.connected, true); assert.equal(ready.connectionOperation.kind, 'launch');
  assert.equal(attempts, 3); assert.equal(f.accepted, 1, 'Only refused pre-TCP attempts may be retried.');
});

test('successful launcher exit with no debugger listener still obeys the startup budget', async t => {
  let attempts = 0;
  const bridge = new FirefoxBridge({ launchBrowser: exitedLauncher(), createConnection() { attempts++; return refusedSocket(); } });
  t.after(() => bridge.close());
  const start = Date.now();
  await bridge.call('browser.launch', { profilePath: 'C:/explicit-test-profile', port: 6000, startupTimeoutMs: 80, approvalTimeoutMs: 10000 });
  const failure = await settled(bridge);
  assert.equal(failure.connected, false); assert.equal(failure.connectionOperation.state, 'failed');
  assert.equal(failure.connectionOperation.error.data.phase, 'tcp-connect');
  assert.ok(Date.now() - start >= 70); assert.ok(Date.now() - start < 700, 'Approval time must not extend an absent listener startup.');
  assert.ok(attempts <= 2);
});

test('disconnect cancels a launch startup retry after successful launcher exit', async t => {
  let attempts = 0;
  const bridge = new FirefoxBridge({ launchBrowser: exitedLauncher(), createConnection() { attempts++; return refusedSocket(); } });
  t.after(() => bridge.close());
  await bridge.call('browser.launch', { profilePath: 'C:/explicit-test-profile', port: 6000, startupTimeoutMs: 1000 });
  await tick(10); assert.equal(attempts, 1); assert.equal(bridge.status().pending, true);
  await bridge.call('browser.disconnect');
  const cancelled = await settled(bridge);
  assert.equal(cancelled.connectionOperation.state, 'cancelled'); assert.equal(cancelled.connectionOperation.error.code, 'CANCELLED');
  await tick(200); assert.equal(attempts, 1, 'Cancellation must not create a later connection.');
});

test('a nonzero launcher failure does not repeatedly retry a refused endpoint', async t => {
  let attempts = 0;
  const bridge = new FirefoxBridge({ launchBrowser: exitedLauncher(7), createConnection() { attempts++; return refusedSocket(); } });
  t.after(() => bridge.close());
  await bridge.call('browser.launch', { profilePath: 'C:/explicit-test-profile', port: 6000, startupTimeoutMs: 1000 });
  const failure = await settled(bridge);
  assert.equal(failure.connectionOperation.state, 'failed'); assert.equal(failure.connectionOperation.error.code, 'NOT_CONNECTED');
  assert.equal(attempts, 1);
});

test('a stalled TCP handshake uses only the startup budget, not the approval budget', async t => {
  let created = 0, destroyed = false;
  const bridge = new FirefoxBridge({ createConnection() {
    created++; const socket = new EventEmitter(); socket.setNoDelay = () => {};
    socket.destroy = () => { destroyed = true; socket.destroyed = true; };
    return socket;
  } }); t.after(() => bridge.close());
  const start = Date.now();
  await assert.rejects(bridge.call('browser.connect', { port: 6000, startupTimeoutMs: 25, approvalTimeoutMs: 1000, waitForConnection: true }), error => error.code === 'TIMEOUT' && error.data.phase === 'tcp-connect');
  assert.ok(Date.now() - start < 500, 'The stalled TCP must not consume the one-second approval budget.');
  assert.equal(created, 1); assert.equal(destroyed, true);
});

test('MCP default returns pending before approval, retains one socket and ignores a completed caller signal', async t => {
  const f = await fakeFirefox(t, { greetingDelay: 500 }), controller = new AbortController();
  const start = Date.now();
  const result = await f.bridge.call('browser.connect', { port: f.port, startupTimeoutMs: 100, approvalTimeoutMs: 1500 }, { signal: controller.signal });
  assert.equal(result.pending, true); assert.equal(result.connected, false); assert.ok(Date.now() - start < 250);
  controller.abort();
  await assert.rejects(f.bridge.call('browser.connect', { port: f.port }), { code: 'BUSY' });
  const ready = await settled(f.bridge);
  assert.equal(ready.connected, true); assert.equal(ready.connectionOperation.state, 'connected'); assert.equal(f.accepted, 1);
  await assert.rejects(f.bridge.call('browser.connect', { port: f.port }), { code: 'ALREADY_CONNECTED' });
});

test('background approval failure is reported by status without unhandled rejection or replacement', async t => {
  const f = await fakeFirefox(t, { neverGreet: true });
  const result = await f.bridge.call('browser.connect', { port: f.port, approvalTimeoutMs: 40 });
  assert.equal(result.pending, true);
  const failure = await settled(f.bridge);
  assert.equal(failure.connected, false); assert.equal(failure.connectionOperation.state, 'failed'); assert.equal(failure.connectionOperation.error.code, 'TIMEOUT'); assert.equal(f.accepted, 1);
});

test('default launch reports asynchronous preparation failure through status without opening a socket', async t => {
  let sockets = 0;
  const bridge = new FirefoxBridge({ createConnection() { sockets++; throw new Error('Unexpected socket.'); } });
  t.after(() => bridge.close());
  const result = await bridge.call('browser.launch', { profilePath: 'relative-profile-is-invalid', port: 6000 });
  assert.equal(result.pending, true); assert.equal(result.connected, false);
  const failure = await settled(bridge);
  assert.equal(failure.connectionOperation.state, 'failed'); assert.equal(failure.connectionOperation.error.code, 'INVALID_ARGUMENT'); assert.equal(sockets, 0);
});

test('disconnect and close cancel background approval and discard stale actor state', async t => {
  for (const method of ['browser.disconnect', 'close']) {
    const f = await fakeFirefox(t, { neverGreet: true });
    const accepted = once(f.server, 'accepted');
    await f.bridge.call('browser.connect', { port: f.port }); await accepted;
    f.bridge.sessions.set(1, {}); f.bridge.generation = 'stale';
    if (method === 'close') await f.bridge.close(); else await f.bridge.call(method);
    const status = await settled(f.bridge);
    assert.equal(status.connectionOperation.state, 'cancelled'); assert.equal(status.connectionOperation.error.code, 'CANCELLED');
    assert.equal(status.generation, null); assert.deepEqual(status.attachedTabs, []); assert.equal(f.accepted, 1);
  }
});
