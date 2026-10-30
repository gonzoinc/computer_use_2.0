import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureProfile, inspectProfile, listProfiles } from './launcher.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), work = path.join(root, '.codex');
async function ownedFolder(t) {
  await fs.mkdir(work, { recursive: true }); const folder = await fs.mkdtemp(path.join(work, 'firefox-launcher-test-'));
  t.after(async () => { const relative = path.relative(work, folder); assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); await fs.rm(folder, { recursive: true, force: true }); });
  return folder;
}
test('explicit profile setup preserves unrelated prefs and connection approval, and supports owned removal', async t => {
  const folder = await ownedFolder(t), file = path.join(folder, 'user.js');
  const original = 'user_pref("unrelated.setting", "keep me");\nuser_pref("devtools.debugger.prompt-connection", true);\n';
  await fs.writeFile(file, original);
  assert.equal((await inspectProfile(folder)).requiresConfiguration, true);
  await configureProfile(folder); const configured = await fs.readFile(file, 'utf8');
  assert.ok(configured.startsWith(original)); assert.equal((await inspectProfile(folder)).requiresConfiguration, false);
  assert.equal((await inspectProfile(folder)).prefs['devtools.debugger.prompt-connection'], true);
  await configureProfile(folder); assert.equal(await fs.readFile(file, 'utf8'), configured, 'Setup is idempotent.');
  await configureProfile(folder, { remove: true }); assert.ok((await fs.readFile(file, 'utf8')).startsWith(original));
});
test('setup refuses an edited ownership block without modifying it', async t => {
  const folder = await ownedFolder(t), file = path.join(folder, 'user.js');
  await configureProfile(folder); const edited = (await fs.readFile(file, 'utf8')).replace('force-local", true', 'force-local", false'); await fs.writeFile(file, edited);
  await assert.rejects(configureProfile(folder), { code: 'CONFIG_CONFLICT' }); assert.equal(await fs.readFile(file, 'utf8'), edited);
});
test('profile discovery returns metadata paths only and never selects one', async t => {
  const folder = await ownedFolder(t);
  await fs.writeFile(path.join(folder, 'profiles.ini'), '[Profile0]\nName=Signed-in profile\nIsRelative=1\nPath=Profiles/test.default\nDefault=1\n');
  const profiles = await listProfiles({ profileRoot: folder });
  assert.deepEqual(profiles, [{ name: 'Signed-in profile', profilePath: path.resolve(folder, 'Profiles/test.default'), default: true }]);
});
test('removal restores original targeted prefs.js values after Firefox materializes the owned enabled block', async t => {
  const folder = await ownedFolder(t), userFile = path.join(folder, 'user.js'), prefsFile = path.join(folder, 'prefs.js');
  const user = 'user_pref("devtools.debugger.prompt-connection", true);\nuser_pref("unrelated.user", "preserve");';
  await fs.writeFile(userFile, user);
  await fs.writeFile(prefsFile, 'user_pref("devtools.debugger.remote-enabled", false);\nuser_pref("devtools.chrome.enabled", false);\nuser_pref("unrelated.persisted", 42);\n');
  await configureProfile(folder);
  // This is Firefox's persisted effective state, distinct from the original user.js override.
  await fs.writeFile(prefsFile, 'user_pref("devtools.debugger.remote-enabled", true);\nuser_pref("devtools.chrome.enabled", true);\nuser_pref("devtools.debugger.force-local", true);\nuser_pref("unrelated.persisted", 42);\nuser_pref("browser.new-setting", 7);\n');
  const removed = await configureProfile(folder, { remove: true }); assert.equal(removed.restored, true);
  assert.equal(await fs.readFile(userFile, 'utf8'), user, 'Original missing final newline is restored.');
  const persisted = await fs.readFile(prefsFile, 'utf8');
  assert.match(persisted, /remote-enabled", false/); assert.match(persisted, /chrome.enabled", false/); assert.doesNotMatch(persisted, /force-local/);
  assert.match(persisted, /unrelated.persisted", 42/); assert.match(persisted, /browser.new-setting", 7/);
  assert.equal((await inspectProfile(folder)).prefs['devtools.debugger.prompt-connection'], true);
  await assert.rejects(fs.stat(path.join(folder, 'computer-use-2-profile-setup.json')), { code: 'ENOENT' });
});
test('restoration refuses changed managed values and keeps both preference files intact', async t => {
  const folder = await ownedFolder(t), userFile = path.join(folder, 'user.js'), prefsFile = path.join(folder, 'prefs.js');
  await configureProfile(folder); const originalUser = await fs.readFile(userFile, 'utf8');
  const changed = 'user_pref("devtools.debugger.remote-enabled", true);\nuser_pref("devtools.chrome.enabled", true);\nuser_pref("devtools.debugger.force-local", false);\n';
  await fs.writeFile(prefsFile, changed);
  await assert.rejects(configureProfile(folder, { remove: true }), { code: 'CONFIG_CONFLICT' });
  assert.equal(await fs.readFile(userFile, 'utf8'), originalUser); assert.equal(await fs.readFile(prefsFile, 'utf8'), changed);
});
test('legacy owned block without provenance is not assigned invented original values', async t => {
  const folder = await ownedFolder(t); await configureProfile(folder);
  await fs.unlink(path.join(folder, 'computer-use-2-profile-setup.json'));
  await assert.rejects(configureProfile(folder, { remove: true }), { code: 'MISSING_PROVENANCE' });
});
test('commented preferences are not restored as active settings and unrelated comments survive', async t => {
  const folder = await ownedFolder(t), prefsFile = path.join(folder, 'prefs.js');
  const original = '// user_pref("devtools.chrome.enabled", false);\n/*\nuser_pref("devtools.debugger.remote-enabled", false);\n*/\nuser_pref("unrelated.url", "https://example.test/");\n';
  await fs.writeFile(prefsFile, original); await configureProfile(folder);
  await fs.appendFile(prefsFile, 'user_pref("devtools.debugger.remote-enabled", true);\nuser_pref("devtools.chrome.enabled", true);\nuser_pref("devtools.debugger.force-local", true);\n');
  await configureProfile(folder, { remove: true });
  assert.ok((await fs.readFile(prefsFile, 'utf8')).startsWith(original));
  assert.equal((await inspectProfile(folder)).requiresConfiguration, true);
});
test('launcher readiness cannot be enabled by debugging preferences written only in comments', async t => {
  const folder = await ownedFolder(t);
  await fs.writeFile(path.join(folder, 'user.js'), '// user_pref("devtools.debugger.remote-enabled", true);\n/*\nuser_pref("devtools.chrome.enabled", true);\nuser_pref("devtools.debugger.force-local", true);\n*/\n');
  assert.equal((await inspectProfile(folder)).requiresConfiguration, true);
});
test('modified original-value provenance is refused instead of becoming an invented restoration baseline', async t => {
  const folder = await ownedFolder(t), recordFile = path.join(folder, 'computer-use-2-profile-setup.json'), userFile = path.join(folder, 'user.js');
  await configureProfile(folder); const user = await fs.readFile(userFile, 'utf8');
  const record = JSON.parse(await fs.readFile(recordFile, 'utf8')); record.prefs.values['devtools.chrome.enabled'] = [false]; await fs.writeFile(recordFile, JSON.stringify(record));
  await assert.rejects(configureProfile(folder, { remove: true }), { code: 'CONFIG_CONFLICT' });
  assert.equal(await fs.readFile(userFile, 'utf8'), user);
});
