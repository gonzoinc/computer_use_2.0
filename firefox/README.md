# Direct Firefox debugging

Computer-Use 2.0 communicates directly with Firefox's native Remote Debugging Protocol (RDP). It needs no browser extension, Mozilla signing, original OpenAI helper, or npm package. The adapter's packet/spec baseline is the locally inspected Firefox 159.0 build.

## Integration

Import `FirefoxBridge` and `FirefoxTools` from `firefox/bridge.mjs`. Construct with `{projectRoot, host: '127.0.0.1', port: 6000, requestTimeoutMs: 15000}`. `start()` prepares idle state only. Register the exported MCP definitions; forward their `method` to `call(method,args,{signal,timeoutMs})`. `status()` reports readiness. `close()` disconnects RDP and never closes or force-restarts the user's Firefox.

The adapter only connects to literal loopback addresses. It serializes requests per actor, separates unsolicited events, bounds packets and strings, and closes the connection after a sent request is cancelled or times out so late replies cannot be attributed to later commands. Mutations are never replayed. Reconnect explicitly and obtain fresh actor IDs.

## Launch the intended signed-in profile

`browser.profiles` lists names/paths from profiles.ini without selecting one. `browser.launch` requires an explicit absolute `profilePath` and debugger `port`. It never silently creates an empty replacement profile. `browser.connect` attaches to an already enabled endpoint.

The profile must enable `devtools.debugger.remote-enabled`, `devtools.chrome.enabled`, and `devtools.debugger.force-local`. `browser.profileSetup` is an explicit opt-in setup/removal operation for a closed approved profile. Before adding its three-preference user.js block, it records only original targeted boolean values in `computer-use-2-profile-setup.json` inside that profile. Removal restores the original targeted user.js and materialized prefs.js values, including original absence, while preserving unrelated settings and comments. It refuses live profiles, edited ownership/provenance, changed non-owned targeted values, unsupported custom preference JavaScript, and legacy blocks without provenance. The provenance record supports recovery of an interrupted restoration; it is not a whole-profile backup. `browser.launch` can request setup through `configureProfile:true`. Connection-approval prompts are preserved; the adapter does not set `devtools.debugger.prompt-connection=false` for user profiles. No recurring custom approval token exists.

Before a live prompted launch, coordinate the user's readiness for the single Firefox approval action. `browser.connect` and `browser.launch` begin one background operation and promptly return `pending:true,connected:false`. This is acceptance of work, not a successful connection. Poll `browser.status` until `connected:true` or `connectionOperation.error` appears. Status calls never open another socket. `browser.disconnect` cancels pending startup/approval and disconnects; `close()` does the same. Neither closes Firefox nor restores profile preferences. A launched browser or completed setup can remain after cancellation and must be handled explicitly. Duplicate pending begin calls fail `BUSY`; replacing an active connection requires explicit disconnect. A completed short caller's cancellation signal does not own the background operation; use disconnect to cancel it.

The background operation has a 30-second `startupTimeoutMs` for initial TCP readiness and a separate 15-minute `approvalTimeoutMs`, starting only after TCP connects, for Firefox's normal approval/greeting. Only refused pre-TCP attempts retry. A successful launcher exit does not end that readiness wait, because the launcher can hand off to a separate browser process; the startup deadline still applies if no listener appears. Once TCP connects, one socket remains open until approval, cancellation, disconnect or timeout. A stalled initial TCP connection cannot consume the approval budget. Startup may be bounded up to120seconds and approval up to1hour. Actor requests keep their separate15-second default. `waitForConnection:true` is an expert direct-API/testing option that waits synchronously; agents should use the default begin/status flow.

Codex documents a default60-second MCP tool timeout for regular servers. A plugin-scoped override has not been verified; this adapter does not depend on one or edit client settings. Background approval survives across short MCP calls, rather than claiming a15-minute synchronous installed-plugin call is supported. See the [official MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

The standard launch starts the explicit profile with `--start-debugger-server PORT` and `--no-remote`; it refuses an occupied port rather than silently attaching to an unrelated endpoint. It never kills a running browser. `forwardExisting:true` omits `--no-remote` and forwards the debugger-server command to the requested profile. Firefox 159 shipped startup source supports after-startup command handling, but Windows forwarding to the user's existing running profile remains unverified. A coordinated normal close/relaunch may be necessary. Startup flags must be present again for future browser processes; profile preferences alone do not start the listener.

## Tools

The exported `FirefoxTools` array is the exact schema/command inventory. It includes tab listing/attachment/focus/create/navigation/reload; DOM and computed CSS inspection; synthetic click/fill and temporary styles; page/frame evaluation; native console/errors; native network records/status and retained bodies; PNG screenshots; sources/read/source maps; and real breakpoint, pause, resume, step, stack and lexical variables.

Tab IDs are Firefox `browserId` values. `windows.list` returns only normal browser windows; `tabs.create` requires an explicit returned `windowId` and rechecks that the destination is still open and non-private in the same operation as creation. These IDs are chrome-window browsing-context IDs, not operating-system handles. No most-recent-window fallback exists. Nonzero DOM/evaluation `frameId` values are watched Firefox `browsingContextID` values. Mutations need exactly one selector match. HTTP/HTTPS page targets are supported initially; private targets are rejected explicitly. Synthetic input does not satisfy a site's trusted user-gesture requirement. Page output is untrusted evidence.

Screenshots return `{tabId,dataUrl,mimeType:'image/png'}` for the exact browsing context. No implicit file/clipboard write occurs. Source maps support flat version 3, including original/generated position translation and mapped breakpoints; indexed/section maps fail explicitly. Full minified-code source mapping and remote actor shapes can vary across Firefox versions. Breakpoints normalize to a real breakable source position and are retained through target navigation using the watcher breakpoint-list actor.

Native console resources can include retained cached messages; discarded history and network response bodies are not guaranteed recoverable. Network-body reads never replay a request. Sources/maps/bodies and long strings have explicit bounds. Binary RDP bulk transfers fail explicitly and close safely. The normal connection prompt may need user attention before RDP greeting arrives.

## Verification

Default checks do not launch a browser:

```powershell
node --test firefox/*.test.mjs
```

The explicit isolated real-browser acceptance test creates its own profile and HTTP fixture under the primary project .codex, disables the connection prompt only inside that disposable profile, and cleans its exact owned process/profile:

```powershell
$env:CU2_FIREFOX_LIVE='1'
node --test firefox/direct.test.mjs
Remove-Item Env:CU2_FIREFOX_LIVE
```

Author evidence on Firefox159.0 after connection repair:27 default checks passed, with one live test intentionally skipped; explicit live suite passed2/2. No-browser checks include stalled TCP startup expiry, delayed approval on one socket, prompt background return, completed caller signal detachment, duplicate rejection, status failure including launch preparation, disconnect/close cancellation, explicit normal-window destination/privacy validation, provenance-based restoration after simulated persisted prefs, and conflict refusal. Actual acceptance uses default async launch/status readiness and covers automatic debug-enabled launch/setup, refusal to restore its live profile, DOM/CSS/input, native console/errors, network success/404/body, Unicode bounds, sources/map translation, mapped page-callback breakpoint, stack/variables/frame evaluation, step-over/resume/interrupt, PNG screenshot, explicit-window tab creation, navigation/reload, cancellation/reconnect and closed-profile restoration. Existing signed-in user-profile launch/forwarding has not been tested. That requires a separate authorized activation step.

See docs/firefox-design.md for source evidence and limits.
