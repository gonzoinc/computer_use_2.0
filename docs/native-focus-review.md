# Independent native focus review

Reviewer: Firefox adapter author, independent of the native focus patch author. Scope: read-only review of native source and non-interactive verification. No GUI control, input, screenshots or user-content capture was performed.

## Result

No blocking source finding in the reviewed patch. This supports proceeding to a separately readiness-gated controlled GUI acceptance test; it does not establish actual Windows provider focus behavior.

- `FocusObservation.cs:13-29` checks UIA process identity and walks native ancestry to an actual HWND whose owning PID and GA_ROOT match the selected target. Focus name/document/selection reads follow this ownership check. Password targets are rejected before their display text is read through the focus path.
- `FocusObservation.cs:56-64` clears previous focus binding and skips the global focused-element query for background targets. Background accessibility traversal and image capture remain available. Diagnostics query the selected window thread through GetGUIThreadInfo, expose only an owned focus HWND, and never infer a typing selector or return foreign focus text/handles.
- `DecideFocusBinding` rejects absent, foreign, ambiguous-runtime-ID, changed-fingerprint, password, disabled/offscreen and zero-size targets. Binding requires runtime ID plus name/type/bounds. An independently observed owned focus absent from control-view traversal receives a reserved indexed slot; traversal stops at1199 and total nodes are capped at1200. HasKeyboardFocus is informational: the authoritative focused-element API can bind a matching node even when the traversal/provider flag is false. No first-edit fallback was found.
- `MatchesObservedFocus` and `Input.cs:29-31` recheck the current global focus, native ownership, runtime ID, name/type/bounds, password, enabled and offscreen properties before typing and for each UTF-16 unit. Existing snapshot age, foreground owner, executable/PID, geometry, desktop/integrity and stop guards remain on the input path. Any partial input remains nontransactional, as documented by the failure message.

## Checks

`powershell -NoProfile -File native/build.ps1 -Test` exited0: build0 warnings/errors,29 host self-checks and4 Node bridge checks passed. The self-checks exercise owned authoritative binding despite false reported focus; null/UIA-PID/native-PID/root mismatch; changed fingerprint; duplicate runtime IDs; password/offscreen refusal; and separately observed focus indexing. They also retain modal classification, coordinate, stale-frame/age/geometry/PID and capture-bound checks. Output reports `interactive_input_sent:false,user_content_captured:false`.

These checks exercise the pure binding decision and existing host/bridge behavior, not live UIA provider calls, actual keyboard delivery or background capture rendering. Controlled foreground/background, focus changes, Unicode typing and modal GUI acceptance remain pending the user's fresh readiness confirmation.

## Reviewed SHA256

| Source | SHA256 |
| --- | --- |
| native/Host/FocusObservation.cs | A30E689A95D23072E91A767960364F0887F291FD34363BB0817E799BECD7FE22 |
| native/Host/Observation.cs | F68DECBAD799BB9165785AF48E5435974F16FD23939B5CC708A673D909B8DFA7 |
| native/Host/Input.cs | D599BE7BE6D584ADD654CF29E6F5DD4E52043A74ACDB4CD953F3B1CF02296911 |
| native/Host/Program.cs | EA551CBF73D9D858D7179BEDB7703306A0601EAFF8DACC4380E74959F663E416 |
| native/Host/Native.cs | A35D6F6562D78D92DA6EC9B562247181B9FA89CAF731AED13927F802C1E53C3F |
| native/Host/SelfTest.cs | E6395F5F5ED2A5826A1E84EAD765334E8FEF248967337E1C57D1329FED385B4B |

Build material remains in the project's existing primary `.codex/native-host` and `.codex/native-obj` outputs for packaging/reproducibility. No new scratch helpers were created, no blocked cleanup was retried, and native source was not changed.
