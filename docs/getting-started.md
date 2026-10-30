# Build, install, and connect

## Requirements

- A local Windows x64 session; Windows 10 version 2004 or later.
- Node.js 24 or later on PATH.
- .NET 10 SDK with Windows Desktop targeting support to build. A prepared bundle needs the .NET 10 Windows Desktop runtime instead.
- Firefox for browser debugging. The shipped protocol baseline was verified against Firefox 159.0.

The Windows SDK .NET projection is pinned to `10.0.19041.57`. Restore packages, build outputs, plugin staging, and schema caches stay in the repository's ignored `.codex/` directory.

## Build the local bundle

```powershell
git clone https://github.com/gonzoinc/computer_use_2.0.git
cd computer_use_2.0
powershell -NoProfile -File scripts/build.ps1 -Test -Package
node scripts/smoke-staged.mjs
```

The build creates `.codex/native-host/` and `.codex/marketplace/`. The latter contains a marketplace catalog and `plugins/computer-use-2/` with runtime modules, native helper, license, artwork, documentation, and usage skill. `.codex/plugin-stage-manifest.json` records the generated files and their hashes. Packaging refuses to replace modified or unmanaged stage files.

Default tests exercise the host, MCP contract, and simulated browser protocol without launching Firefox or controlling user windows. Separate opt-in browser tests are documented in the [Firefox guide](../firefox/README.md).

## Codex desktop

From the repository folder:

```powershell
codex plugin marketplace add "$PWD\.codex\marketplace"
codex plugin add computer-use-2@computer-use-2-local
```

Restart Codex. Select and enable **Computer-Use 2.0** for your chat or project. Its local marketplace is named **Computer-Use 2.0 Local**. Start a new chat or reconnect the MCP client if the tools do not appear.

Ask the agent to call `computer_use_status`. A successful Windows readiness response does not mean Firefox is connected; browser launch and connection are explicit operations.

## Codex in VS Code

The IDE uses a direct MCP registration. From the built repository:

```powershell
$server = Join-Path $PWD '.codex\marketplace\plugins\computer-use-2\runtime\server.mjs'
codex mcp add computer_use_2_local -- node $server
```

This uses the packaged server instead of the desktop plugin's install cache. Keep the repository and bundle at that location, or update the registration after moving them. The server resolves its own files from the entry point, so the editor's working directory can differ.

Install the maintained usage skill as a local directory junction, if that skill name is not already installed:

```powershell
$skillsRoot = Join-Path $env:USERPROFILE '.agents\skills'
New-Item -ItemType Directory -Path $skillsRoot -Force | Out-Null
$destination = Join-Path $skillsRoot 'computer-use-2'
if (Test-Path -LiteralPath $destination) {
    Write-Host 'A computer-use-2 skill already exists; inspect it before replacing it.'
} else {
    New-Item -ItemType Junction -Path $destination -Target (Resolve-Path '.\skills\computer-use-2').Path
}
```

Run **Developer: Reload Window** in VS Code. Ask its Codex agent to call `computer_use_status` on `computer_use_2_local` before connecting Firefox.

The [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp) is shared between the desktop app, CLI, and IDE. A global direct registration can therefore also appear in the desktop app. Choose one backend per operation; do not drive the same desktop concurrently from different agents. Each server instance maintains its own browser connection and observations.

Native tools require Windows. If the editor runs its agent in WSL, an SSH host, or a container, confirm a suitable local Windows executor rather than assuming that environment can control the desktop.

## Start Firefox debugging

Give the agent the page or application to inspect, then:

1. Call `firefox_browser_profiles` and explicitly choose a profile. Profile names alone do not prove which profile is currently in use; `about:profiles` in Firefox identifies it.
2. If the profile needs configuration, save your work and close Firefox normally. Explicitly approve `firefox_browser_profileSetup` or `configureProfile:true` for that closed profile. This changes only three debugging preferences and records their original targeted values.
3. If Firefox is closed, call `firefox_browser_launch` with the selected absolute `profilePath` and port. If its debugger endpoint is already running, use `firefox_browser_connect` instead. Connect does not launch a browser.
4. Coordinate Firefox's own connection approval prompt. A Codex tool-approval dialog is a separate approval and does not establish browser readiness.
5. Keep the normal asynchronous flow: begin once, then poll `firefox_browser_status` until `connected:true` and `pending:false`, or until an error is reported. Do not repeatedly open new connections while pending.
6. List tabs and select the exact returned tab ID. Start console and network observation before reproducing the problem.

The striped address bar and robot icon are Firefox's remote-control indicator. The browser remains in the chosen real profile; no replacement empty profile is silently created.

The startup budget defaults to 30 seconds, with up to 15 minutes for approval after TCP connects. `firefox_browser_disconnect` cancels a pending connection or disconnects an active one without closing Firefox. These tools do not silently restore profile preferences; use the explicit closed-profile removal workflow when needed. See [profile ownership and restoration](../firefox/README.md).

## Update or remove

Fully quit clients using the installed cache or packaged bundle before updating those files. Calling `computer_use_cancel` releases the native helper and RDP connection, but the client may still hold its MCP server or working directory open.

Rebuild the source bundle, then refresh the desktop plugin:

```powershell
powershell -NoProfile -File scripts/build.ps1 -Test -Package
codex plugin remove computer-use-2@computer-use-2-local
codex plugin add computer-use-2@computer-use-2-local
```

Run the CLI steps in a separate PowerShell window while Codex is closed if cached files are in use. Restart clients afterward. The direct VS Code registration keeps its path but must reconnect to load updated modules. Refreshing a Git marketplace is not a substitute for rebuilding this local-folder bundle.

To remove the direct registration:

```powershell
codex mcp remove computer_use_2_local
```

To remove the desktop plugin and its marketplace registration:

```powershell
codex plugin remove computer-use-2@computer-use-2-local
codex plugin marketplace remove computer-use-2-local
```

These commands do not delete your source checkout or Firefox profiles. The separately linked usage skill remains until you intentionally remove its junction. Profile preference restoration is an explicit operation for a closed profile; see the Firefox guide.
