import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { FirefoxError } from './rdp.mjs';
import { setupProfile as configureProfile, readBooleanPreferenceValues } from './profile-setup.mjs';
export { configureProfile };
export async function findFirefox(explicitPath) {
  const candidates = explicitPath ? [explicitPath] : [path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Mozilla Firefox/firefox.exe'), path.join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Mozilla Firefox/firefox.exe')];
  for (const file of candidates) try { const info = await fs.stat(file); if (info.isFile()) return path.resolve(file); } catch { /* Try the next known installation. */ }
  throw new FirefoxError('FIREFOX_NOT_FOUND', 'Firefox was not found. Supply its exact executable path.');
}
export async function inspectProfile(profilePath) {
  if (typeof profilePath !== 'string' || !path.isAbsolute(profilePath)) throw new FirefoxError('INVALID_ARGUMENT', 'An explicit absolute Firefox profilePath is required.');
  const folder = await fs.stat(profilePath).catch(() => null);
  if (!folder?.isDirectory()) throw new FirefoxError('INVALID_ARGUMENT', 'The explicitly approved profile directory does not exist.');
  const values = {};
  for (const name of ['prefs.js', 'user.js']) {
    const source = await fs.readFile(path.join(profilePath, name), 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
    for (const [key, entries] of Object.entries(readBooleanPreferenceValues(source))) if (entries.length) values[key] = entries.at(-1);
  }
  return { profilePath: path.resolve(profilePath), prefs: values, requiresConfiguration: values['devtools.debugger.remote-enabled'] !== true || values['devtools.chrome.enabled'] !== true || values['devtools.debugger.force-local'] !== true };
}
export async function listProfiles({ profileRoot = path.join(process.env.APPDATA ?? '', 'Mozilla/Firefox') } = {}) {
  const source = await fs.readFile(path.join(profileRoot, 'profiles.ini'), 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
  const sections = []; let section;
  for (const line of source.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line); if (header) { section = { section: header[1] }; sections.push(section); continue; }
    const pair = /^\s*([^=;#]+?)\s*=(.*)$/.exec(line); if (pair && section) section[pair[1]] = pair[2].trim();
  }
  return sections.filter(item => /^Profile\d+$/.test(item.section) && item.Path).map(item => ({ name: item.Name ?? item.section, profilePath: item.IsRelative === '1' ? path.resolve(profileRoot, item.Path) : path.resolve(item.Path), default: item.Default === '1' }));
}
export async function launchFirefox({ profilePath, firefoxPath, port = 6000, headless = false, configure = false, forwardExisting = false, url, signal } = {}) {
  const checkCancelled = () => { if (signal?.aborted) throw new FirefoxError('CANCELLED', 'Firefox launch cancelled; any completed profile setup remains explicitly restorable.'); };
  checkCancelled();
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new FirefoxError('INVALID_ARGUMENT', 'debuggerPort must be an integer between 1 and 65535.');
  const firefox = await findFirefox(firefoxPath);
  let profile = await inspectProfile(profilePath);
  checkCancelled();
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', e => reject(new FirefoxError('ENDPOINT_IN_USE', `The requested loopback debugger port is unavailable (${e.code}). Connect explicitly if it belongs to the intended Firefox profile; no browser was launched.`)));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(resolve));
  });
  checkCancelled();
  if (configure) { await configureProfile(profile.profilePath); profile = await inspectProfile(profile.profilePath); }
  checkCancelled();
  if (profile.requiresConfiguration) throw new FirefoxError('SETUP_REQUIRED', 'This profile needs devtools.debugger.remote-enabled=true and devtools.chrome.enabled=true; force-local must remain true. Explicitly opt in to configureProfile while it is closed, or enable the DevTools settings in the running browser. Connection prompts are preserved.');
  const args = [...(headless ? ['--headless'] : []), ...(forwardExisting ? [] : ['--no-remote']), '--profile', profile.profilePath, '--start-debugger-server', String(port)];
  if (url !== undefined) {
    const parsed = new URL(url); if (!['http:', 'https:', 'about:'].includes(parsed.protocol)) throw new FirefoxError('RESTRICTED_URL', 'Launch URL must be HTTP, HTTPS or about:blank.');
    if (parsed.protocol === 'about:' && url !== 'about:blank') throw new FirefoxError('RESTRICTED_URL', 'Only about:blank is supported for a blank launch.');
    args.push(url);
  }
  checkCancelled();
  const child = spawn(firefox, args, { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  return { child, pid: child.pid, firefoxPath: firefox, profilePath: profile.profilePath, port, forwardExisting, promptExpected: profile.prefs['devtools.debugger.prompt-connection'] !== false };
}
// Integration fixtures use this exact owned PID only. It is deliberately not an MCP tool.
export async function stopOwnedFixture(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') await new Promise(resolve => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve()));
  else child.kill('SIGTERM');
}
