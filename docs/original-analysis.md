# Original Computer Use: dependency and capability analysis

Analysis date: October 30, 2026. Scope: the installed Windows Computer Use plugin and its locally supplied runtime. This report is evidence for an independent implementation, not permission to redistribute or modify the original proprietary software.

## Inputs and identity

- Plugin root: `%USERPROFILE%/.codex/plugins/cache/openai-bundled/computer-use/26.1027.30824` (alias **P** below; personal path generalized).
- Runtime root: `%LOCALAPPDATA%/OpenAI/Codex/runtimes/cua_node/<runtime-id>` (alias **R**).
- Sky package root: `R/bin/node_modules/@oai/sky` (alias **S**).
- Plugin version `26.1027.30824`; `@oai/sky` version `0.7.13`.
- Runtime manifest: Windows x64, Node `24.22.1-cua.1` / binary `24.22.1`, runtime archive `cua-node-0.0.35-20261022235854-0e24579b4572-windows-x64.zip`.
- The plugin manifest declares `Proprietary`. No original implementation source or binaries are copied into Computer-Use 2.0.

Observed SHA-256 values:

| Artifact | SHA-256 |
| --- | --- |
| P/skills/computer-use/SKILL.md | 8211e4b11a19a0dc4f0ace91096c74c5b36037ca4cb2c8988f0f535bb209e951 |
| P/docs/api.md | c36d005fb98ed79837a1a5d4605ebad036cec95864e5646f451425163d5c16af |
| P/docs/guidance.md | b171b26bc19f49226bb594bf3ed3f36666e5dd063a996c297986b2b461ac8efd |
| P/.codex-plugin/plugin.json | bb9a47c68fc222b5e24af0411bb89deaa707c4e34797d2d55cf47e5e38bbd6f4 |
| S/bin/windows/codex-computer-use.exe (1,551,152 bytes) | 49c7f43da0c2a9dbcadfb0c993058147018bf7c1d0fde4360de11ace2c98f45d |
| S/bin/windows/swift/x64/codex-computer-use-swift.exe (56,534,320 bytes) | bb014d4ff39210addd15855dc17d7138ead2e869fb67bc377defdc98ce9dddfd |
| S/bin/windows/swift/x64/MSVCP140.dll | 9e0c916dfd5449f942ccfa79ac5a75372d3094cd1f3c597fbe2b2c0ef1633844 |
| S/bin/windows/swift/x64/VCRUNTIME140.dll | 5824aa784998d5653fda6aecffd6da4a754bbc1795896641b1a1bfa6a3c5d7f6 |
| S/bin/windows/swift/x64/VCRUNTIME140_1.dll | b3b26d1003fbc57dbbc6da9d63d1863b59733b5e76da4df0272720d4196f4b28 |
| S/dist/project/cua/sky_js/src/targets/windows/internal/computer_use_client_base.js | 5e54867417cb120477455e069c2eb53b6513b8e076a06143d4d207cc8a293d95 |

The bundled Swift `manifest.json` names hashes/sizes different from these actual installed files. This report binds to measured file bytes, not that historical manifest. The discrepancy does not itself establish corruption or a cause of the Firefox issue.

## Dependency graph

```text
Computer Use plugin skill/docs + Interrupt/Stop/SubagentStop hooks
  -> node_repl tool + trusted host Sky RPC service
    -> @oai/sky index.js -> sky.js -> create_client / service
      -> WindowsComputerUseClientBase (window2 API normalization)
      -> WindowsComputerUseClient
        -> trusted native pipe supplied by host, when selected
        OR -> WindowsHelperTransport -> codex-computer-use.exe
             -> Win32 input/window/process APIs
             -> UI Automation through COM/UIAutomationCore
             -> Windows Graphics Capture / D3D11 / WinRT
        -> separate supplied Swift Windows helper + C++ runtime DLLs
           (its active selection in this particular host was not observed)
```

The installed public JS entry uses `nodeRepl.rpc("sky", ...)` in a trusted REPL rather than exposing a standalone portable transport. The Windows transport additionally depends on host app approval, Codex turn metadata and termination notifications. The manifest hooks signal `node_repl.turn_ended` on Interrupt, Stop and SubagentStop. The helper transport tracks turn transitions, rejects stopped turns, handles physical Escape, and closes/kills its child on timeout. These host integrations need independent equivalents or explicit limitations in the replacement.

The package-declared npm dependency closure is `@oai/sky@0.7.13 -> @statsig/js-client@3.33.3 -> @statsig/client-core@3.33.3`, the latter declaring no dependencies. Sky also imports its bundled `tslib.es6.js` and Node built-ins (`async_hooks`, `buffer`, `child_process`, `fs`, `os`, `path` and URL helpers). Statsig is a package dependency; this does not establish that every Windows action uses telemetry or a network call. Other runtime packages such as Playwright, Sharp and the browser packages are co-installed, not declared dependencies of Sky and not required by the documented Windows API contract.

The main helper contains Rust source-path strings, including `windows-0.61.3`. REA found no `.dep-v0` cargo-auditable section. A complete list of statically linked Rust crates therefore cannot be recovered or claimed from supplied dependency metadata. Swift standard-library/concurrency strings are present in the companion, but no complete package lock/build provenance was supplied. OS API-set forwarding, runtime `GetProcAddress`/COM activation and system DLL transitive dependencies are likewise not a closed dependency graph.

## Why Firefox can fail

Verified static facts:

- Windows JS wrappers contain no Firefox-specific deny or browser allowlist.
- Both native executables contain Firefox recognition text and native browser URL-policy failure messages.
- The Swift executable contains `BrowserURLPolicy` at file offset 16,137,424 and the unsupported-Windows-browser enforcement message at 16,139,056.
- The main executable contains adjacent browser recognition names including Firefox at file offset 1,271,677; its browser-policy error strings begin in the string at file offset 1,257,223.
- Distinct failure cases exist for a denied URL, inability to verify whether a URL is allowed, unsupported URL-policy enforcement for the current Windows browser, and inability to determine the current URL confidently.

Interpretation: the original native layer treats browsers specially and can refuse browser use when its URL-policy integration is unsupported or cannot identify the URL. That is different from Windows being inherently unable to control Firefox. This is the strongest demonstrated explanation for the reported symptom. **No live original-plugin call or native branch trace was performed, so which of those cases the user actually encountered remains unverified.** Finding a string is not proof that a particular Firefox action takes that branch.

Computer-Use 2.0 should use its own supported Firefox integration and explicit tab/window targeting. It should not patch binaries, spoof trusted host approvals, disable the original policy, or reuse private host pipes.

## Independent parity contract

The documented Windows `window2` surface contains **13 callable methods**, plus `target: "windows"`:

| Method | Required observable behavior |
| --- | --- |
| list_windows | Return currently targetable windows with stable current `id`, owning `app`, optional title. |
| get_window | Rehydrate/validate a returned current window by ID and optional owner. Reject stale or mismatched identities. |
| list_apps | Enumerate discoverable installed apps and their returned windows; optional running/recent-use signals. |
| launch_app | Launch a returned app identity or explicit executable path; return to discovery before acting. |
| get_window_state | Selected-window screenshot and/or UIA snapshot. Defaults screenshot true/text false. Return current window identity. |
| click | Single/double/multiple left/right/middle click at observed window-relative coordinates or current UIA index. |
| press_key | Key/chord input with modifiers, navigation/function/numpad keys and common aliases. |
| type_text | Literal Unicode text at verified current focus, distinct from control-key shortcuts. |
| scroll | Horizontal and vertical wheel deltas originating at an observed window-relative point. |
| set_value | Replace a supported editable UIA element value by fresh observation index. |
| drag | Mouse-down, move and release between observed window-relative points. |
| perform_secondary_action | Invoke a named supported UIA action such as expand/collapse/scroll/raise. |
| activate_window | Bring the uniquely selected, validated window to foreground. |

`Window = {app: string, id: number, title?: string}`. `WindowState = {window, accessibility: object|null, screenshots: array}`. Accessibility exposes formatted indexed `tree` plus optional `focused_element`, `selected_text`, `selected_elements`, `document_text`. Screenshot objects expose `id`, data URL, `zIndex`, dimensions and screen origin where available. A replacement may use a different public API, but these behaviors must be mapped and independently tested.

Mandatory implementation quality requirements follow from the original observable contract: per-window targeting, DPI/coordinate consistency, stale UIA/screenshot rejection, checked focus and hit targets, bounded capture, unknown-outcome errors, balanced key/mouse release on failure, and a working stop/cancel mechanism. Original captures claim Windows.Graphics.Capture support even when windows are occluded; a foreground screen crop alone is not equivalent. Minimized/locked/secure-desktop behavior must be disclosed rather than implied.

The supplied JS includes optional computer-audio methods gated by `SKY_ENABLE_AUDIO`, but the Windows plugin skill does not advertise them in its supported window2 API. Audio capture is an optional extra, not verified parity. Non-Windows runtime targets also exist but are outside this Windows plugin contract. Host overlay, persistent approval UX, telemetry and app catalogs are host integrations, not portable guarantees.

Firefox page DOM/source, CSS/computed style inspection, console, network/HAR/body inspection, JavaScript evaluation, breakpoints and stepping are **additional requested functionality** beyond this original desktop API. They need their own integration and tests. Controlling visible DevTools alone does not prove a structured debugging interface, and a WebExtension bridge alone does not prove full debugger stepping.

## REA evidence and limits

REA 6.8.0, Linux x64, shared session `616deb5df1f94cb09b032de7e6834667` was checked by the parent before this investigation; no target was active. Original executables were never launched. A narrow temporary read-only local HTTP endpoint served only two explicit native artifacts and one JS wrapper. REA process capture staged exact bytes under its working folder primary `/srv/rea/.codex/`; local and remote SHA-256 matched.

| REA operation | Evidence / result |
| --- | --- |
| capture_process_scenario (transfer/hash) | `ev_c84967c33c44bc24d14e9762089018c3169e6b0607992a36de05151e6852328b`; exit 0, all three hashes matched. |
| inspect_pe_imports (main) | `ev_0197bc5dd89c0da6955bbc37a1738118938934f7eddaced0a13918b11da33da7`; 27 DLL descriptors, 296 imports, 0 delay imports, complete within import tables. |
| inspect_pe_imports (Swift) | `ev_0455fc1c04454aadcd4c5a43bcf236f5eaa053eaace1b281ada8a558e7bb944d`; 84 DLL descriptors, 663 imports, 0 delay imports, complete within import tables. |
| capture_process_scenario (static strings) | `ev_ce3d2d2aa103b72dd2fa2b0c7161630189a1d4bf0eceda976c581f3cde8cd3bd`; exit 0; selected string bytes/offsets observed without target execution. |
| inspect_rust_binary | Parent `ev_a2345faaae2dc19f54b3821e7fdea48bd50c94ed80fe9cbc8cc4441b68028b65`, summary `ev_dba32d40cd554d0778a3a6b796af41e39abb5219cd2aba29eb29b5cc2752e451`; no auditable dependency metadata, runtime dependencies unknown. |
| analyze_javascript_application | Parent `ev_bf4302eff54cdc791314e995712d42bdd7a919c55143572facb4cb3d6c1a91f9`, summary `ev_0d66cf701f13d8f6044230a16e3531a7399ccc9c7f9382c708f7513e7cfb0437`; one selected wrapper, 10,627 bytes, 2,761 AST nodes, no parse failures. Application syntax complete; semantic graph retained 544 unknowns. Imports were not implicitly analyzed. |
| capture_process_scenario (cleanup) | `ev_45d7c78ca9c05fd80b58fb3f90d50f0750efa070704cf42ebb6adb7746347f0a`; exit 0; all three staged artifacts removed and no `cu20-*` files remained. |

Key observed native imports include `SendInput`, `EnumWindows`, `SetForegroundWindow`, `CreateProcessW`, `D3D11CreateDevice`, `RoGetActivationFactory`, `DwmGetWindowAttribute`, `GetProcAddress`, and main-helper UIAutomationCore entry points. Strings identify `Windows.Graphics.Capture.GraphicsCaptureItem` and `Direct3D11CaptureFramePool`; imports/strings establish available implementation machinery, not its runtime reachability or successful behavior.

All original binaries, source and user profiles remain unchanged. The artifact endpoint was stopped. REA evidence IDs are references to retained server-session observations; their future availability is not guaranteed after a server restart. The measured identities, findings and limits above remain in this report. This is a bounded static dependency analysis, not a claim that every compiled/runtime dependency or every behavior was reconstructed.

## Complete observed native import descriptor names

These are the complete descriptors returned by the two bounded PE table parses, in file order. Repeated descriptors are preserved. Windows API-set names are logical imports; their concrete OS forwarding targets were not resolved.

### main helper

`KERNEL32.dll`, `msvcrt.dll`, `ntdll.dll`, `advapi32.dll`, `api-ms-win-appmodel-runtime-l1-1-1.dll`, `api-ms-win-core-synch-l1-2-0.dll`, `api-ms-win-core-winrt-l1-1-0.dll`, `api-ms-win-shcore-scaling-l1-1-1.dll`, `bcryptprimitives.dll`, `coremessaging.dll`, `crypt32.dll`, `d2d1.dll`, `d3d11.dll`, `dwmapi.dll`, `dwrite.dll`, `kernel32.dll`, `ntdll.dll`, `ole32.dll`, `oleaut32.dll`, `propsys.dll`, `shell32.dll`, `uiautomationcore.dll`, `user32.dll`, `version.dll`, `winhttp.dll`, `wintrust.dll`, `kernel32.dll`.

### swift helper

`GDI32.dll`, `SHELL32.dll`, `api-ms-win-shcore-scaling-l1-1-1.dll`, `VERSION.dll`, `WINHTTP.dll`, `WINMM.dll`, `ADVAPI32.dll`, `ole32.dll`, `OLEAUT32.dll`, `PROPSYS.dll`, `USER32.dll`, `CoreMessaging.dll`, `d2d1.dll`, `d3d11.dll`, `DWrite.dll`, `api-ms-win-core-toolhelp-l1-1-0.dll`, `api-ms-win-core-winrt-string-l1-1-0.dll`, `api-ms-win-core-synch-l1-1-0.dll`, `api-ms-win-core-handle-l1-1-0.dll`, `api-ms-win-core-file-l1-1-0.dll`, `api-ms-win-core-processthreads-l1-1-0.dll`, `api-ms-win-core-libraryloader-l1-2-1.dll`, `api-ms-win-core-libraryloader-l1-2-0.dll`, `api-ms-win-core-errorhandling-l1-1-0.dll`, `api-ms-win-core-processenvironment-l1-1-0.dll`, `api-ms-win-core-sysinfo-l1-1-0.dll`, `api-ms-win-core-localization-l1-2-0.dll`, `api-ms-win-core-heap-l2-1-0.dll`, `api-ms-win-core-heap-obsolete-l1-1-0.dll`, `api-ms-win-core-processthreads-l1-1-1.dll`, `api-ms-win-core-psapi-l1-1-0.dll`, `api-ms-win-core-profile-l1-1-0.dll`, `api-ms-win-core-winrt-l1-1-0.dll`, `api-ms-win-core-processthreads-l1-1-3.dll`, `api-ms-win-core-synch-l1-2-0.dll`, `api-ms-win-core-synch-l1-2-1.dll`, `dwmapi.dll`, `KERNEL32.dll`, `MSVCP140.dll`, `api-ms-win-core-rtlsupport-l1-1-0.dll`, `api-ms-win-core-kernel32-legacy-l1-1-0.dll`, `api-ms-win-core-memory-l1-1-0.dll`, `api-ms-win-core-namedpipe-l1-1-0.dll`, `dbghelp.dll`, `api-ms-win-core-sysinfo-l1-2-0.dll`, `bcrypt.dll`, `api-ms-win-core-console-l2-1-0.dll`, `api-ms-win-core-console-l1-1-0.dll`, `api-ms-win-core-realtime-l1-1-1.dll`, `api-ms-win-core-string-l1-1-0.dll`, `SspiCli.dll`, `api-ms-win-core-fibers-l1-1-0.dll`, `api-ms-win-core-file-l2-1-0.dll`, `api-ms-win-core-io-l1-1-0.dll`, `api-ms-win-core-file-l1-2-0.dll`, `SHLWAPI.dll`, `WS2_32.dll`, `IPHLPAPI.DLL`, `api-ms-win-core-path-l1-1-0.dll`, `api-ms-win-core-timezone-l1-1-0.dll`, `api-ms-win-core-file-l2-1-2.dll`, `api-ms-win-core-sysinfo-l1-2-1.dll`, `USERENV.dll`, `api-ms-win-core-debug-l1-1-0.dll`, `api-ms-win-core-file-l1-2-2.dll`, `api-ms-win-core-namedpipe-ansi-l1-1-0.dll`, `api-ms-win-core-synch-ansi-l1-1-0.dll`, `api-ms-win-core-threadpool-l1-2-0.dll`, `api-ms-win-core-interlocked-l1-1-0.dll`, `api-ms-win-core-localization-l1-2-2.dll`, `api-ms-win-core-datetime-l1-1-1.dll`, `api-ms-win-core-localization-l2-1-0.dll`, `VCRUNTIME140.dll`, `api-ms-win-crt-stdio-l1-1-0.dll`, `api-ms-win-crt-environment-l1-1-0.dll`, `api-ms-win-crt-time-l1-1-0.dll`, `api-ms-win-crt-heap-l1-1-0.dll`, `api-ms-win-crt-runtime-l1-1-0.dll`, `api-ms-win-crt-filesystem-l1-1-0.dll`, `api-ms-win-crt-math-l1-1-0.dll`, `api-ms-win-crt-locale-l1-1-0.dll`, `api-ms-win-crt-string-l1-1-0.dll`, `api-ms-win-crt-convert-l1-1-0.dll`, `api-ms-win-crt-utility-l1-1-0.dll`.
