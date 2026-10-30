// These owned functions are serialized into Firefox's parent-process console.
export function listNormalWindows() {
  const { PrivateBrowsingUtils } = ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
  return [...Services.wm.getEnumerator('navigator:browser')]
    .filter(window => !window.closed && !PrivateBrowsingUtils.isWindowPrivate(window))
    .map(window => ({ windowId: window.browsingContext.id, title: String(window.document.title).slice(0, 500), tabCount: window.gBrowser.tabs.length }));
}
export function createNormalTab(windowId, url) {
  const { PrivateBrowsingUtils } = ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
  const window = [...Services.wm.getEnumerator('navigator:browser')].find(candidate => candidate.browsingContext.id === windowId);
  if (!window || window.closed) return { __cu2error: { code: 'WINDOW_CLOSED', message: 'The explicit destination window is no longer available.' } };
  if (PrivateBrowsingUtils.isWindowPrivate(window)) return { __cu2error: { code: 'PERMISSION_DENIED', message: 'Tab creation in private windows is outside this adapter’s supported scope.' } };
  // Recheck the observed destination in the same synchronous operation as addTab.
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return { __cu2error: { code: 'RESTRICTED_URL', message: 'Only HTTP and HTTPS tab creation is supported.' } };
  const tab = window.gBrowser.addTab(parsed.href, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
  return { tabId: tab.linkedBrowser.browserId, windowId, url: parsed.href };
}
