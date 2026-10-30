# Independent verification — October 30, 2026

Reviewer is distinct from native, Firefox and packaging authors. Bounded independent source and controlled-fixture review passed after repairs. All13 native operations now have actual behavioral evidence across controlled runs; visible/occluded WGC images were inspected. Firefox source findings are repaired and independently peer-verified. This does not establish acceptance of the user's signed-in Firefox profile or every Windows app/provider.

## Findings sent to authors

- **P1 native modal discovery, source repair inspected** — `native/Host/Program.cs:58` initially excluded all HWNDs with GW_OWNER. An owned modal was absent from KnownWindows, so could not be selected, observed or activated while its parent lost foreground. Author repaired selection to include normal owned windows and standard #32770 dialogs, with separate tool/no-activate exclusions and unchanged identity guards. Reviewer inspected final code and data-driven parent/modal graph (different-PID modal included). Author's18-check build passed; actual modal acceptance remains pending. Reproduction: launch the owned acceptance fixture, issue `modal` through its own command file, compare returned modal HWND with list_windows.
- **P2 private destination, repaired and peer-verified** — Initial tabs.create used most-recent navigator:browser. Final `firefox/browser-window.mjs` lists only normal windows; tab creation requires an explicit returned windowId and synchronously rechecks open/non-private state before addTab. Main reviewer inspected final helper and matching root README/skill instructions. Independent implementation coverage is recorded in `docs/firefox-repair-review.md`; actual isolated Firefox window creation and private/missing/closed destination fixtures passed.
- **P2 preference restoration, repaired and peer-verified** — Initial removal stripped only user.js marker. Final `firefox/profile-setup.mjs` records targeted original user.js/prefs.js values with checked provenance, refuses live/edited/conflicting state and restores original targeted materialized preferences. Main reviewer inspected implementation and matching root README/skill boundaries. `docs/firefox-repair-review.md` records independent real fixture setup/live refusal/closed restoration and conflict coverage. Provenance is scoped; never describe it as a whole-profile backup.
- **P1 human connection prompt lifetime, repaired and peer-verified** — Initial launch replaced3second greeting sockets. Final RDP separates bounded startup TCP timing from one long cancellable approval socket. Default MCP connect/launch return pending promptly; browser.status reports ready/error and browser.disconnect cancels without closing Firefox. Main reviewer inspected final lifecycle, RDP timing and root README/skill instructions. `docs/firefox-connection-review.md` independently verifies27default passes plus1intentional live skip,2actual async fixture passes, a3.2second delayed greeting on one socket and a stalled-TCP probe that terminates in44ms with startup20ms/approval200ms. No client timeout override is assumed.
- **Documentation precision, repaired** — Native blank/black validation is PrintWindow-only (`native/Host/Observation.cs:59`), while native README could be read as claiming it for WGC too. Author qualified README to fallback-only; final text inspected.

## Independent commands and results

- `powershell -NoProfile -File scripts/build.ps1 -Test -Package`: exit 0; zero build warnings/errors; 16 noninteractive native checks; Node 22 passed, 1 intentionally skipped live test; 27-file local stage prepared. No installation/registration occurred.
- `node scripts/smoke-staged.mjs`: exit 0; 48 public tools, bundled native host, Firefox disconnected, no browser launch/content capture/global configuration changes.
- `CU2_FIREFOX_LIVE=1 node --test firefox/direct.test.mjs` via PowerShell environment assignment and finally removal: exit 0; both tests passed. Actual isolated Firefox159, its owned headless profile and local HTTP fixture exercised DOM/CSS/fill/click, native cached console and exceptions, network200/404/body and UTF8 truncation, source/map reading, mapped breakpoint pause, stack/variables/frame evaluation, step/resume/interrupt, screenshot, navigation/reload/new tab and cancellation/reconnect. Assertions inspect actual values and states rather than only command success.
- Fixture-only initial `dotnet build .codex/native-acceptance/Fixture.csproj -o .codex/native-acceptance/bin ...`: exit 0, zero warnings/errors; `node --check .codex/native-acceptance/run.mjs`: exit0. Subsequent controlled attempts are recorded separately below.

## Final Firefox documentation closure

Main reviewer independently read the final root README and included skill, authored by the package author. Both match current source tool names/arguments and default asynchronous begin/status/disconnect behavior. They distinguish pending from connected, forbid repeated begin calls or synchronous MCP waiting, require a genuine readiness handoff before the built-in approval prompt while reusing readiness already given, and avoid repeated routine readiness questions. Explicit normal-window tab targeting and scoped provenance restoration are documented accurately. No further defect found in these documentation changes.

Final Firefox implementation test results above are attributed to the distinct component reviewer; the main reviewer did not duplicate those suites without a new concern. Subsequent separate integration rebuilt and restaged final repairs, verified all29manifest files and27source/build matches, and passed51tool staged smoke; see docs/final-validation.md and .codex/integration-validation.json. Existing signed-in profile, real approval prompt, Windows forwarding and visible DevTools acceptance remain unperformed.

## Prepared native acceptance

After parent obtains user readiness for pointer/focus work:

    node .codex/native-acceptance/run.mjs --authorized

The driver launches only its own blank WinForms fixture via native launch_app; verifies its exact PID/HWND; tests all13 methods including Unicode, editable value, indexed click, key chord, Invoke, scroll, drag, stale observation rejection, modal discovery and WGC capture. A magenta owned window occludes the fixture. WGC method is required; PrintWindow fallback fails this acceptance rather than being counted. Captures remain under `.codex/native-acceptance/visible.png` and `occluded.png`; reviewer must compare their fixture content before claiming occlusion success. Driver finally requests close only through the exact owned fixture control file and closes its own native bridge.

The fixture reports physical control coordinates so the driver does not assume display scale. Its state/control files and executable remain in the primary project .codex. Compile-only failure/recovery is documented in `.codex/post-mortem.md`.

### First controlled attempt

After explicit readiness, `node .codex/native-acceptance/run.mjs --authorized` exited1 at type_text with `focus_unobserved`. Own Fixture PID37280/HWND4589262 was discovered, revalidated, cataloged, activated and observed. Initial WGC capture succeeded and `visible.png` was visually inspected: correct own field/button/counter/scroll/drag content. After indexed field click and fresh include_text+screenshot observation, native typing refused because FocusRuntimeId was absent. Text remained original; no typing occurred. The second observation was not persisted, so root cause remains unproven. No retry was made.

Finally closed only the owned fixture and native host. Read-only process check returned no Fixture or ComputerUse.NativeHost processes; parent notified immediately to release user input. Native author received reproduction details. Full13-method, modal and occluded capture acceptance was not reached.

### Diagnostic harness prepared; not rerun

Parent requested harness-only diagnostics after the stopped attempt. Each native request is now durably logged before dispatch; each response/error is logged before proceeding, retaining full own UIA tree/focus, snapshot/frame IDs, image origin/dimensions/method, window identity and fixture state, while stripping image base64. Discovery logs omit unrelated desktop/app entries. Logs and captures use unique run timestamps so earlier evidence remains intact. Fixture state now includes actual field/form focus, active control, exact field HWND and physical bounds.

Before typing, the driver performs bounded fresh text-only observations for up to5seconds, retaining every absent/wrong/expected focus assertion. It sends no further input while waiting and refuses typing if the intended field focus is never observed. This records a transient recovery rather than silently hiding it. Fixture compilation and driver syntax checks passed; read-only process count remains0. No diagnostic rerun or visible fixture occurred. Fresh parent-coordinated human readiness is required.

### Second controlled diagnostic attempt

Fresh explicit human readiness authorized one run at2026-10-30T16:11:30Z. Diagnostic log: `.codex/native-acceptance/diagnostic-2026-10-30T16-11-30.433Z.jsonl`. It stopped with `fixture_focus_absent` after5seconds and zero typing requests. All35 observations (initial WGC and34text-only polls) returned full19-node trees including Edit[1] CU2 Unicode field, `truncated:false`, `focused_element:null`; no native errors. Before/after indexed click1, fixture event-driven state showed `fieldFocused:true`, `formContainsFocus:true`, `activeControl:UnicodeField`.

The source branch is isolated: Observation.cs27 assigns snapshot focus only from traversed `Current.HasKeyboardFocus`; Input.cs28 refuses before its separate `AutomationElement.FocusedElement` query at29 and before Unicode events. The exact reason for false UIA focus remains unknown. Initial accessibility precedes WGC, and34later observations omit screenshots, so capture-induced focus loss is unsupported. Fixture state is updated on focus events rather than a separate OS query per poll; do not overstate it as fresh independent OS focus measurement. Native indexed click computes center from current Edit bounds and passed its foreground/hit guards, but actual provider bounds/click point were not emitted.

Own PID12132/HWND10291738 (field10356322) and native host closed in finally; independent read-only process count0. Parent immediately notified user could resume input. Native author received source/evidence. No automatic retry; focus guard remains intact. Remaining native acceptance still open.

### Third controlled attempt: actual focus repair verified; harness telemetry failure

Fresh readiness authorized one repaired-helper run at2026-10-30T16:33:13Z. Diagnostic log: `.codex/native-acceptance/diagnostic-2026-10-30T16-33-13.517Z.jsonl`. Authoritative UIA focus bound intended Edit[1] and exact native fieldHWND393542 despite `uia_reported_keyboard_focus:false`. Actual literalUnicode input produced `original — café 😀`; key chord, set_value to `CU2 verified 😀`, Invoke/count1 and stale-snapshot rejection passed. Initial WGC capture again passed and its saved own fixture image was visually inspected. This verifies the reviewed focus repair beyond its29self-checks/4bridge tests (`docs/native-focus-review.md`).

Run stopped at harness line70 waiting for scroll telemetry. Native scroll request18 returned success; event-driven fixture state stayed scrollY0 during the10second wait, but finally's close-command Save refreshed actualScrollY360. Wheel scrolling therefore occurred; the harness's event-only refresh missed it. No native scroll failure is established. Log records zero drag calls and no modal/occluder creation. Proposed harness-only correction is acknowledged actual-state refresh or periodic UI-thread state snapshots, followed by a separately authorized run. No automatic retry occurred.

Own FixturePID36076/HWND1572882 and nativehost closed; read-only processcount0. Parent immediately released user input. Latest state and screenshots/logs retained under primary .codex for unfinished acceptance.

### Exact13-operation coverage after third attempt

Evidence request numbers below refer to `diagnostic-2026-10-30T16-33-13.517Z.jsonl`, not merely intended test flow.

| Operation | Actual assertion/evidence | Remaining work |
| --- | --- | --- |
| list_windows | request2 returned exact fixtureHWND matched to own PID state | Recheck for owned modal |
| get_window | request3 exact returned HWND/app revalidated | None |
| list_apps | request4 assertion found own executable/window | None |
| launch_app | request1 own executablePID matched newly written fixture state | None |
| get_window_state | request6 actual WGC image/method,own UIA tree/focus/IDs inspected | Occluded WGC image |
| click | request7 indexed Edit[1],subsequent authoritative field focus,Unicode effect | None |
| press_key | request11 Ctrl+a accepted; request16 stale snapshot correctly refused | Actual key effect not separately asserted; targeted tail will send Tab and verify button focus |
| type_text | request9 produced literal `original — café 😀` | None |
| scroll | request18 accepted; finally's fresh actual UI-thread Save reported scrollY360 | Telemetry corrected; native effect already accepted |
| set_value | request13 actual exact field value `CU2 verified 😀` asserted | None |
| drag | No request reached | Targeted tail verifies actual drag moves |
| perform_secondary_action | request15 Invoke produced count1 | Targeted tail also closes modal via its observed button |
| activate_window | request5 accepted,subsequent fresh foreground guards and real inputs passed | Recheck modal activation |

### Harness-only telemetry repair and targeted tail prepared

Fixture now takes read-only actual UI-thread snapshots every100ms, with `observedAt` and current focus/scroll/drag fields. It writes a same-directory pending state then atomically replaces state.json; consumer waits require the right PID and a fresh timestamp, logging each state read. No arbitrary extra delay was added to make assertions pass. Fixture compiled with zero warnings/errors; Node driver syntax check passed. No visible launch/input/capture occurred during this preparation, and ownedprocesscount remains0.

After fresh parent-coordinated readiness, exact next command:

    node .codex/native-acceptance/run.mjs --authorized --remaining

This launches one new owned blank fixture, performs required discovery/identity/activation/fresh observation, sends Tab and asserts actual focus changes from field to increment button, then exercises drag, stale-snapshot refusal, owned modal discovery/activation/close and actual occluded WGC. It does not repeat passed Unicode/set_value/Invoke core or scroll input. Timestamped captures/logs preserve prior evidence. Reviewer must inspect both new own visible/occluded images before accepting occlusion.

### Final controlled targeted tail passed

Fresh explicit readiness authorized `node .codex/native-acceptance/run.mjs --authorized --remaining` at2026-10-30T16:40:52Z. Exit0. Log `.codex/native-acceptance/diagnostic-2026-10-30T16-40-52.926Z.jsonl`; result and visible/occluded PNGs have the same timestamp.

- Request8 sent Tab; request9 freshly bound focus to increment Button[2], proving actual key effect rather than command acceptance.
- Request11 dragged through the owned orange region; fresh UI-thread state recorded20 mouse moves before cleanup. Request12 rejected the invalidated snapshot with stale_observation.
- Request13 captured the main fixture while a distinct magenta owned occluderHWND591308 covered it. WGC reported method Windows.Graphics.Capture with no fallback, background focus was intentionally not queried, and image still showed the correct underlying field/button/blue panel/orange panel rather than the magenta occluder. Both visible and occluded706×593images were independently viewed. Minor active-title/focus/cursor differences are expected; underlying fixture content is intact.
- Request14 discovered owned modalHWND656844;15activated it;16observed its own UIA/capture/focus;17invoked its exact close button. Fixture subsequently reported modal0.
- All current fixture telemetry carried fresh observedAt timestamps and exactPID27600. No repeatedUnicode/set_value/Invoke core or scroll input occurred.

Finally closed owned mainHWND329118/PID27600 and own nativehost. Independent read-only processcount0, reported promptly so the parent released user input. No user app/profile was targeted and no automatic retry occurred. Combined with the earlier actualUnicode/set_value/Invoke/scroll evidence, all13 method behaviors are now covered; modal discovery and actual WGC occlusion acceptance passed. Focus and fixture-telemetry incidents are resolved.

## Limits and cleanup

Live native all13-operation behavioral evidence, modal discovery and visible/occluded WGC occurred only on the owned fixture. No current signed-in Firefox profile, visible DevTools window, Windows launch-flag forwarding or user tab has been touched. Existing-session acceptance remains required. Flat source maps only; indexed maps and RDP bulk fail explicitly. UIA provider hangs remain a documented process-timeout limitation. A successful controlled fixture does not prove universal app/provider parity, mixed-DPI/multi-monitor behavior or every cancellation/secure-desktop case.

Native acceptance fixture/build outputs and logs/images are retained as reproducibility evidence for final integration and future targeted verification; they are excluded from the plugin stage. A later fresh human-approved single retry on the six obsolete Firefox paths was again rejected before execution; all remain present, with no alternate deletion method or further removal retry (see docs/final-validation.md and .codex/scoped-cleanup-retry.md). No commits or publication occurred. The separately assigned integration task restaged the final source, passed29native checks plus37Node tests/1intentional skip and51tool staged smoke, and verified nativebinary/Firefoxmodule/document hashes against source/build. Post-rejection read-only hashes and actual evidence remained current. Installation, enabling and existing-user-session acceptance remain separate.
