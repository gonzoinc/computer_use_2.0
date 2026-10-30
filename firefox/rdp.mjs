import net from 'node:net';
import { EventEmitter } from 'node:events';

export class FirefoxError extends Error {
  constructor(code, message, data) { super(message); this.name = 'FirefoxError'; this.code = code; if (data !== undefined) this.data = data; }
}
export const MAX_PACKET_BYTES = 8 * 1024 * 1024;
const events = new Set(['evaluationResult', 'paused', 'resumed', 'newSource', 'tabListChanged', 'tabNavigated', 'frameUpdate', 'workerListChanged', 'addonListChanged', 'processListChanged', 'serviceWorkerRegistrationListChanged', 'target-available-form', 'target-destroyed-form', 'descriptor-destroyed', 'resources-available-array', 'resources-updated-array', 'resources-destroyed-array', 'networkEventUpdate', 'networkEvent', 'consoleAPICall', 'pageError', 'logMessage', 'documentEvent', 'inspectObject', 'fileActivity', 'reflowActivity', 'detached', 'newMutations', 'display-change', 'overflow-change', 'resize', 'stylesheet-added', 'property-change', 'style-applied', 'contentScrolled']);

export class RdpConnection extends EventEmitter {
  constructor({ host = '127.0.0.1', port = 6000, timeoutMs = 15000, maxPacketBytes = MAX_PACKET_BYTES, createConnection = net.createConnection } = {}) {
    super();
    if (!['127.0.0.1', '::1'].includes(host)) throw new FirefoxError('INVALID_ARGUMENT', 'Only literal loopback Firefox endpoints are supported.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new FirefoxError('INVALID_ARGUMENT', 'A valid explicit debugger port is required.');
    this.host = host; this.port = port; this.timeoutMs = timeoutMs; this.maxPacketBytes = maxPacketBytes; this.createConnection = createConnection; this.socket = null; this.pending = new Map(); this.buffer = Buffer.alloc(0); this.greeting = null;
  }
  async connect({ signal, startupTimeoutMs = this.timeoutMs, greetingTimeoutMs = this.timeoutMs } = {}) {
    if (this.socket) return this.greeting;
    const socket = this.createConnection({ host: this.host, port: this.port });
    this.socket = socket; this.tcpConnected = false; socket.setNoDelay(true);
    socket.on('data', bytes => this.#consume(bytes));
    socket.on('error', e => this.#fail(new FirefoxError('NOT_CONNECTED', `Firefox debugger connection failed: ${e.message}`, { socketCode: e.code, phase: this.tcpConnected ? 'approval-or-active' : 'tcp-connect' })));
    socket.on('close', () => this.#fail(new FirefoxError('NOT_CONNECTED', 'Firefox debugger disconnected; commands were not replayed.')));
    this.greeting = await new Promise((resolve, reject) => {
      let timer = setTimeout(() => finish(new FirefoxError('TIMEOUT', 'Firefox TCP connection did not become ready within the startup budget.', { phase: 'tcp-connect' })), startupTimeoutMs);
      const connected = () => {
        this.tcpConnected = true; clearTimeout(timer);
        timer = setTimeout(() => finish(new FirefoxError('TIMEOUT', 'Firefox debugger did not greet the connected socket before its explicit approval wait expired.', { phase: 'approval' })), greetingTimeoutMs);
        this.emit('tcpConnected');
      };
      const greeting = packet => finish(null, packet), failure = e => finish(e), abort = () => finish(new FirefoxError('CANCELLED', 'Firefox connection cancelled.'));
      const finish = (error, value) => { clearTimeout(timer); socket.off('connect', connected); this.off('greeting', greeting); this.off('closed', failure); signal?.removeEventListener('abort', abort); if (error) { this.close(error); reject(error); } else resolve(value); };
      socket.once('connect', connected); this.once('greeting', greeting); this.once('closed', failure); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    });
    return this.greeting;
  }
  #consume(bytes) {
    this.buffer = Buffer.concat([this.buffer, bytes]);
    while (this.buffer.length) {
      const colon = this.buffer.indexOf(58);
      if (colon < 0) { if (this.buffer.length > 32) this.close(new FirefoxError('PROTOCOL_ERROR', 'Debugger packet header exceeds limit.')); return; }
      const header = this.buffer.subarray(0, colon).toString('ascii');
      if (header.startsWith('bulk ')) { this.close(new FirefoxError('UNSUPPORTED_BULK', 'RDP bulk transfers are unsupported; the connection was closed safely.')); return; }
      if (colon > 32 || !/^[0-9]+$/.test(header)) { this.close(new FirefoxError('PROTOCOL_ERROR', 'Invalid debugger packet length.')); return; }
      const length = Number(header);
      if (!Number.isSafeInteger(length) || length < 2 || length > this.maxPacketBytes) { this.close(new FirefoxError('PACKET_TOO_LARGE', 'Debugger packet length outside allowed bounds.')); return; }
      if (this.buffer.length < colon + 1 + length) return;
      const body = this.buffer.subarray(colon + 1, colon + 1 + length); this.buffer = this.buffer.subarray(colon + 1 + length);
      let packet;
      try { packet = JSON.parse(body.toString('utf8')); } catch { this.close(new FirefoxError('PROTOCOL_ERROR', 'Debugger returned invalid JSON.')); return; }
      if (!packet || typeof packet !== 'object' || Array.isArray(packet)) { this.close(new FirefoxError('PROTOCOL_ERROR', 'Debugger packet must be an object.')); return; }
      if (!this.greeting && packet.from === 'root' && packet.applicationType) { this.greeting = packet; this.emit('greeting', packet); continue; }
      if (events.has(packet.type)) { this.emit('event', packet); continue; }
      const queue = this.pending.get(packet.from);
      if (!queue?.length) { this.emit('unhandled', packet); continue; }
      const request = queue.shift(); clearTimeout(request.timer); request.signal?.removeEventListener('abort', request.abort);
      if (packet.error) request.reject(new FirefoxError('RDP_REMOTE_ERROR', String(packet.message ?? packet.error), { remoteError: packet.error, actor: packet.from }));
      else request.resolve(packet);
      if (queue.length) this.#sendNext(packet.from);
    }
  }
  request(actor, type, fields = {}, { timeoutMs = this.timeoutMs, signal } = {}) {
    if (!this.socket || this.socket.destroyed || !this.greeting) return Promise.reject(new FirefoxError('NOT_CONNECTED', 'Connect to a Firefox debugger first.'));
    if (typeof actor !== 'string' || !actor || typeof type !== 'string' || !type) return Promise.reject(new FirefoxError('INVALID_ARGUMENT', 'Actor and request type are required.'));
    if (Object.hasOwn(fields, 'to') || Object.hasOwn(fields, 'type')) return Promise.reject(new FirefoxError('INVALID_ARGUMENT', 'Request fields cannot override actor/type.'));
    const body = Buffer.from(JSON.stringify({ to: actor, type, ...fields }));
    if (body.length > this.maxPacketBytes) return Promise.reject(new FirefoxError('PACKET_TOO_LARGE', 'Outgoing debugger packet exceeds limit.'));
    if (signal?.aborted) return Promise.reject(new FirefoxError('CANCELLED', 'Debugger request cancelled.'));
    return new Promise((resolve, reject) => {
      const queue = this.pending.get(actor) ?? [];
      if (queue.length >= 64) { reject(new FirefoxError('BUSY', 'Too many queued requests for this actor.')); return; }
      const request = { resolve, reject, body, timeoutMs, signal, timer: null, sent: false };
      request.abort = () => {
        if (request.sent) this.close(new FirefoxError('CANCELLED', 'A sent debugger request was cancelled; connection closed to avoid reply miscorrelation.'));
        else { const index = queue.indexOf(request); if (index >= 0) queue.splice(index, 1); reject(new FirefoxError('CANCELLED', 'Queued debugger request cancelled.')); }
      };
      signal?.addEventListener('abort', request.abort, { once: true });
      queue.push(request); this.pending.set(actor, queue); if (queue.length === 1) this.#sendNext(actor);
    });
  }
  #sendNext(actor) {
    const request = this.pending.get(actor)?.[0]; if (!request || request.sent) return;
    request.sent = true;
    request.timer = setTimeout(() => this.close(new FirefoxError('TIMEOUT', 'Debugger request timed out; connection closed to prevent late-reply miscorrelation. A mutation may already have run.')), request.timeoutMs);
    this.socket.write(Buffer.concat([Buffer.from(`${request.body.length}:`), request.body]));
  }
  #fail(error) {
    const hadSocket = !!this.socket; const socket = this.socket; this.socket = null; this.greeting = null; this.buffer = Buffer.alloc(0);
    socket?.destroy();
    for (const queue of this.pending.values()) for (const request of queue) { clearTimeout(request.timer); request.signal?.removeEventListener('abort', request.abort); request.reject(error); }
    this.pending.clear(); if (hadSocket) this.emit('closed', error);
  }
  close(error = new FirefoxError('NOT_CONNECTED', 'Firefox debugger connection closed.')) { this.#fail(error); }
}
