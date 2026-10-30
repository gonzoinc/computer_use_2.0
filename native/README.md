# Independent Windows backend

Computer-Use 2.0 implements the original Windows skill's thirteen desktop operations without OpenAI's binaries, packages, host pipes or permission tokens. Firefox page debugging belongs to the separate direct Firefox RDP adapter; this backend can operate Firefox's visible desktop/DevTools windows like other selected applications.

## Build and verify

Windows 10 version 2004 or later, .NET 10 Windows Desktop runtime/SDK and Node 24 or later are required.

Run from the project root:

    powershell -NoProfile -File native/build.ps1 -Test

Maintained source lives in native/. Generated binaries, intermediates and restored targeting packs stay in the project's primary .codex/ as native-host/, native-obj/ and native-nuget/. They are retained because the unfinished plugin needs a runnable host and reproducible verification; they are not source files to commit. The SDK targeting pack is explicitly pinned to Microsoft.Windows.SDK.NET.Ref 10.0.19041.57 via WindowsSdkPackageVersion; the package is covered by the Windows SDK license at https://aka.ms/WinSDKLicenseURL. No third-party D3D wrapper or original proprietary runtime is required.

The self-test validates Win64 interop layout, coordinates/negative monitor origins, key chords/numpad keys, Unicode surrogate representation, frame/window identity checks and capture limits without capturing user content or sending input. Node tests cover strict exported schemas, cancellation before dispatch, real JSONL status/error handling and cooperative host shutdown. These checks are author validation, not independent review or live GUI acceptance.

## Integration

native/bridge.mjs exports NativeBridge and NativeTools:

    const bridge = new NativeBridge({projectRoot});
    await bridge.start();
    const status = await bridge.status();
    const result = await bridge.call('list_windows', {});
    await bridge.close();

Constructor options: projectRoot (required), hostPath (optional absolute executable override), requestTimeoutMs (default 15000). call(method, args, {timeoutMs, signal}) accepts a per-operation timeout and optional AbortSignal. NativeTools entries contain name, description, inputSchema and internal method. Strip method before returning MCP tool definitions. The fourteen tool definitions include status plus the thirteen desktop operations.

The persistent C# STA process reads JSONL {id, method, args} and returns {id, result} or {id, error: {code, message, data?}}. Stdout contains protocol only; diagnostics use stderr. Only one operation is active per bridge. There are no automatic retries.

## Observation and action contract

1. Discover windows/apps and select an exact returned {id, app, title?}.
2. Activate the chosen window when input is required.
3. Call get_window_state with that window. include_screenshot defaults true; include_text defaults false.
4. Read the returned snapshot_id, accessibility indexes and/or screenshot id.
5. Send one targeted action, then observe again.

Every input requires current snapshot_id. Coordinate clicks, scrolling and dragging additionally require current screenshot_id. UIA indexed clicks/set_value/secondary actions require a fresh index. Snapshots expire after thirty seconds and all snapshots are invalidated before any input. Background windows can be observed, but input requires a fresh foreground observation. Reused HWNDs with a different process owner are rejected. Visible normal owned windows and modal dialogs are discoverable with their own HWND/process identity. Non-activating transient layers and ordinary tool windows are excluded; explicitly app-marked tool windows and standard dialog-class windows remain selectable.

Screenshot coordinates are physical pixels relative to the returned image. origin_x/origin_y map image coordinates to the virtual desktop, including negative monitor origins. WGC uses verified DWM extended frame bounds, which can differ from the outer window's invisible resize margins. Geometry mismatches fail rather than guessing a scale.

The UIA tree is bounded to 1200 nodes, depth 32, approximately 24K tree characters and 2.5 seconds between provider calls. Individual COM provider calls can still hang; the bridge timeout cooperatively cancels and then terminates the owned host if needed. No arbitrary thread termination or original helper fallback occurs.

## Capture and control limits

WGC is primary: an HWND-scoped GraphicsCaptureItem, a BGRA D3D11 device (hardware then WARP), a free-threaded frame pool, and SoftwareBitmap PNG encoding on an MTA task. The OS capture border and protection settings are preserved. HWND capture is designed to work when the selected window is occluded. Independent controlled acceptance captured an owned blank WinForms fixture both visible and covered by an owned magenta window; actual WGC method/no-fallback metadata and both images were checked. This verifies that fixture, while status.wgc_supported alone only reports OS API support.

PrintWindow is the explicit fallback. Its method and WGC failure reason are returned. Blank/black PrintWindow frames are rejected, although partial or stale GPU content cannot always be detected. WGC frames are not content-screened; receiving a WGC frame does not prove that every GPU/protected surface rendered. The fallback does not promise WGC's occlusion behavior. Both paths reject minimized, hidden, inaccessible/elevated, protected or mismatched targets when those conditions are detectable. Captures are bounded to 24MP, maximum dimension 8192, and WGC encoded PNG 32MB.

Input verifies foreground identity and geometry before events. Mouse points must hit the selected HWND rather than an overlaying window. Literal Unicode uses UTF-16 SendInput events, including both surrogate units. Key chords support modifiers, navigation, function keys and distinct KP_Enter extended input. Shifted punctuation requires explicit Shift. Control characters use press_key rather than type_text.

Observation queries AutomationElement.FocusedElement separately from per-node HasKeyboardFocus flags. Before reading its name or text, the backend verifies its UIA process plus actual native HWND-root/process ownership. It binds that runtime identity and name/type/geometry fingerprint to a snapshot node; a separately observed focus node can use one reserved slot if ControlView traversal omitted it. Null, unowned, password, offscreen, disabled or conflicting focus stays unbound and typing remains blocked. Background observations skip the global focus query and still return the selected window’s own tree/screenshot.

accessibility.focus_diagnostics reports the global-query source, binding state, matched index and own-target selected-thread GetGUIThreadInfo focus metadata. Unowned handles/text are suppressed. This native thread probe is evidence only and never selects a typing destination. The same runtime identity, fingerprint and native ownership are checked again before and during typing. Password fields are excluded. UIA ValuePattern and supported Invoke/ExpandCollapse/Toggle/SelectionItem/Scroll/Window patterns back element operations. The Start Menu/App Paths/current-user packaged-app catalog is bounded; inaccessible/broken entries can be omitted, and historical usage metadata is not fabricated.

Physical Escape stops ongoing input. AbortSignal, bridge close or timeout sets a private per-host named cancellation event; input routines check cancellation and release only their own held keys/buttons in finally blocks. A stuck provider is terminated after a grace period. Forced process termination can still leave outcome uncertainty, so the caller must reobserve instead of retrying automatically. The backend does not automate locked/secure desktops or higher-integrity windows.

Initial author verification used no live screenshots or interactive input. Subsequent independent, human-authorized controlled runs exercised all thirteen operations on an owned blank fixture: launch/discovery/revalidation, foreground activation, UIA/WGC observation, indexed click, actual Tab focus change, literal Unicode, editable value replacement, wheel scrolling, drag, Invoke and owned modal handling. Invalidated snapshots were refused. Visible and occluded WGC frames were inspected. Focus observation was repaired and real typing verified; the local source checkout retains docs/independent-review.md and docs/native-focus-review.md. This does not establish universal UIA/provider, installed-app catalog, mixed-DPI/multi-monitor or secure-desktop compatibility; acceptance of a user's specific application remains separate.
