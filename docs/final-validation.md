# Final local integration validation — October 30, 2026

## Current installed acceptance

The repaired 0.1.0 bundle was subsequently reinstalled. Its installed `firefox/direct-bridge.mjs` SHA-256 matched the reviewed source: `cafa4f544c67ebfd62676f1e37572c4e6e949dd82697c64ad9ed912bcb4fcdf7`. A single asynchronous launch of the selected real Firefox profile reached connected readiness without a separate connect retry.

The agent then observed the designated browser window, verified foreground focus after a coordinated user handoff, opened DevTools with a fresh-snapshot keyboard action, selected the observed Console button, and visually confirmed the resulting panel through Windows Graphics Capture. No page or account submission was performed. The user was released from the input handoff after the check.

The user separately confirmed that Codex in VS Code could call the directly registered MCP server, obtain native Windows readiness, launch/connect Firefox, and list the selected new tab. The configured standalone command had also passed a 51-tool initialization/status/shutdown check from an unrelated working directory. These distinguish actual IDE acceptance from a backend-only protocol test.

The latest default source suite before publication preparation passed 41 Node tests with one intentional opt-in live skip, plus 29 native self-checks. Earlier actual isolated Firefox tests covered debugging actions as described below. The real signed-in checks establish the named workflows, not universal application, DPI, future Firefox, or every debugger-path compatibility.

A later page-loading investigation compared a stuck Facebook tab with a healthy fresh tab under unchanged extension/userscript settings. It observed a null native-looking performance object in the broken tab and a working object in the fresh tab. The exact intermittent trigger remains unproven. No private page text, credentials, or screenshots are included in this repository.

## Historical integration snapshots

The remaining sections preserve earlier reviews, test counts, and handoff states as recorded at those times. Statements below about installation or visible DevTools acceptance still being pending are superseded by the current acceptance above. Local `.codex/` evidence paths identify ignored development records; they are not files shipped in a source clone.

The reviewed source is staged as a local Computer-Use 2.0 marketplace bundle. The user subsequently registered the marketplace and installed/enabled the original 0.1.0 bundle. Its real Firefox connection and bounded Facebook inspection succeeded. The latest staged bundle includes a separately reviewed launcher-readiness repair that is **not yet installed**. No GitLab check-in, commit or publication occurred.

## Latest launcher-readiness integration

Independent source review is recorded in `docs/firefox-startup-review.md`. A successful launcher exit0 now permits bounded refused pre-TCP readiness retries. Four new launch-path regressions cover delayed readiness, the absent-listener deadline, cancellation and nonzero launcher failure. The original live child exit code was not captured; the exact live cause remains inferred from the demonstrated source defect.

- `powershell -NoProfile -File scripts/build.ps1 -Test -Package`: exit0; native build0warnings/errors;29native self-checks;42Node tests:41passed,1intentional opt-in live skip;29files staged.
- `node scripts/smoke-staged.mjs`: exit0;51public tools; staged native helper ready; no Firefox launch/connection, user content capture or global change by this integration.
- `.codex/startup-integration-evidence.json` records all29ownership-manifest comparisons and27maintained-source/current-build comparisons. Updated `firefox/direct-bridge.mjs` staged SHA256 is `cafa4f544c67ebfd62676f1e37572c4e6e949dd82697c64ad9ed912bcb4fcdf7`.
- `.codex/integration-validation.json` preserves its original snapshot and appends `startupReadinessIntegration` for the current package and installed-versus-staged distinction.

The parent observed the installed original plugin connect after the user's native Firefox approval, attach the designated Facebook tab, and read DOM/computed CSS, retained native console resources, JavaScript source listings and captured HTTP200 network records. This acceptance covers those inspections, rather than every debugger action or a visible DevTools UI. No private Facebook content is copied into this report. The corrected installed launch remains a separate acceptance step after refreshing the cache.

## Earlier integration commands (historical evidence)

- `powershell -NoProfile -File scripts/build.ps1 -Test -Package`: exit0; native build0warnings/errors;29noninteractive native self-checks;38Node tests:37passed,1intentional opt-in live skip; canonical manifests and dependency-free skill checks passed;29files staged.
- `node scripts/smoke-staged.mjs`: exit0;51public tools (14native,35Firefox,2meta); actual staged stdio process and bundled native host worked; Firefox disconnected; no browser launch, user content capture or global configuration change.
- After the final documentation reconciliation, `node scripts/prepare-plugin.mjs` and the same staged smoke passed again. Product implementation source was unchanged; actual GUI/Firefox acceptance was not unnecessarily repeated.
- `.codex/integration-validation.json` records SHA-256 comparisons between every staged file and its ownership manifest, plus maintained-source/current-build matches. Native executable/DLL and all Firefox modules, including browser-window.mjs and profile-setup.mjs, match their latest source/build. Root README and included skill match the final asynchronous workflow.

## Earlier functional component and repair audit

The table below preserves the preceding integration's evidence and counts. The current launcher-readiness package and hashes are recorded above and in the appended JSON proof.

This bounded final functional audit covers seven separately reviewed implementation areas. It rechecked29staged hashes,27source/build comparisons, all6native source hashes from the focus peer review and the current51tool source metadata without repeating unchanged builds or live tests. Functional integration passes; obsolete cleanup remains separately blocked and no task-wide cleanup completion is claimed.

| Fix | Review and actual behavior | Integration proof |
| --- | --- | --- |
| Native base implementation | docs/original-analysis.md defines the13-operation contract; docs/independent-review.md records exact actual method coverage across controlled runs, including literalUnicode,scroll,drag and WGC | Current reviewed build passes29self-checks; staged managed DLL SHA256 fb584070bcfb57fb728ae277fcac1d33c34d6c5e84b26dffddc5b531aaeeb336 andexe26320d6bf267c2c1ed74b6098cb88c9f8aa70de3dc32cba1933cbe495a7e28f8 match build |
| Firefox base direct adapter | docs/firefox-design.md and independent-review.md; distinct reviewer2actual isolatedFirefox tests verify DOM/CSS,console/errors,network/bodies,sources/maps,real debugger,screenshot,navigation and reconnect | All staged Firefox modules match current source; final default suite27Firefox passes plus1intentional live skip; no add-on/signing/native-messaging dependency |
| Root MCP/package/skill | runtime MCP tests verify initialize/schema/errors/cancellation/stdio with spaces; canonical manifests and dependency-free skill validation passed; main reviewer inspected async/readiness instructions | Final integrated37Node passes/1intentional skip;51tool staged stdio smoke (14native+35Firefox+2meta); manifests/rootREADME/skill match source and stage; no registration/install/enable |
| Native owned/modal discovery | docs/independent-review.md; actual tail log2026-10-30T16-40-52.926Z requests14–17 discovered,activated,observed and closed own modal | Staged native executable/managed DLL hashes match current reviewed build;51tool staged smoke |
| Native authoritative owned focus | docs/native-focus-review.md; actual log2026-10-30T16-33-13.517Z typed literalUnicode and setvalue despite false per-node keyboard-focus flag | Same native binary comparison;29self-checks,including foreign/null/password/conflicting-focus refusal |
| Firefox normal-window/privacy and preference restoration | docs/firefox-repair-review.md; distinct reviewer verified explicitnormal destinations and real disposable-profile live refusal/closed restoration | browser-window.mjs/profile-setup.mjs and direct adapter hashes match source; included in staged bundle |
| Firefox TCP/approval timers and asynchronous begin/status | docs/firefox-connection-review.md; distinct reviewer27default passes+1live skip,2actual async Firefox passes,44ms stalled-TCP probe and one delayed approval socket | direct-bridge.mjs/rdp.mjs/launcher.mjs hashes match source; rootREADME+skill match pending/status/disconnect and genuine prompt-readiness workflow |

Controlled native runs collectively supplied actual behavior for all13operations: discovery/revalidation/catalog/launch/activation/state, indexedclick, Unicode, key effect, scroll, editablevalue, Invoke anddrag. A fresh Tab changed actual focus;drag produced20moves; stale snapshots were refused; owned modal worked. Actual visible and occluded WGC frames were independently viewed and retained underlying fixture content rather than the magenta owned occluder. Method metadata showed WGC with no fallback. Native fixtures/hosts were closed; final process check recorded separately in the integration JSON.

## Review and manual installation

Review the staged plugin at `.codex/marketplace/plugins/computer-use-2/` and its `.codex/plugin-stage-manifest.json` ownership/hashes. The marketplace catalog is `.codex/marketplace/.agents/plugins/marketplace.json`.

The user already completed this initial registration:

    codex plugin marketplace add "$PWD\.codex\marketplace"

The user restarted Codex and installed/enabled Computer-Use 2.0. The installed cache still holds the preceding bundle. Refresh it before testing the repaired launch. The locally verified CLI0.166.0-alpha.5.1 documents `plugin remove` as uninstalling the plugin and removing its local cache, and `plugin add` as installing from the configured marketplace. The parent can guide the user through these ordinary manual actions, one at a time:

    codex plugin remove computer-use-2@computer-use-2-local
    codex plugin add computer-use-2@computer-use-2-local

Reconnect/restart the app as needed, confirm that the installed `firefox/direct-bridge.mjs` hash matches the staged repair, then coordinate a normal closed-profile launch and approval test. Neither command was executed by this integration. No version bump is established as necessary by the available CLI contract; same-version cache refresh remains to be verified after the user's removal/reinstallation. `marketplace upgrade` refreshes Git snapshots and is not the local-folder update action.

## Limits

The user's selected default-release profile and native connection-approval prompt were exercised by the parent, followed by the bounded Facebook inspections described above. Windows forwarding to a running profile, the corrected installed-launch path and visible DevTools workflow remain unaccepted. Isolated headless Firefox and an owned blank Windows fixture do not prove universal provider/app, mixed-DPI/multi-monitor, secure-desktop or every cancellation path. UIA provider hangs retain the documented timeout/unknown-outcome limit. Flat source maps only; indexed maps and RDP bulk transfers fail explicitly. No original proprietary OpenAI runtime is bundled.

## Working material and cleanup

Retained for runnable/reproducible local delivery: `.codex/native-host/`, `.codex/native-obj/`, `.codex/native-nuget/`, `.codex/marketplace/`, schema caches, stage/integration manifests and package validation. `.codex/native-acceptance/` retains the owned fixture source/binaries plus failed/successful logs/images for repair evidence; it is excluded from the plugin. Handoffs, post-mortem and taskratchet state belong to the active parent workflow and were preserved. The resolved startup probe helper was removed; its measured result remains in the review and maintained tests cover startup timing.

Cleanup remains blocked for exactly `.codex/firefox-host`, `.codex/firefox-obj`, `.codex/firefox-rdp-probe-profile`, `.codex/probe-rdp.mjs`, `.codex/inspect-firefox-rdp.py` and `.codex/firefox-rdp-handoff.md`. The user explicitly chose `Approve scoped cleanup retry (Recommended)` for those named targets. After verifying absolute immediate-child containment, known obsolete ownership and recursively no reparse points, the integration worker attempted the same PowerShell removal operation once under the same identity. Automatic approval review again rejected it **before execution**, with only `rejected: blocked by policy` and no more specific reason. No alternative deletion method or further removal retry occurred.

All six paths remain present and excluded from the stage. `.codex/scoped-cleanup-retry.md` preserves the complete literal newly approved retry command, rejection and read-only verification. The complete original pre-approval command was unavailable in project records and was not reconstructed. A shell-based attempt to record the retry as an inert JSON string was itself rejected before execution; ordinary file editing recorded the evidence instead. Post-rejection checks confirmed all29stage hashes and27source/build matches unchanged, actual acceptance logs/images present and ownedfixture/nativehost/Firefoxfixture processcounts0. The local bundle remains validated; cleanup is unresolved.
