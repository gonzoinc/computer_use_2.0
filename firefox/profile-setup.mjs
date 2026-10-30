import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { FirefoxError } from './rdp.mjs';

const keys = ['devtools.debugger.remote-enabled', 'devtools.chrome.enabled', 'devtools.debugger.force-local'];
const begin = '// BEGIN Computer-Use 2.0 direct debugging';
const end = '// END Computer-Use 2.0 direct debugging';
const block = `${begin}\n${keys.map(key => `user_pref("${key}", true);`).join('\n')}\n${end}`;
const recordName = 'computer-use-2-profile-setup.json';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function readFile(file) { try { return { text: await fs.readFile(file, 'utf8'), existed: true }; } catch (e) { if (e.code === 'ENOENT') return { text: '', existed: false }; throw e; } }
function sourceContexts(text) {
  const output = text.split(''), inString = new Uint8Array(text.length); let quote = null, escaped = false, comment = null;
  for (let index = 0; index < text.length; index++) {
    const c = text[index], next = text[index + 1];
    if (comment) {
      if (c !== '\n' && c !== '\r') output[index] = ' ';
      if (comment === 'line' && (c === '\n' || c === '\r')) comment = null;
      else if (comment === 'block' && c === '*' && next === '/') { output[++index] = ' '; comment = null; }
    } else if (quote) {
      inString[index] = 1;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') { quote = c; inString[index] = 1; }
    else if (c === '/' && next === '/') { output[index] = output[++index] = ' '; comment = 'line'; }
    else if (c === '/' && next === '*') { output[index] = output[++index] = ' '; comment = 'block'; }
  }
  return { text: output.join(''), inString };
}
function preferences(text, includePrompt = false) {
  const selectedKeys = includePrompt ? [...keys, 'devtools.debugger.prompt-connection'] : keys;
  const values = Object.fromEntries(selectedKeys.map(key => [key, []])), spans = [];
  const contexts = sourceContexts(text);
  // Firefox writes canonical boolean user_pref statements; do not execute arbitrary profile JS.
  const pattern = includePrompt ? /^[ \t]*user_pref\s*\(\s*"(devtools\.(?:debugger\.(?:remote-enabled|force-local|prompt-connection)|chrome\.enabled))"\s*,\s*(true|false)\s*\)\s*;/gm : /^[ \t]*user_pref\s*\(\s*"(devtools\.(?:debugger\.(?:remote-enabled|force-local)|chrome\.enabled))"\s*,\s*(true|false)\s*\)\s*;/gm;
  for (const match of contexts.text.matchAll(pattern)) { if (contexts.inString[match.index]) continue; values[match[1]].push(match[2] === 'true'); spans.push({ start: match.index, end: match.index + match[0].length, key: match[1] }); }
  // References outside supported statements might be executable/custom JS or nonboolean values.
  let remainder = contexts.text; for (const span of [...spans].reverse()) remainder = remainder.slice(0, span.start) + remainder.slice(span.end);
  if (selectedKeys.some(key => remainder.includes(key))) throw new FirefoxError('CONFIG_CONFLICT', 'A managed preference uses unsupported custom profile JavaScript. No profile source was executed or rewritten.');
  return { values, spans };
}
export function readBooleanPreferenceValues(text) { return preferences(text, true).values; }
function removeBlock(text) {
  const start = text.indexOf(begin), finish = text.indexOf(end);
  if (start < 0 && finish < 0) return { text, found: false };
  if (start < 0 || finish < start || text.indexOf(begin, start + begin.length) >= 0 || text.slice(start, finish + end.length).replaceAll('\r\n', '\n') !== block) throw new FirefoxError('CONFIG_CONFLICT', 'The owned debugging block was edited. It and the provenance record must be reviewed before changes.');
  const after = finish + end.length, newline = text.startsWith('\r\n', after) ? 2 : text.startsWith('\n', after) ? 1 : 0;
  return { text: text.slice(0, start) + text.slice(after + newline), found: true, start };
}
function validateRecord(record, profile) {
  if (record?.version !== 1 || record.profilePath !== profile || !['prepared', 'active', 'removing'].includes(record.state) || typeof record.user?.existed !== 'boolean' || typeof record.user.separatorAdded !== 'boolean') throw new FirefoxError('CONFIG_CONFLICT', 'Profile setup provenance is not recognized; no source was changed.');
  for (const section of ['user', 'prefs']) {
    if (!record[section]?.values || !equal(Object.keys(record[section].values).sort(), [...keys].sort())) throw new FirefoxError('CONFIG_CONFLICT', 'Profile preference provenance has unexpected keys.');
    for (const key of keys) if (!Array.isArray(record[section].values[key]) || record[section].values[key].length > 100 || record[section].values[key].some(value => typeof value !== 'boolean')) throw new FirefoxError('CONFIG_CONFLICT', 'Profile preference provenance has invalid values.');
  }
  if (!equal(Object.keys(record).sort(), ['version', 'profilePath', 'state', 'user', 'prefs', 'checksum'].sort()) || record.checksum !== recordChecksum(record)) throw new FirefoxError('CONFIG_CONFLICT', 'Original-value provenance was edited or damaged. No preference values were restored.');
}
function recordChecksum(record) {
  return createHash('sha256').update(JSON.stringify([record.version, record.profilePath, record.state, record.user.existed, record.user.separatorAdded, keys.map(key => record.user.values[key]), keys.map(key => record.prefs.values[key])])).digest('hex');
}
function serializeRecord(record) { record.checksum = recordChecksum(record); return JSON.stringify(record, null, 2) + '\n'; }
async function atomicWrite(file, text) {
  const temporary = `${file}.cu2-${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}
async function assertUnchanged(file, previous) {
  const current = await readFile(file);
  if (current.existed !== previous.existed || current.text !== previous.text) throw new FirefoxError('CONFIG_CONFLICT', 'A preference file changed concurrently. No further profile writes were attempted.');
}
function restorePreferenceValues(text, parsed, original) {
  const restored = keys.flatMap(key => original[key].map(value => `user_pref("${key}", ${value});`)).join('\n');
  if (!parsed.spans.length) return restored ? `${text}${text.endsWith('\n') || !text ? '' : '\n'}${restored}\n` : text;
  const insertion = parsed.spans[0].start; let next = text;
  for (const span of [...parsed.spans].reverse()) next = next.slice(0, span.start) + next.slice(span.end);
  return next.slice(0, insertion) + restored + next.slice(insertion);
}

export async function setupProfile(profilePath, { remove = false } = {}) {
  if (typeof profilePath !== 'string' || !path.isAbsolute(profilePath)) throw new FirefoxError('INVALID_ARGUMENT', 'An explicit absolute profilePath is required.');
  const profile = await fs.realpath(profilePath).catch(() => null);
  if (!profile || !(await fs.stat(profile)).isDirectory()) throw new FirefoxError('INVALID_ARGUMENT', 'The approved profile directory does not exist.');
  const lockFile = path.join(profile, 'parent.lock'); let lock, createdLock = false;
  try {
    try { lock = await fs.open(lockFile, 'r+'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; lock = await fs.open(lockFile, 'wx+'); createdLock = true; }
  } catch { throw new FirefoxError('PROFILE_IN_USE', 'Close this exact Firefox profile before profile setup or restoration. No live profile preference changes are allowed.'); }
  try {
    const userFile = path.join(profile, 'user.js'), prefsFile = path.join(profile, 'prefs.js'), recordFile = path.join(profile, recordName);
    const user = await readFile(userFile), prefs = await readFile(prefsFile), provenance = await readFile(recordFile);
    let expectedRecord = provenance;
    const saveRecord = async value => { await assertUnchanged(recordFile, expectedRecord); const text = serializeRecord(value); await atomicWrite(recordFile, text); expectedRecord = { existed: true, text }; };
    let record;
    if (provenance.existed) {
      try { record = JSON.parse(provenance.text); } catch { throw new FirefoxError('CONFIG_CONFLICT', 'The owned provenance file is not valid JSON.'); }
      validateRecord(record, profile);
    }
    const outside = removeBlock(user.text), userPreferences = preferences(outside.text), prefsPreferences = preferences(prefs.text);
    if (!record && outside.found) throw new FirefoxError('MISSING_PROVENANCE', 'An older debugging block has no original-value provenance. Refusing to invent original preference values.');
    if (!record && remove) return { profilePath: profile, configured: false, removed: false, restored: false, reason: 'No owned setup record exists; no preference values were changed.' };
    if (!record) {
      record = { version: 1, profilePath: profile, state: 'prepared', user: { existed: user.existed, separatorAdded: !!user.text && !user.text.endsWith('\n'), values: userPreferences.values }, prefs: { values: prefsPreferences.values } };
      const text = serializeRecord(record);
      await fs.writeFile(recordFile, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); expectedRecord = { existed: true, text };
    }
    if (!equal(userPreferences.values, record.user.values)) throw new FirefoxError('CONFIG_CONFLICT', 'Non-owned targeted user.js preferences changed since setup; refusing to restore over them.');
    for (const key of keys) {
      const current = prefsPreferences.values[key];
      if (record.state === 'prepared' && !outside.found && !equal(current, record.prefs.values[key])) throw new FirefoxError('CONFIG_CONFLICT', 'A setup that never activated its owned block cannot claim later preference changes. Provenance was retained.');
      if (!equal(current, record.prefs.values[key]) && !(current.length === 1 && current[0] === true)) throw new FirefoxError('CONFIG_CONFLICT', 'A materialized debugging preference no longer has its original or plugin-owned enabled value. It was not overwritten.');
    }
    if (remove) {
      if (!outside.found && record.state === 'active') throw new FirefoxError('CONFIG_CONFLICT', 'The owned block was removed outside this workflow; provenance is retained for manual recovery.');
      let restoredUser = outside.text;
      if (outside.found && record.user.separatorAdded && outside.start > 0 && restoredUser[outside.start - 1] === '\n') restoredUser = restoredUser.slice(0, outside.start - 1) + restoredUser.slice(outside.start);
      const restoredPrefs = restorePreferenceValues(prefs.text, prefsPreferences, record.prefs.values);
      await assertUnchanged(userFile, user); await assertUnchanged(prefsFile, prefs);
      record.state = 'removing'; await saveRecord(record);
      if (restoredPrefs !== prefs.text) { await assertUnchanged(prefsFile, prefs); await atomicWrite(prefsFile, restoredPrefs); }
      await assertUnchanged(userFile, user);
      if (!record.user.existed && restoredUser === '') { if (user.existed) await fs.unlink(userFile); }
      else if (restoredUser !== user.text) await atomicWrite(userFile, restoredUser);
      await assertUnchanged(recordFile, expectedRecord); await fs.unlink(recordFile);
      return { profilePath: profile, configured: false, removed: true, restored: true, scope: 'original-targeted-user-and-persisted-preference-values', connectionPromptChanged: false };
    }
    if (record.state === 'removing') throw new FirefoxError('CONFIG_CONFLICT', 'A prior restoration is incomplete. Finish removal before enabling again.');
    if (!outside.found) {
      await assertUnchanged(userFile, user);
      await atomicWrite(userFile, `${user.text}${record.user.separatorAdded ? '\n' : ''}${block}\n`);
    }
    record.state = 'active'; await saveRecord(record);
    return { profilePath: profile, configured: true, alreadyConfigured: outside.found, provenanceFile: recordFile, connectionPromptChanged: false, scope: 'three-owned-debugging-preferences', restore: 'Call browser.profileSetup with remove:true while this exact profile is closed.' };
  } finally {
    await lock.close();
    if (createdLock) await fs.unlink(lockFile).catch(e => { if (e.code !== 'ENOENT') throw e; });
  }
}
