# Independent review of Firefox repairs

Review date: October 30, 2026. Reviewer: a worker distinct from the Firefox implementation author. Scope: explicit normal-window tab creation, original preference restoration, and separate startup/human approval lifetimes. No implementation source was changed.

## Result

Two repairs are verified. The human approval lifetime repair is verified after TCP connection, with one remaining startup-budget defect described below. Existing signed-in profile, visible approval prompt and Windows launch-flag forwarding acceptance remain unperformed.

### Verified: explicit normal destination

firefox/browser-window.mjs:2–6 lists normal browser windows and excludes private/closed windows. createNormalTab at lines8–17 selects the exact windowId, rechecks privacy/closed status synchronously before addTab, and restricts created URLs to HTTP/HTTPS. firefox/direct-bridge.mjs:24–25 requires a windowId rather than using the most-recent window.

The VM fixture exercises two normal windows plus a most-recent private window; creation stays in the specified normal window, rejects private/missing/closed IDs, and rechecks privacy after the earlier list. The actual isolated Firefox fixture also lists its normal window and creates a tab in that returned windowId. IDs are explicit; no ambiguous current-window default remains.

### Verified: targeted restoration with provenance

firefox/profile-setup.mjs records original targeted values from both user.js and prefs.js before enabling the three owned preferences. Removal restores original targeted persisted values, preserves unrelated preferences and the normal connection prompt, and removes only its own block/provenance. It does not execute profile JavaScript.

Inspected assertions cover persisted true values after Firefox materialization, originally absent values, unrelated new settings, original missing final newline, idempotence, edited block/provenance, missing provenance, comments and conflicting targeted settings. Invalid provenance and conflicting values refuse restoration. The actual isolated live fixture rejects removal with PROFILE_IN_USE while Firefox owns that profile lock, then verifies restoration after stopping only its owned browser process.

This proves behavior for the explicit disposable fixture profile, not for the user's existing signed-in profile.

### Verified after TCP: one long cancellable human-approval socket

firefox/direct-bridge.mjs:88 passes approvalTimeoutMs (default900000ms) to RdpConnection.connect; its normal operation timeout is not used as the greeting deadline. Only pre-TCP ECONNREFUSED retries are allowed at line95.

The approval fixture delays the greeting3200ms while the ordinary operation deadline is100ms and startupTimeoutMs is1000ms. It succeeds with exactly one accepted socket. A second fixture never greets, then cancellation closes it without creating a replacement prompt.

The packaging runtime supplies no outer15-second deadline: runtime/mcp.mjs:40 passes arguments unchanged with an AbortSignal, and runtime/server.mjs does not impose an operation timer.

## Remaining finding: P2 stalled TCP ignores the separate startup budget

- Source: firefox/direct-bridge.mjs:80–95 and firefox/rdp.mjs:17–30.
- The startup deadline is checked only after a refused connection. RdpConnection starts the approval timer before TCP has connected.
- If the first TCP connection stalls without a connect/error event, startupTimeoutMs does not stop it. It consumes approvalTimeoutMs instead.
- Controlled reproduction used an isolated Node process and a stub socket that emitted neither TCP connect nor error; it made no network request and touched no browser/profile.
- browser.connect with startupTimeoutMs20 and approvalTimeoutMs200 rejected after206ms, using one socket. The default stalled-TCP wait can therefore consume the15-minute approval allowance despite the documented30-second startup allowance.
- Required behavior: bound pre-TCP readiness with the startup budget, then hold one connected socket for the separate long approval budget. Retain cancellation and never retry a pending approval socket.

The reproduction helper originally remained at .codex/firefox-startup-probe.mjs for repair/reverification. The parent and Firefox author were notified; reviewer did not self-fix. Later independent connection review verified the repair (see firefox-connection-review.md); integration removed the obsolete helper after preserving its result and retained the maintained startup-budget tests.

## Checks performed

- node --test firefox/*.test.mjs — exit0,22passed,1intentional live skip; about3.4seconds including the3.2-second delayed-greeting assertion.
- Explicit isolated live check with CU2_FIREFOX_LIVE=1, restored the previous environment value in finally: node --test firefox/direct.test.mjs — exit0,2passed; about1.9seconds. Actual Firefox DOM/CSS, console/errors, network/body, sources/maps, mapped breakpoint pause, stack/frame values, stepping/resume, screenshot, navigation/new-tab and reconnect assertions passed.
- node .codex/firefox-startup-probe.mjs — exit0; reproduced the startup-budget mismatch at206ms with no network/browser activity.

The actual Firefox test closed its RDP connection, stopped only its exact owned fixture process and removed its disposable profile. No existing user browser/profile, global configuration, package stage, native build or blocked cleanup path was changed.
