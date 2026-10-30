import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { RdpConnection } from './rdp.mjs';
import { SourceMap } from './source-map.mjs';

const encode = value => { const body = Buffer.from(JSON.stringify(value)); return Buffer.concat([Buffer.from(`${body.length}:`), body]); };
async function fixture(t, options = {}) {
  const requests = [], sockets = new Set(); let peer;
  const server = net.createServer(socket => {
    peer = socket; sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    const greeting = encode({ from: 'root', applicationType: 'browser', traits: {} });
    socket.write(greeting.subarray(0, 2)); socket.write(greeting.subarray(2, 9)); socket.write(greeting.subarray(9));
    let bytes = Buffer.alloc(0);
    socket.on('data', part => {
      bytes = Buffer.concat([bytes, part]); let colon;
      while ((colon = bytes.indexOf(58)) >= 0) {
        const size = Number(bytes.subarray(0, colon)); if (bytes.length < colon + 1 + size) return;
        requests.push(JSON.parse(bytes.subarray(colon + 1, colon + 1 + size))); bytes = bytes.subarray(colon + 1 + size);
        server.emit('request');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const connection = new RdpConnection({ port: server.address().port, timeoutMs: 1000, ...options });
  t.after(async () => { connection.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  await connection.connect();
  return { connection, server, requests, get peer() { return peer; }, async count(number) { while (requests.length < number) await once(server, 'request'); } };
}

test('RDP uses UTF-8 byte framing, split/coalesced packets, per-actor FIFO and independent actors', async t => {
  const f = await fixture(t), events = [];
  f.connection.on('event', packet => events.push(packet));
  const first = f.connection.request('actor1', 'first', { text: '日本語' });
  const second = f.connection.request('actor1', 'second');
  const independent = f.connection.request('actor2', 'other');
  await f.count(2);
  assert.deepEqual(f.requests.map(x => x.type), ['first', 'other']);
  f.peer.write(Buffer.concat([encode({ from: 'actor1', type: 'resources-available-array', array: [] }), encode({ from: 'actor2', value: 'second actor first' }), encode({ from: 'actor1', value: 'é漢字' })]));
  assert.equal((await first).value, 'é漢字'); assert.equal((await independent).value, 'second actor first');
  await f.count(3); assert.equal(f.requests[2].type, 'second');
  const result = encode({ from: 'actor1', value: 42 }); f.peer.write(result.subarray(0, 4)); f.peer.write(result.subarray(4));
  assert.equal((await second).value, 42); assert.equal(events.length, 1);
});

test('RDP timeout closes connection and rejects queued mutation instead of miscorrelating a late reply', async t => {
  const f = await fixture(t, { timeoutMs: 30 });
  const first = f.connection.request('actor', 'slow');
  const queued = f.connection.request('actor', 'mutation');
  const firstReject = assert.rejects(first, { code: 'TIMEOUT' }); const queuedReject = assert.rejects(queued, { code: 'TIMEOUT' });
  await Promise.all([firstReject, queuedReject]); assert.equal(f.requests.length, 1); assert.equal(f.connection.socket, null);
});

test('cancellation closes sent actor stream and never sends its queued mutation', async t => {
  const f = await fixture(t), abort = new AbortController();
  const first = f.connection.request('actor', 'slow', {}, { signal: abort.signal });
  const queued = f.connection.request('actor', 'mutation');
  const firstReject = assert.rejects(first, { code: 'CANCELLED' }); const queuedReject = assert.rejects(queued, { code: 'CANCELLED' });
  await f.count(1); abort.abort(); await Promise.all([firstReject, queuedReject]); assert.equal(f.requests.length, 1);
});

for (const [name, bytes, code] of [
  ['oversized length', Buffer.from('9000000:'), 'PACKET_TOO_LARGE'],
  ['invalid header', Buffer.from('nonsense:'), 'PROTOCOL_ERROR'],
  ['unsupported bulk', Buffer.from('bulk actor type 4:'), 'UNSUPPORTED_BULK'],
  ['invalid JSON', Buffer.from('3:bad'), 'PROTOCOL_ERROR'],
]) test(`RDP rejects ${name} explicitly and safely`, async t => {
  const f = await fixture(t); const closed = once(f.connection, 'closed'); f.peer.write(bytes); const [error] = await closed; assert.equal(error.code, code);
});

test('flat source maps resolve sourceRoot and respect unmapped segments', () => {
  // Line1 maps col0 to original0; an unmapped segment starts at col5.
  const map = new SourceMap({ version: 3, sourceRoot: '/src', sources: ['original.ts'], names: [], mappings: 'AAAA,K;AACA' }, 'https://example.test/assets/generated.js.map');
  assert.equal(map.sources[0], 'https://example.test/src/original.ts');
  assert.equal(map.originalPosition(1, 0).originalLine, 1); assert.equal(map.originalPosition(1, 6), null);
  assert.equal(map.generatedPosition(map.sources[0], 2).generatedLine, 2);
  assert.throws(() => new SourceMap({ version: 3, sources: [], mappings: '', sections: [] }, 'https://example.test/'), { code: 'UNSUPPORTED_SOURCE_MAP' });
});
