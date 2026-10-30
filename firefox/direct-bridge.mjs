import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { RdpConnection, FirefoxError } from './rdp.mjs';
import { launchFirefox, listProfiles, configureProfile } from './launcher.mjs';
import { SourceMap } from './source-map.mjs';
import { domOperation } from './dom-operation.mjs';
import { listNormalWindows, createNormalTab } from './browser-window.mjs';

export { FirefoxError } from './rdp.mjs';
const tab = { type: 'integer', minimum: 1 }, integer = { type: 'integer', minimum: 0 };
const str = maxLength => ({ type: 'string', maxLength });
const positive = maximum => ({ type: 'integer', minimum: 1, maximum });
const selector = { type: 'string', minLength: 1, maxLength: 4096 };
const source = str(2048), frame = str(2048), boolean = { type: 'boolean' };
const definitions = [
  ['bridge.status', {}, [], 'Report direct Firefox debugging readiness without launching, connecting or reading page data.'],
  ['browser.connect', { port: positive(65535), host: { type: 'string', enum: ['127.0.0.1', '::1'] }, startupTimeoutMs: positive(120000), approvalTimeoutMs: positive(3600000), waitForConnection: boolean }, ['port'], 'Begin connecting to a local Firefox RDP endpoint and return pending promptly. Poll browser.status; browser.disconnect cancels. Leave waitForConnection=false for MCP; synchronous waiting is a direct-API/testing expert option.'],
  ['browser.status', {}, [], 'Read pending/ready/failed Firefox connection state and errors promptly without opening another socket or prompt.'],
  ['browser.disconnect', {}, [], 'Cancel pending Firefox startup/approval and disconnect RDP. Does not close Firefox, restore profile preferences or replay commands.'],
  ['browser.profiles', {}, [], 'List Firefox profile names and paths from profiles.ini only. Never automatically selects a profile or reads browsing data.'],
  ['browser.profileSetup', { profilePath: str(32768), remove: boolean }, ['profilePath'], 'Explicitly add or remove only this plugin’s three marked debugging preferences in a closed approved profile. Preserves connection prompts and unrelated settings.'],
  ['browser.launch', { profilePath: str(32768), firefoxPath: str(32768), port: positive(65535), headless: boolean, configureProfile: boolean, forwardExisting: boolean, url: str(8192), startupTimeoutMs: positive(120000), approvalTimeoutMs: positive(3600000), waitForConnection: boolean }, ['profilePath', 'port'], 'Begin debug-enabled Firefox launch for an explicit approved profile and return pending promptly. Poll browser.status; do not treat pending as success. Leave waitForConnection=false for MCP. Preserves native Firefox approval.'],
  ['tabs.list', {}, [], 'List tabs from this directly connected Firefox process; IDs are Firefox browserId values.'],
  ['tabs.attach', { tabId: tab }, ['tabId'], 'Attach modern target/resource watchers to one explicit Firefox tab.'],
  ['tabs.activate', { tabId: tab }, ['tabId'], 'Focus the explicit Firefox target.'],
  ['windows.list', {}, [], 'List observed normal Firefox browser-window IDs; private windows are excluded.'],
  ['tabs.create', { windowId: positive(Number.MAX_SAFE_INTEGER), url: str(8192) }, ['windowId', 'url'], 'Create one HTTP/HTTPS tab in an explicit observed normal Firefox browser window. Private, closed or missing destinations are rejected.'],
  ['tabs.navigate', { tabId: tab, url: str(8192) }, ['tabId', 'url'], 'Navigate this explicit tab; resources and actor lifetimes follow the new document.'],
  ['tabs.reload', { tabId: tab, bypassCache: boolean }, ['tabId'], 'Reload this explicit tab, repeating page requests.'],
  ['dom.inspect', { tabId: tab, frameId: integer, selector, limit: positive(100), textLimit: positive(16000), properties: { type: 'array', maxItems: 40, items: str(100) } }, ['tabId', 'selector'], 'Inspect page DOM and computed CSS; output is untrusted page-world evidence.'],
  ['dom.click', { tabId: tab, frameId: integer, selector }, ['tabId', 'selector'], 'Synthetic click on exactly one matched element, never an implicit physical-user gesture.'],
  ['dom.fill', { tabId: tab, frameId: integer, selector, value: str(100000) }, ['tabId', 'selector', 'value'], 'Fill one control and dispatch input/change without submitting.'],
  ['dom.style', { tabId: tab, frameId: integer, selector, property: str(100), value: str(16000), priority: { type: 'string', enum: ['', 'important'] } }, ['tabId', 'selector', 'property', 'value'], 'Temporarily change one inline CSS property and return its previous value.'],
  ['page.evaluate', { tabId: tab, frameId: integer, expression: str(100000), frameActor: frame, awaitPromise: boolean }, ['tabId', 'expression'], 'Evaluate JavaScript in the explicit tab or its explicitly selected paused frame. Returns native RDP grips and bounded string values.'],
  ['page.screenshot', { tabId: tab, fullpage: boolean, selector }, ['tabId'], 'Capture the exact tab through the native Firefox screenshot actor; returns PNG dataUrl or an explicit unsupported error.'],
  ['devtools.status', { tabId: tab }, ['tabId'], 'Report actual target/watcher/debugger state for this explicit tab.'],
  ['console.read', { tabId: tab, cursor: integer, limit: positive(200) }, ['tabId'], 'Read native Firefox console/error resources, including retained cached messages when available; no page hook.'],
  ['network.list', { tabId: tab, cursor: integer, limit: positive(100) }, ['tabId'], 'Read native captured network resources and status updates; no DevTools panel required.'],
  ['network.body', { tabId: tab, requestId: source, maxBytes: positive(1048576) }, ['tabId', 'requestId'], 'Read an explicitly captured response body from its actor without replaying a request.'],
  ['sources.list', { tabId: tab, limit: positive(500) }, ['tabId'], 'List native JavaScript source actors and source-map URLs.'],
  ['sources.read', { tabId: tab, sourceId: source, maxBytes: positive(2097152) }, ['tabId', 'sourceId'], 'Read JavaScript source content with bounded long-string retrieval.'],
  ['sources.map', { tabId: tab, sourceId: source, generatedLine: positive(10000000), generatedColumn: integer, originalSource: str(8192), originalLine: positive(10000000), originalColumn: integer, includeContent: boolean }, ['tabId', 'sourceId'], 'Load an explicit source map and translate generated/original positions. Flat v3 maps supported; indexed maps fail explicitly.'],
  ['debugger.setBreakpoint', { tabId: tab, sourceId: source, line: positive(10000000), column: integer, condition: str(100000), originalSource: str(8192) }, ['tabId', 'sourceId', 'line'], 'Set a real Firefox debugger breakpoint, optionally mapped from an original source position.'],
  ['debugger.removeBreakpoint', { tabId: tab, breakpointId: str(2048) }, ['tabId', 'breakpointId'], 'Remove one breakpoint created by this adapter.'],
  ['debugger.pause', { tabId: tab }, ['tabId'], 'Interrupt this tab’s actual JavaScript debugger and wait for a paused event.'],
  ['debugger.resume', { tabId: tab }, ['tabId'], 'Resume an actually paused thread.'],
  ['debugger.step', { tabId: tab, kind: { type: 'string', enum: ['into', 'over', 'out'] }, frameActor: frame }, ['tabId', 'kind'], 'Perform an actual step and wait for the next debugger pause.'],
  ['debugger.waitForPause', { tabId: tab }, ['tabId'], 'Wait for a real breakpoint/exception/step pause in this explicit tab.'],
  ['debugger.stack', { tabId: tab, start: integer, count: positive(100) }, ['tabId'], 'Read actual paused JavaScript stack frames.'],
  ['debugger.variables', { tabId: tab, frameActor: frame }, ['tabId', 'frameActor'], 'Read lexical environment bindings from an explicit frame in the current pause.'],
];
const readMethods = new Set(['bridge.status', 'browser.status', 'browser.profiles', 'windows.list', 'tabs.list', 'devtools.status', 'dom.inspect', 'page.screenshot', 'console.read', 'network.list', 'network.body', 'sources.list', 'sources.read', 'sources.map', 'debugger.stack', 'debugger.variables', 'debugger.waitForPause']);
export const FirefoxTools = Object.freeze(definitions.map(([method, properties, required, description]) => Object.freeze({ name: `firefox_${method.replaceAll('.', '_')}`, method, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations: { readOnlyHint: readMethods.has(method) } })));
const contracts = new Map(FirefoxTools.map(x => [x.method, x.inputSchema]));
function validateValue(value, schema, key) {
  if (schema.type === 'integer' && (!Number.isSafeInteger(value) || value < (schema.minimum ?? 0) || value > (schema.maximum ?? Number.MAX_SAFE_INTEGER))) throw new FirefoxError('INVALID_ARGUMENT', `${key} is outside its integer bounds.`);
  if (schema.type === 'boolean' && typeof value !== 'boolean') throw new FirefoxError('INVALID_ARGUMENT', `${key} must be boolean.`);
  if (schema.type === 'string' && (typeof value !== 'string' || value.length > schema.maxLength || value.length < (schema.minLength ?? 0))) throw new FirefoxError('INVALID_ARGUMENT', `${key} must be a bounded string.`);
  if (schema.enum && !schema.enum.includes(value)) throw new FirefoxError('INVALID_ARGUMENT', `${key} is unsupported.`);
  if (schema.type === 'array') { if (!Array.isArray(value) || value.length > schema.maxItems) throw new FirefoxError('INVALID_ARGUMENT', `${key} must be a bounded array.`); value.forEach((x, i) => validateValue(x, schema.items, `${key}[${i}]`)); }
}
export function validateCall(method, args) {
  const schema = contracts.get(method); if (!schema) throw new FirefoxError('UNSUPPORTED', `Unknown Firefox method: ${method}`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new FirefoxError('INVALID_ARGUMENT', 'Arguments must be an object.');
  for (const key of schema.required) if (!Object.hasOwn(args, key)) throw new FirefoxError('INVALID_ARGUMENT', `${key} is required.`);
  for (const key of Object.keys(args)) { if (!Object.hasOwn(schema.properties, key)) throw new FirefoxError('INVALID_ARGUMENT', `Unknown argument: ${key}`); validateValue(args[key], schema.properties[key], key); }
}
const bounded = (value, maximum = 100000) => { const json = JSON.stringify(value); return Buffer.byteLength(json) <= maximum ? value : { truncated: true, preview: json.slice(0, maximum / 2), originalBytes: Buffer.byteLength(json) }; };
const pageUrl = value => { let url; try { url = new URL(value); } catch { throw new FirefoxError('INVALID_ARGUMENT', 'A valid HTTP/HTTPS URL is required.'); } if (!['http:', 'https:'].includes(url.protocol)) throw new FirefoxError('RESTRICTED_URL', 'Only HTTP and HTTPS page targets are supported.'); return url.href; };

export class FirefoxBridge extends EventEmitter {
  constructor({ projectRoot, host = '127.0.0.1', port = 6000, requestTimeoutMs = 15000, createConnection, launchBrowser = launchFirefox } = {}) {
    super(); this.projectRoot = projectRoot; this.host = host; this.port = port; this.requestTimeoutMs = requestTimeoutMs;
    this.connection = null; this.state = 'idle'; this.sessions = new Map(); this.watchers = new Map(); this.targets = new Map(); this.evaluations = new Map(); this.generation = null; this.started = false; this.createConnection = createConnection; this.launchBrowser = launchBrowser; this.operation = null; this.closed = false;
  }
  async start() { this.started = true; this.closed = false; return this.status(); }
  status() { return { state: this.state, connected: this.state === 'connected', transport: 'firefox-rdp', extensionRequired: false, generation: this.generation, endpoint: { host: this.host, port: this.port },
    pending: !!this.operation?.pending, connectionOperation: this.operation ? { kind: this.operation.kind, state: this.operation.state, startedAt: this.operation.startedAt, completedAt: this.operation.completedAt, error: this.operation.error } : null,
    launch: this.launch ? { pid: this.launch.pid, profilePath: this.launch.profilePath, port: this.launch.port, promptExpected: this.launch.promptExpected } : null,
    schemaBaseline: 'Firefox 159.0 shipped actor specs', capabilities: { nativeConsole: true, capturedNetwork: true, dom: true, programmaticDebugger: true, sourceMaps: 'flat-v3', bulkTransfer: false, screenshot: !!this.rootActors?.screenshotActor }, attachedTabs: [...this.sessions.keys()] }; }
  async #beginConnection(kind, args, options) {
    if (this.closed) throw new FirefoxError('CLOSED', 'Restart the bridge before beginning a Firefox connection.');
    if (this.operation?.pending) throw new FirefoxError('BUSY', 'A Firefox connection/launch is already pending. Read browser.status or use browser.disconnect; no second socket was opened.');
    if (this.state === 'connected') throw new FirefoxError('ALREADY_CONNECTED', 'Firefox is connected. Disconnect explicitly before replacing its connection.');
    const controller = new AbortController();
    const operation = { kind, pending: true, state: 'starting', startedAt: new Date().toISOString(), completedAt: null, error: null, controller };
    this.operation = operation; this.state = kind === 'launch' ? 'preparing-launch' : 'connecting';
    const callerAbort = () => controller.abort(); options.signal?.addEventListener('abort', callerAbort, { once: true });
    const workOptions = { timeoutMs: options.timeoutMs, signal: controller.signal };
    operation.promise = (async () => {
      if (controller.signal.aborted) throw new FirefoxError('CANCELLED', 'Firefox connection operation cancelled.');
      if (kind === 'launch') {
        const launch = await this.launchBrowser({ ...args, configure: args.configureProfile, signal: controller.signal });
        this.launch = launch; this.host = '127.0.0.1'; this.port = launch.port;
        if (controller.signal.aborted) throw new FirefoxError('CANCELLED', 'Firefox connection cancelled; any already-launched browser was left open.');
        return this.#connect({ port: launch.port, host: '127.0.0.1', startupTimeoutMs: args.startupTimeoutMs, approvalTimeoutMs: args.approvalTimeoutMs, launchedProcess: launch.child, forwardExisting: launch.forwardExisting }, workOptions);
      }
      return this.#connect(args, workOptions);
    })().then(result => {
      operation.pending = false; operation.state = 'connected'; operation.completedAt = new Date().toISOString(); return result;
    }, error => {
      operation.pending = false; operation.state = controller.signal.aborted || error.code === 'CANCELLED' ? 'cancelled' : 'failed'; operation.completedAt = new Date().toISOString();
      operation.error = { code: error.code ?? 'FIREFOX_ERROR', message: String(error.message ?? error), ...(error.data ? { data: error.data } : {}) };
      if (this.operation === operation && !this.closed) this.state = operation.state;
      throw error;
    });
    operation.promise.catch(() => {}); // Status exposes background failure; never an unhandled rejection.
    if (args.waitForConnection === true) {
      try { await operation.promise; return this.status(); }
      finally { options.signal?.removeEventListener('abort', callerAbort); }
    }
    // A completed short MCP request must not own the lifetime of the native approval socket.
    options.signal?.removeEventListener('abort', callerAbort);
    return { ...this.status(), started: true, next: 'Read browser.status until connected or failed; browser.disconnect cancels the pending operation.' };
  }
  #disconnect() {
    const operation = this.operation;
    operation?.controller.abort(); this.connection?.close(new FirefoxError('CANCELLED', 'Firefox connection explicitly disconnected.'));
    this.connection = null; this.rootActors = null; this.generation = null; this.sessions.clear(); this.watchers.clear(); this.targets.clear(); this.evaluations.clear(); this.state = 'disconnected';
    if (operation && !operation.pending) operation.state = 'disconnected';
    return { ...this.status(), cancellationRequested: !!operation?.pending };
  }
  async #connect(args, options) {
    this.connection?.close(); this.rootActors = null; this.sessions.clear(); this.watchers.clear(); this.targets.clear(); this.evaluations.clear();
    this.host = args.host ?? this.host; this.port = args.port ?? this.port;
    const deadline = Date.now() + (args.startupTimeoutMs ?? 30000);
    while (true) {
      if (options.signal?.aborted) throw new FirefoxError('CANCELLED', 'Firefox connection cancelled.');
      const remainingStartup = deadline - Date.now();
      if (remainingStartup <= 0) throw new FirefoxError('TIMEOUT', 'Firefox endpoint startup budget expired.', { phase: 'tcp-connect' });
      const connection = new RdpConnection({ host: this.host, port: this.port, timeoutMs: options.timeoutMs ?? this.requestTimeoutMs, createConnection: this.createConnection }); this.connection = connection; this.state = 'connecting';
      connection.on('event', packet => this.#event(packet));
      connection.on('tcpConnected', () => { if (this.connection === connection) this.state = 'awaiting-firefox-greeting'; });
      connection.on('closed', error => { if (this.connection !== connection) return; this.state = 'disconnected'; this.generation = null; this.rootActors = null; this.sessions.clear(); this.watchers.clear(); this.targets.clear(); this.evaluations.clear(); this.emit('closed', error); });
      try {
        await connection.connect({ signal: options.signal, startupTimeoutMs: remainingStartup, greetingTimeoutMs: args.approvalTimeoutMs ?? 900000 });
        await connection.request('root', 'connect', { frontendVersion: '159.0' }, options);
        this.rootActors = await connection.request('root', 'getRoot', {}, options); this.generation = randomUUID(); this.state = 'connected'; return this.status();
      } catch (error) {
        connection.close(); if (!this.closed) this.state = 'disconnected';
        // A refused pre-TCP startup attempt cannot have shown Firefox's connection prompt.
        // Once TCP connected, never tear down/retry a socket while human approval is pending.
        if (error.data?.phase !== 'tcp-connect' || error.data?.socketCode !== 'ECONNREFUSED' || Date.now() >= deadline || options.signal?.aborted) throw error;
        // Firefox's launcher can exit successfully after handing off to the browser.
        // Its exit0 is not proof that the browser's debugger listener cannot start.
        if (args.launchedProcess?.exitCode != null && args.launchedProcess.exitCode !== 0 && !args.forwardExisting) throw error;
        await new Promise((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new FirefoxError('CANCELLED', 'Firefox startup wait cancelled.')); };
          const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve(); }, Math.min(150, Math.max(1, deadline - Date.now())));
          options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
        });
      }
    }
  }
  #event(packet) {
    if (packet.type === 'evaluationResult') { this.evaluations.set(packet.resultID, packet); while (this.evaluations.size > 256) this.evaluations.delete(this.evaluations.keys().next().value); }
    const watcherSession = this.watchers.get(packet.from);
    if (packet.type === 'target-available-form' && watcherSession) {
      const target = packet.target; watcherSession.targets.set(target.actor, target); this.targets.set(target.actor, watcherSession);
      if (target.isTopLevelTarget) { watcherSession.target = target; watcherSession.paused = null; watcherSession.navigation++; }
    }
    if (packet.type === 'target-destroyed-form' && watcherSession) { watcherSession.targets.delete(packet.target.actor); this.targets.delete(packet.target.actor); if (watcherSession.target?.actor === packet.target.actor) watcherSession.target = null; }
    const session = watcherSession ?? this.targets.get(packet.from) ?? [...this.sessions.values()].find(s => [...s.targets.values()].some(t => t.threadActor === packet.from));
    if (session && packet.type === 'paused') session.paused = packet;
    if (session && packet.type === 'resumed') session.paused = null;
    if (session && packet.type.startsWith('resources-')) {
      for (const [type, values] of packet.array ?? []) for (const value of values) {
        if (type === 'source' && packet.type === 'resources-available-array') { session.sources.set(value.actor, value); while (session.sources.size > 1000) session.sources.delete(session.sources.keys().next().value); }
        if (type === 'source' && packet.type === 'resources-destroyed-array') session.sources.delete(value.actor ?? value.resourceId);
        if (type === 'console-message' || type === 'error-message' || type === 'css-message') {
          session.logs.push({ cursor: ++session.logSequence, resourceType: type, source: 'native-firefox-resource', data: bounded(value, 24000) });
          if (session.logs.length > 500) { session.logs.shift(); session.logsDropped++; }
        }
        if (type === 'network-event') {
          const id = value.actor ?? value.actorID ?? [...session.network.values()].find(entry => entry.resourceId === value.resourceId)?.requestId;
          if (!id) continue;
          if (packet.type === 'resources-available-array') { session.network.set(id, { requestId: id, cursor: ++session.networkSequence, ...value }); while (session.network.size > 250) { session.network.delete(session.network.keys().next().value); session.networkDropped++; } }
          else if (packet.type === 'resources-updated-array') { const entry = session.network.get(id); if (entry) Object.assign(entry, value.resourceUpdates ?? value.update ?? value.updates ?? value); }
          else if (packet.type === 'resources-destroyed-array') { const entry = session.network.get(id); if (entry) entry.destroyed = true; }
        }
        if (type === 'thread-state') {
          if (value.state === 'paused') session.paused = { ...value, from: value.threadActor ?? session.paused?.from ?? session.target?.threadActor };
          else if (value.state === 'resumed') session.paused = null;
        }
      }
    }
    this.emit('packet', packet);
  }
  async #wait(check, options = {}) {
    const initial = check(); if (initial) return initial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new FirefoxError('TIMEOUT', 'Firefox did not produce the expected debugger event.')), options.timeoutMs ?? this.requestTimeoutMs);
      const packet = () => { const value = check(); if (value) finish(null, value); };
      const closed = e => finish(e), abort = () => { const e = new FirefoxError('CANCELLED', 'Firefox operation cancelled; no mutation replay.'); this.connection?.close(e); finish(e); };
      const finish = (error, value) => { clearTimeout(timer); this.off('packet', packet); this.off('closed', closed); options.signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
      this.on('packet', packet); this.on('closed', closed); options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
    });
  }
  async #tabs(options) { return (await this.connection.request('root', 'listTabs', {}, options)).tabs; }
  async #session(tabId, options) {
    let session = this.sessions.get(tabId);
    if (session?.attachPromise) await session.attachPromise;
    if (session) { await this.#wait(() => session.target, options); return session; }
    const descriptor = (await this.#tabs(options)).find(t => t.browserId === tabId);
    if (!descriptor) throw new FirefoxError('TAB_CLOSED', 'This browserId is not a tab in the connected Firefox process.');
    session = { tabId, descriptor, targets: new Map(), target: null, logs: [], logSequence: 0, logsDropped: 0, network: new Map(), networkSequence: 0, networkDropped: 0, sources: new Map(), breakpoints: new Map(), paused: null, navigation: 0 };
    this.sessions.set(tabId, session);
    session.attachPromise = (async () => {
      const watcher = await this.connection.request(descriptor.actor, 'getWatcher', { isServerTargetSwitchingEnabled: true, isPopupDebuggingEnabled: false }, options);
      session.watcher = watcher; this.watchers.set(watcher.actor, session);
      await this.connection.request(watcher.actor, 'watchTargets', { targetType: 'frame' }, options);
      await this.#wait(() => session.target, options);
      if (session.target.isPrivate) throw new FirefoxError('PERMISSION_DENIED', 'Private browsing is outside the initial plugin scope.');
      const supported = watcher.traits?.resources ?? {};
      const resourceTypes = ['console-message', 'error-message', 'css-message', 'network-event', 'source', 'thread-state'].filter(type => supported[type]);
      await this.connection.request(watcher.actor, 'watchResources', { resourceTypes }, options);
      session.breakpointList = (await this.connection.request(watcher.actor, 'getBreakpointListActor', {}, options)).breakpointList;
      if (supported['network-event']) {
        session.networkParent = (await this.connection.request(watcher.actor, 'getNetworkParentActor', {}, options)).network;
        await this.connection.request(session.networkParent.actor ?? session.networkParent, 'setSaveRequestAndResponseBodies', { save: true }, options);
      }
    })();
    try { await session.attachPromise; session.attachPromise = null; return session; }
    catch (e) { this.sessions.delete(tabId); if (session.watcher) this.watchers.delete(session.watcher.actor); throw e; }
  }
  async #target(session, args, options, restrict = true) {
    const target = args.frameId && args.frameId !== 0 ? [...session.targets.values()].find(t => t.browsingContextID === args.frameId) : await this.#wait(() => session.target, options);
    if (!target) throw new FirefoxError('NOT_FOUND', 'The explicit frameId is not a watched browsingContextID.');
    if (target.isPrivate) throw new FirefoxError('PERMISSION_DENIED', 'Private targets are outside the initial page debugging scope.');
    if (restrict) pageUrl(target.url); return target;
  }
  async #string(grip, maximum, options) {
    const boundText = (text, totalLength) => {
      const bytes = Buffer.from(text); let end = Math.min(bytes.length, maximum);
      while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
      const boundedText = bytes.subarray(0, end).toString('utf8');
      return { text: boundedText, truncated: boundedText.length < totalLength, totalLength, returnedBytes: end };
    };
    if (typeof grip === 'string') return boundText(grip, grip.length);
    if (grip?.type !== 'longString' || typeof grip.actor !== 'string') throw new FirefoxError('UNEXPECTED_RESULT', 'Expected a string or a native Firefox long-string grip.');
    const end = Math.min(grip.length, maximum); let text = String(grip.initial ?? '').slice(0, end);
    while (text.length < end) { const result = await this.connection.request(grip.actor, 'substring', { start: text.length, end: Math.min(end, text.length + 65536) }, options); if (typeof result.substring !== 'string' || !result.substring.length) throw new FirefoxError('PROTOCOL_ERROR', 'Long-string retrieval made no progress.'); text += result.substring; }
    return boundText(text, grip.length);
  }
  async #evaluate(target, expression, options, { awaitPromise = false, frameActor, disableBreaks = true } = {}) {
    const response = await this.connection.request(target.consoleActor, 'evaluateJSAsync', { text: expression, eager: false, disableBreaks, ...(awaitPromise ? { mapped: { await: true } } : {}), ...(frameActor ? { frameActor } : {}) }, options);
    const result = await this.#wait(() => this.evaluations.get(response.resultID), options); this.evaluations.delete(response.resultID);
    if (result.hasException || result.topLevelAwaitRejected) throw new FirefoxError('PAGE_EXCEPTION', typeof result.exceptionMessage === 'string' ? result.exceptionMessage : result.exceptionMessage?.initial ?? 'Page JavaScript threw or rejected.', bounded(result.exception ?? result, 12000));
    return result.result;
  }
  async #json(target, expression, options, awaitPromise = false) {
    const code = awaitPromise ? `(async()=>JSON.stringify(await (${expression})))()` : `JSON.stringify((${expression}))`;
    const grip = await this.#evaluate(target, code, options, { awaitPromise });
    const result = await this.#string(grip, 2 * 1024 * 1024, options);
    if (result.truncated) throw new FirefoxError('RESULT_TOO_LARGE', 'Page JSON result exceeded 2 MiB; request a smaller result.');
    return JSON.parse(result.text);
  }
  async #sourceMap(session, sourceId, options) {
    const source = session.sources.get(sourceId); if (!source) throw new FirefoxError('NOT_FOUND', 'Source actor is not part of the attached tab.');
    if (!source.sourceMapURL) throw new FirefoxError('NOT_FOUND', 'This source has no source map URL.');
    const url = new URL(source.sourceMapURL, source.sourceMapBaseURL ?? source.url).href;
    let content;
    if (url.startsWith('data:')) {
      const comma = url.indexOf(','); if (comma < 0) throw new FirefoxError('INVALID_SOURCE_MAP', 'Malformed data source map.');
      content = /;base64$/i.test(url.slice(0, comma)) ? Buffer.from(url.slice(comma + 1), 'base64').toString('utf8') : decodeURIComponent(url.slice(comma + 1));
    } else {
      pageUrl(url);
      const target = await this.#target(session, {}, options);
      content = await this.#json(target, `fetch(${JSON.stringify(url)},{credentials:'same-origin'}).then(async r=>{if(!r.ok)throw new Error('Source map HTTP '+r.status);return r.text()})`, options, true);
    }
    if (Buffer.byteLength(content) > 2 * 1024 * 1024) throw new FirefoxError('SOURCE_MAP_TOO_LARGE', 'Source map exceeds 2 MiB.');
    return new SourceMap(content, url.startsWith('data:') ? source.url : url);
  }
  async call(method, args = {}, { timeoutMs = this.requestTimeoutMs, signal } = {}) {
    validateCall(method, args);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new FirefoxError('INVALID_ARGUMENT', 'timeoutMs must be between 1 and 120000.');
    if (signal?.aborted) throw new FirefoxError('CANCELLED', 'Firefox operation cancelled.');
    const options = { timeoutMs, signal };
    if (method === 'bridge.status' || method === 'browser.status') return this.status();
    if (method === 'browser.disconnect') return this.#disconnect();
    if (method === 'browser.profiles') return { profiles: await listProfiles(), selectedAutomatically: false };
    if (method === 'browser.profileSetup') return configureProfile(args.profilePath, { remove: args.remove === true });
    if (method === 'browser.connect' || method === 'browser.launch') return this.#beginConnection(method.slice(8), args, options);
    if (this.state !== 'connected') throw new FirefoxError('NOT_CONNECTED', 'Explicitly launch or connect Firefox debugging first.');
    if (method === 'tabs.list') return { tabs: (await this.#tabs(options)).map(t => ({ tabId: t.browserId, title: t.title, url: t.url, selected: t.selected, browsingContextID: t.browsingContextID })) };
    if (method === 'tabs.create' || method === 'windows.list') {
      const descriptor = (await this.connection.request('root', 'getProcess', { id: 0 }, options)).processDescriptor;
      const form = await this.connection.request(descriptor.actor, 'getTarget', {}, options);
      const processTarget = form.process ?? form.target ?? form;
      if (method === 'windows.list') return { windows: await this.#json(processTarget, `(${listNormalWindows.toString()})()`, options) };
      const result = await this.#json(processTarget, `(${createNormalTab.toString()})(${args.windowId},${JSON.stringify(pageUrl(args.url))})`, options);
      if (result.__cu2error) throw new FirefoxError(result.__cu2error.code, result.__cu2error.message);
      return result;
    }
    const session = await this.#session(args.tabId, options);
    if (method === 'tabs.attach' || method === 'devtools.status') return { tabId: session.tabId, attached: true, target: bounded(session.target, 12000), watcherTraits: session.watcher.traits, paused: !!session.paused, nativeConsole: true, programmaticDebugger: true };
    if (method === 'tabs.activate') { const target = await this.#target(session, args, options, false); await this.connection.request(target.actor, 'focus', {}, options); return { tabId: session.tabId, focused: true }; }
    if (method === 'tabs.navigate' || method === 'tabs.reload') {
      const previous = session.target?.actor;
      if (method === 'tabs.navigate') await this.connection.request(session.descriptor.actor, 'navigateTo', { url: pageUrl(args.url), waitForLoad: true }, options);
      else await this.connection.request(session.descriptor.actor, 'reloadDescriptor', { bypassCache: args.bypassCache === true }, options);
      await this.#wait(() => session.target && session.target.actor !== previous, options);
      return { tabId: session.tabId, url: session.target.url, navigation: session.navigation };
    }
    if (method.startsWith('dom.')) {
      const target = await this.#target(session, args, options);
      const result = await this.#json(target, `(${domOperation.toString()})(${JSON.stringify(method)},${JSON.stringify(args)})`, options);
      if (result.__cu2error) throw new FirefoxError(result.__cu2error.code, result.__cu2error.message);
      return { tabId: session.tabId, frameId: target.browsingContextID, ...result, source: 'native-firefox-evaluation', untrusted: true };
    }
    if (method === 'page.evaluate') {
      let target = await this.#target(session, args, options);
      if (args.frameActor && (!session.paused || !(await this.connection.request(session.paused.from, 'frames', { start: 0, count: 100 }, options)).frames.some(f => f.actor === args.frameActor))) throw new FirefoxError('STALE_FRAME', 'frameActor must belong to this tab’s current pause.');
      if (args.frameActor) target = [...session.targets.values()].find(value => value.threadActor === session.paused.from) ?? target;
      const grip = await this.#evaluate(target, args.expression, options, args);
      if (typeof grip === 'string' || grip?.type === 'longString') return { tabId: session.tabId, value: await this.#string(grip, 1048576, options), source: 'native-firefox', untrusted: true };
      return { tabId: session.tabId, value: grip, source: 'native-firefox-grip', untrusted: true };
    }
    if (method === 'console.read') { const cursor = args.cursor ?? 0; const records = session.logs.filter(x => x.cursor > cursor).slice(0, args.limit ?? 50); return { tabId: session.tabId, source: 'native-firefox-resources', records, nextCursor: records.at(-1)?.cursor ?? cursor, dropped: session.logsDropped, cachedHistory: 'retained-messages-only' }; }
    if (method === 'network.list') { const cursor = args.cursor ?? 0; const records = [...session.network.values()].filter(x => x.cursor > cursor).slice(0, args.limit ?? 20).map(x => bounded(x, 24000)); return { tabId: session.tabId, records, nextCursor: records.at(-1)?.cursor ?? cursor, dropped: session.networkDropped, captureActive: true, historicalTrafficGuaranteed: false }; }
    if (method === 'network.body') {
      if (!session.network.has(args.requestId) || session.network.get(args.requestId).destroyed) throw new FirefoxError('NOT_FOUND', 'Request actor is not a live retained resource of this tab.');
      const response = await this.connection.request(args.requestId, 'getResponseContent', {}, options);
      const content = response.content ?? response;
      if (content.text === undefined) throw new FirefoxError('BODY_UNAVAILABLE', 'Firefox did not retain this response body.');
      return { tabId: session.tabId, requestId: args.requestId, ...(await this.#string(content.text, args.maxBytes ?? 65536, options)), mimeType: content.mimeType, encoding: content.encoding ?? 'utf8', source: 'native-firefox-response' };
    }
    if (method === 'sources.list') return { tabId: session.tabId, sources: [...session.sources.values()].slice(0, args.limit ?? 100), truncated: session.sources.size > (args.limit ?? 100) };
    if (method === 'sources.read') {
      if (!session.sources.has(args.sourceId)) throw new FirefoxError('NOT_FOUND', 'Source actor does not belong to this tab.');
      const reply = await this.connection.request(args.sourceId, 'source', {}, options);
      return { tabId: session.tabId, sourceId: args.sourceId, ...(await this.#string(reply.source, args.maxBytes ?? 262144, options)), contentType: reply.contentType };
    }
    if (method === 'sources.map') {
      const map = await this.#sourceMap(session, args.sourceId, options);
      return { tabId: session.tabId, sourceId: args.sourceId, url: map.url, sources: map.sources, ...(args.generatedLine ? { original: map.originalPosition(args.generatedLine, args.generatedColumn ?? 0) } : {}), ...(args.originalSource && args.originalLine ? { generated: map.generatedPosition(args.originalSource, args.originalLine, args.originalColumn ?? 0) } : {}), ...(args.includeContent ? { sourcesContent: bounded(map.map.sourcesContent ?? [], 262144) } : {}), format: 'flat-v3' };
    }
    if (method === 'page.screenshot') {
      if (!this.rootActors.screenshotActor) throw new FirefoxError('UNSUPPORTED', 'This Firefox exposes no screenshot actor. Use a native window screenshot.');
      const target = await this.#target(session, args, options);
      const captureInfo = await this.connection.request(target.screenshotContentActor, 'prepareCapture', { args: { fullpage: args.fullpage === true, ...(args.selector ? { selector: args.selector } : {}) } }, options);
      if (captureInfo.value?.error) throw new FirefoxError('NOT_FOUND', 'Firefox could not prepare the requested screenshot region.');
      const capture = await this.connection.request(this.rootActors.screenshotActor, 'capture', { args: { ...captureInfo.value, snapshotScale: (captureInfo.value.windowDpr ?? 1) * (captureInfo.value.windowZoom ?? 1), browsingContextID: target.browsingContextID, fullpage: args.fullpage === true, file: false, clipboard: false, disableFlash: true } }, options);
      const value = capture.value;
      const dataUrl = value?.data ?? value?.dataUrl;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new FirefoxError('UNSUPPORTED', 'Firefox screenshot actor returned no inline image. Use native screenshot fallback.', bounded(value, 12000));
      return { tabId: session.tabId, dataUrl, mimeType: 'image/png', source: 'native-firefox-screenshot' };
    }
    const target = await this.#target(session, args, options);
    const thread = session.paused?.from ?? target.threadActor;
    if (!thread) throw new FirefoxError('UNSUPPORTED', 'This target has no JavaScript thread actor.');
    if (method === 'debugger.setBreakpoint') {
      const source = session.sources.get(args.sourceId); if (!source) throw new FirefoxError('NOT_FOUND', 'Source actor is not part of this tab.');
      let line = args.line, column = args.column;
      if (args.originalSource) { const map = await this.#sourceMap(session, args.sourceId, options); const mapped = map.generatedPosition(args.originalSource, line, column ?? 0); if (!mapped) throw new FirefoxError('NOT_FOUND', 'No generated position maps to this original source location.'); line = mapped.generatedLine; column = mapped.generatedColumn; }
      const positions = (await this.connection.request(source.actor, 'getBreakpointPositionsCompressed', { query: null }, options)).positions;
      const available = positions?.[line] ?? positions?.[String(line)] ?? [];
      const actualColumn = available.find(value => value >= (column ?? 0));
      if (actualColumn === undefined) throw new FirefoxError('UNBREAKABLE_LOCATION', 'No breakable JavaScript position exists at or after the requested column on this line.');
      column = actualColumn;
      const location = { ...(source.url ? { sourceUrl: source.url } : { sourceId: source.actor }), line, ...(column === undefined ? {} : { column }) };
      const breakpointOptions = { ...(args.condition ? { condition: args.condition } : {}) };
      await this.connection.request(session.breakpointList.actor ?? session.breakpointList, 'setBreakpoint', { location, options: breakpointOptions }, options);
      const breakpointId = randomUUID(); session.breakpoints.set(breakpointId, { location, options: breakpointOptions });
      return { tabId: session.tabId, breakpointId, location, verifiedByPause: false };
    }
    if (method === 'debugger.removeBreakpoint') { const breakpoint = session.breakpoints.get(args.breakpointId); if (!breakpoint) throw new FirefoxError('NOT_FOUND', 'Unknown adapter breakpointId.'); await this.connection.request(session.breakpointList.actor ?? session.breakpointList, 'removeBreakpoint', { location: breakpoint.location }, options); session.breakpoints.delete(args.breakpointId); return { removed: true, breakpointId: args.breakpointId }; }
    if (method === 'debugger.pause') { await this.connection.request(thread, 'interrupt', { when: 'now' }, options); return { tabId: session.tabId, pause: await this.#wait(() => session.paused, options) }; }
    if (method === 'debugger.waitForPause') return { tabId: session.tabId, pause: await this.#wait(() => session.paused, options) };
    if (!session.paused) throw new FirefoxError('NOT_PAUSED', 'This tab’s JavaScript debugger is not paused.');
    if (method === 'debugger.resume') { await this.connection.request(thread, 'resume', { resumeLimit: null, frameActorID: null }, options); return { tabId: session.tabId, resumed: true }; }
    if (method === 'debugger.step') { session.paused = null; await this.connection.request(thread, 'resume', { resumeLimit: { type: { into: 'step', over: 'next', out: 'finish' }[args.kind] }, frameActorID: args.frameActor ?? null }, options); return { tabId: session.tabId, pause: await this.#wait(() => session.paused, options) }; }
    if (method === 'debugger.stack') return { tabId: session.tabId, ...(await this.connection.request(thread, 'frames', { start: args.start ?? 0, count: args.count ?? 20 }, options)) };
    if (method === 'debugger.variables') {
      const frames = (await this.connection.request(thread, 'frames', { start: 0, count: 100 }, options)).frames;
      if (!frames.some(f => f.actor === args.frameActor)) throw new FirefoxError('STALE_FRAME', 'frameActor is not part of the current pause.');
      const env = await this.connection.request(args.frameActor, 'getEnvironment', {}, options); return { tabId: session.tabId, frameActor: args.frameActor, environment: bounded(env, 262144) };
    }
    throw new FirefoxError('UNSUPPORTED', `Method not implemented: ${method}`);
  }
  async close() { this.closed = true; this.#disconnect(); this.state = 'idle'; this.started = false; return this.status(); }
}
