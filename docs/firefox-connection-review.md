# Independent Firefox connection review

Review date: October 30, 2026. The reviewer did not author the Firefox implementation. This review covers the final separate TCP/approval budgets and the default client-safe asynchronous connection lifecycle. Earlier explicit-window/provenance findings are recorded separately in firefox-repair-review.md.

## Outcome

The previous stalled-TCP timing finding is resolved. No remaining defect was found in this bounded connection review. This is not acceptance of the user's existing signed-in profile, visible Firefox approval prompt or Windows forwarding to a running profile.

- firefox/rdp.mjs:17–34 starts a TCP startup timer immediately, then clears it and starts a distinct approval/greeting timer only after TCP connects.
- firefox/direct-bridge.mjs:124–151 forwards the remaining startup budget across refused pre-TCP retries. A pending connected approval socket is never replaced by retry.
- firefox/direct-bridge.mjs:81–114 begins managed connect/launch work and normally returns pending:true,connected:false promptly. Duplicate pending operations fail BUSY; an active connection requires explicit disconnect before replacement. A background failure is retained in connectionOperation.error and has an attached rejection handler.
- A completed short caller's AbortSignal is detached from the background operation. firefox_browser_status reports readiness without opening another socket. firefox_browser_disconnect and close cancel the operation and discard old actor/session/generation state while leaving Firefox itself open.
- waitForConnection:true remains a synchronous expert/direct-API test option; it is not the recommended MCP path.

Codex documents a default60-second per-tool timeout in its [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). Root runtime has no separate outer timer, but that alone cannot extend the client limit. The default begin/status flow therefore matters; no plugin timeout override or client-setting write was invented.

## Independent checks

- node --test firefox/*.test.mjs — exit0;27passed,1intentional live skip; about4.1seconds.
- Explicit isolated live run, with CU2_FIREFOX_LIVE restored in finally: node --test firefox/direct.test.mjs — exit0;2passed; about1.9seconds. The real fixture uses DEFAULT asynchronous launch, observes pending first, polls status until connected, then verifies DOM/CSS, console/errors, network/body, source maps, real breakpoint/frame variables/stepping, screenshot, explicit-window tab creation, navigation and reconnect.
- Updated independent .codex/firefox-startup-probe.mjs to the default begin/status path. A never-connected stub with startup20ms/approval200ms failed in the TCP phase after44ms, using/destroying one socket. The earlier206ms approval-budget overrun is not present. Integration removed this now-obsolete scratch helper after preserving its result here; maintained approval tests cover the startup bound.
- Inspected meaningful tests: delayed greeting3200ms survives normal100ms actor deadline on one socket; default pending returns before approval; completed caller cancellation does not kill background approval; duplicate begin opens no second socket; failed approval and failed launch preparation appear in status; disconnect/close cancel pending work and clear stale state.
- node scripts/validate-package.mjs --offline — exit0; canonical manifests and the edited skill's simple frontmatter checks passed.
- Final read-only process/folder check: zero owned firefox-rdp-test processes and zero disposable fixture profile folders remained.

Only the isolated headless fixture profile was used. No existing user profile, GUI input, native build, global registration, package restaging or blocked cleanup path was changed.

## Separately authored package documentation

As original package-documentation author, this worker updated ONLY README.md and skills/computer-use-2/SKILL.md to describe exact current tool names/arguments, pending versus connected readiness, status polling, explicit disconnect cancellation, normal-window destinations and scoped profile preference restoration.

Those instructions require a genuine user-readiness handoff before Firefox's built-in approval prompt and reuse readiness already given. Ordinary actions do not acquire repeated readiness questions. They instruct MCP agents to keep the asynchronous default rather than use waitForConnection:true.

These documentation edits are author work, not claimed as independently reviewed coverage. The main reviewer must inspect them before final integration. No Firefox implementation source was edited.
