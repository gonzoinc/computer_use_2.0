/* This self-contained owned function runs through the explicit tab's native RDP console actor. */
export function domOperation(method, args) {
  const fail = (code, message) => ({ __cu2error: { code, message } });
  let matches;
  try { matches = document.querySelectorAll(args.selector); }
  catch { return fail('INVALID_ARGUMENT', 'Invalid CSS selector.'); }
  if (method === 'dom.inspect') {
    const limit = args.limit ?? 20, textLimit = args.textLimit ?? 4000;
    const properties = args.properties ?? ['display', 'visibility', 'position', 'color', 'background-color', 'font-size', 'width', 'height', 'margin', 'padding', 'z-index'];
    const nodes = Array.from(matches).slice(0, limit).map(element => {
      const box = element.getBoundingClientRect(); const css = getComputedStyle(element);
      const attrs = {};
      for (const attr of Array.from(element.attributes).slice(0, 40)) {
        if (/^(value|nonce)$/i.test(attr.name) || /^on/i.test(attr.name)) continue;
        attrs[attr.name] = attr.value.slice(0, 2000);
      }
      const fullText = element.textContent ?? '';
      return { tag: element.tagName.toLowerCase(), attributes: attrs, text: fullText.slice(0, textLimit), textTruncated: fullText.length > textLimit,
        box: { x: box.x, y: box.y, width: box.width, height: box.height }, styles: Object.fromEntries(properties.map(p => [p, css.getPropertyValue(p)])) };
    });
    return { nodes, totalMatched: matches.length, truncated: matches.length > limit, source: 'page-dom' };
  }
  if (matches.length === 0) return fail('NOT_FOUND', 'No element matches the selector.');
  if (matches.length !== 1) return fail('AMBIGUOUS_SELECTOR', 'Mutation requires a selector matching exactly one element.');
  const element = matches[0];
  if (method === 'dom.click') {
    if (typeof element.click !== 'function') return fail('UNSUPPORTED', 'This node has no click method.');
    if (element.disabled) return fail('INVALID_STATE', 'The element is disabled.');
    element.click(); return { dispatched: true, trusted: false, tag: element.tagName.toLowerCase() };
  }
  if (method === 'dom.fill') {
    if (element.disabled || element.readOnly) return fail('INVALID_STATE', 'The control is disabled or read-only.');
    const prototypes = { INPUT: HTMLInputElement.prototype, TEXTAREA: HTMLTextAreaElement.prototype, SELECT: HTMLSelectElement.prototype };
    const prototype = prototypes[element.tagName];
    if (!prototype) return fail('UNSUPPORTED', 'Only input, textarea, and select controls can be filled.');
    if (element.tagName === 'INPUT' && ['file', 'checkbox', 'radio', 'submit', 'button', 'image', 'reset'].includes(element.type)) return fail('UNSUPPORTED', 'This input type cannot be filled.');
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) return fail('UNSUPPORTED', 'The control has no native value setter.');
    setter.call(element, args.value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { filled: true, tag: element.tagName.toLowerCase(), characterCount: element.value.length, submitted: false, trusted: false };
  }
  if (method === 'dom.style') {
    const oldValue = element.style.getPropertyValue(args.property), oldPriority = element.style.getPropertyPriority(args.property);
    element.style.setProperty(args.property, args.value, args.priority ?? '');
    return { property: args.property, oldValue, oldPriority, value: element.style.getPropertyValue(args.property), priority: element.style.getPropertyPriority(args.property), temporary: true };
  }
  return fail('UNSUPPORTED', 'Unknown DOM operation.');
};
