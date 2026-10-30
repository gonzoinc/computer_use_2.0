# Independent native modal-discovery review

Reviewer: `/root/firefox_design`, different from native fix author `/root/original_analysis`. Scope: read-only native source inspection and the maintained noninteractive build/test command. No native source was edited. No visible UI, input, screenshot capture or user content access was performed.

**Result: bounded source and noninteractive checks pass. Actual Windows modal discovery/input acceptance remains pending the user's readiness gate.**

## Source evidence

- `native/Host/Program.cs:57-72`: inventory collects valid, visible HWNDs, each described using its own process. Ownership is retained as candidate metadata and no longer excludes an otherwise targetable owned HWND. The predicate requires a nonblank title; excludes `WS_EX_NOACTIVATE`; and excludes ordinary `WS_EX_TOOLWINDOW` entries unless they explicitly have `WS_EX_APPWINDOW` or class `#32770`. Consequently a visible, normally activatable dialog keeps its separate selectable HWND instead of being replaced by its owner.
- `native/Host/Native.cs:17-21`: the style/class helpers use `GetWindowLongPtrW`, `GetClassNameW` and `GetWindowThreadProcessId`. `Program.cs:77-84` obtains PID and executable identity for the actual candidate handle, not for the owner returned by `GW_OWNER`.
- `native/Host/SelfTest.cs:9-18`: a synthetic owned-window graph retains IDs100,101,105,106 and rejects the floating tool, no-activate tooltip and hidden dialog. Dialog101 deliberately uses `dialog.exe`, PID20 while its owner uses `owner.exe`, PID10; the independent identity assertion passes. The tool-styled `#32770` dialog and explicitly app-styled palette exceptions are exercised.
- `Program.cs:86-92` still requires previously inventoried handles and rechecks current PID/executable plus the caller's app selection. `Program.cs:98-107` retains desktop, DPI, visibility/minimization, geometry and integrity checks. `Program.cs:117-120` rechecks foreground ownership and geometry before input continues.
- `native/Host/Observation.cs:64-78` retains foreground-observation requirements, snapshot lifetime/PID/app/geometry validation, screenshot identity for coordinates, and current accessibility runtime-ID/type/bounds/enabled/offscreen/password checks. `Input.cs:10-57` retains exact target hit-testing, bounded points, focus ownership and fresh observation requirements across click, key, typing, scroll, drag, value and secondary actions.

The current guards remain in the reviewed source. No immutable pre-fix patch artifact was provided for a byte-for-byte historical comparison; this review does not invent that evidence.

Microsoft documents `EnumWindows` as top-level enumeration and distinguishes ownership through `GetWindow(...,GW_OWNER)`. The reviewed style constants match the documented extended styles. [EnumWindows](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows), [GetWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindow), [extended styles](https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles).

## Executed checks

From the repository root:

```powershell
powershell -NoProfile -File native/build.ps1 -Test
```

Exit0. Build succeeded with **0 warnings, 0 errors**. Host self-test passed **18 checks**, explicitly reporting `interactive_input_sent:false` and `user_content_captured:false`. Native bridge suite passed **4/4 tests**, including status/unknown-window/error/close handling and cancellation before host launch.

The self-test supplies synthetic candidates; it does not establish actual OS dialog enumeration or capture/input success. No additional live checks were run because the visible owned fixture and modal walkthrough are separately gated on user readiness.

## Reviewed source identity

| File | SHA-256 |
| --- | --- |
| Program.cs | `74fe06f47e2cd4dc7e5f78ea61b43be891b5e8e6029be7538a6b2dad0c02e763` |
| Native.cs | `46d10542166afb88398f595dfc2ea25138d1b91dec8d1a2b5845823a5d52563a` |
| SelfTest.cs | `835fd98083db87f97a94dd2ef9df2bd00c5f75ed5e47f6334c7ab73714673015` |
| Observation.cs | `aed54da11e67bbce27a58ac8c4c4974e12ed3d071efe477978ea34320a941674` |
| Input.cs | `839b2656272a3ae23acc5acb4d57853cba40c112830889fcaf53c9862b693aa2` |

Only this maintained QA artifact was created. Build outputs use the existing primary `.codex/native-*` locations. The earlier rejected Firefox scratch-cleanup whitelist was not touched.
