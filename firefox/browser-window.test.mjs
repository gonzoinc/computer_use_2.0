import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createNormalTab, listNormalWindows } from './browser-window.mjs';

function fixture() {
  const created = [];
  const window = (id, privateWindow = false) => ({ browsingContext: { id }, privateWindow, closed: false, document: { title: `window${id}` }, gBrowser: { tabs: [], addTab(url) { created.push({ id, url }); return { linkedBrowser: { browserId: 100 + id } }; } } });
  const windows = [window(1), window(2, true), window(3)];
  const context = vm.createContext({ URL, Services: { wm: { getEnumerator: () => windows, getMostRecentWindow: () => windows[1] }, scriptSecurityManager: { getSystemPrincipal: () => ({ principal: 'test' }) } }, ChromeUtils: { importESModule: () => ({ PrivateBrowsingUtils: { isWindowPrivate: value => value.privateWindow } }) } });
  return { windows, created, list: () => JSON.parse(JSON.stringify(vm.runInContext(`(${listNormalWindows.toString()})()`, context))), create: (id, url = 'https://example.test/') => JSON.parse(JSON.stringify(vm.runInContext(`(${createNormalTab.toString()})(${JSON.stringify(id)},${JSON.stringify(url)})`, context))) };
}
test('tab creation requires the explicit observed normal window even when a private window is most recent', () => {
  const f = fixture(); assert.deepEqual(f.list().map(x => x.windowId), [1, 3]);
  assert.equal(f.create(1).windowId, 1); assert.equal(f.created.length, 1); assert.equal(f.created[0].id, 1);
  assert.equal(f.create(2).__cu2error.code, 'PERMISSION_DENIED'); assert.equal(f.created.length, 1);
  assert.equal(f.create(999).__cu2error.code, 'WINDOW_CLOSED');
  f.windows[2].closed = true; assert.equal(f.create(3).__cu2error.code, 'WINDOW_CLOSED');
});
test('destination privacy is revalidated at creation, rather than trusted from an earlier list', () => {
  const f = fixture(); assert.ok(f.list().some(x => x.windowId === 1));
  f.windows[0].privateWindow = true;
  assert.equal(f.create(1).__cu2error.code, 'PERMISSION_DENIED'); assert.equal(f.created.length, 0);
  assert.equal(f.create(3, 'file:///private.txt').__cu2error.code, 'RESTRICTED_URL'); assert.equal(f.created.length, 0);
});
