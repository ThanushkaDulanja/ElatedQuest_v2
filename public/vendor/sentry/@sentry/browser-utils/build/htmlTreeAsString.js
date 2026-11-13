import { isString } from '@sentry/core';

const DEFAULT_MAX_STRING_LENGTH = 80;
const accessors = {};
try {
  if (typeof Node !== "undefined") {
    accessors.parentNode = Object.getOwnPropertyDescriptor(Node.prototype, "parentNode").get;
  }
  if (typeof Element !== "undefined") {
    accessors.tagName = Object.getOwnPropertyDescriptor(Element.prototype, "tagName").get;
    accessors.id = Object.getOwnPropertyDescriptor(Element.prototype, "id").get;
    accessors.className = Object.getOwnPropertyDescriptor(Element.prototype, "className").get;
    accessors.getAttribute = Element.prototype.getAttribute;
  }
  if (typeof HTMLElement !== "undefined") {
    accessors.dataset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "dataset").get;
  }
} catch {
}
function _safeRead(el, prop, arg) {
  const fn = accessors[prop];
  if (fn) {
    try {
      return fn.call(el, arg);
    } catch {
    }
  }
  const val = el[prop];
  return typeof val === "function" ? val.call(el, arg) : val;
}
function htmlTreeAsString(elem, options = {}) {
  if (!elem) {
    return "<unknown>";
  }
  try {
    let currentElem = elem;
    const MAX_TRAVERSE_HEIGHT = 5;
    const out = [];
    let height = 0;
    let len = 0;
    const separator = " > ";
    const sepLength = separator.length;
    let nextStr;
    const keyAttrs = Array.isArray(options) ? options : options.keyAttrs;
    const maskAttributeFn = Array.isArray(options) ? void 0 : options.maskAttributeFn;
    const maxStringLength = !Array.isArray(options) && options.maxStringLength || DEFAULT_MAX_STRING_LENGTH;
    while (currentElem && height++ < MAX_TRAVERSE_HEIGHT) {
      nextStr = _htmlElementAsString(currentElem, keyAttrs, maskAttributeFn);
      if (nextStr === "html" || height > 1 && len + out.length * sepLength + nextStr.length >= maxStringLength) {
        break;
      }
      out.push(nextStr);
      len += nextStr.length;
      currentElem = _safeRead(currentElem, "parentNode");
    }
    return out.reverse().join(separator);
  } catch {
    return "<unknown>";
  }
}
function _htmlElementAsString(el, keyAttrs, maskAttributeFn) {
  const out = [];
  const tagName = _safeRead(el, "tagName");
  if (!tagName) {
    return "";
  }
  if (typeof HTMLElement !== "undefined") {
    if (el instanceof HTMLElement) {
      const dataset = _safeRead(el, "dataset");
      if (dataset) {
        if (dataset["sentryComponent"]) {
          return maskAttributeFn ? maskAttributeFn("data-sentry-component", dataset["sentryComponent"], el) : dataset["sentryComponent"];
        }
        if (dataset["sentryElement"]) {
          return maskAttributeFn ? maskAttributeFn("data-sentry-element", dataset["sentryElement"], el) : dataset["sentryElement"];
        }
      }
    }
  }
  out.push(tagName.toLowerCase());
  const keyAttrPairs = keyAttrs?.length ? keyAttrs.filter((keyAttr) => _safeRead(el, "getAttribute", keyAttr)).map((keyAttr) => [keyAttr, _safeRead(el, "getAttribute", keyAttr)]) : null;
  if (keyAttrPairs?.length) {
    keyAttrPairs.forEach(([key, value]) => {
      out.push(`[${key}="${maskAttributeFn && value ? maskAttributeFn(key, value, el) : value}"]`);
    });
  } else {
    const id = _safeRead(el, "id");
    if (id) {
      out.push(`#${maskAttributeFn ? maskAttributeFn("id", id, el) : id}`);
    }
    const className = _safeRead(el, "className");
    if (className && isString(className)) {
      const classes = (maskAttributeFn ? maskAttributeFn("class", className, el) : className).split(
        /\s+/
      );
      for (const c of classes) {
        out.push(`.${c}`);
      }
    }
  }
  for (const k of ["aria-label", "type", "name", "title", "alt"]) {
    const attr = _safeRead(el, "getAttribute", k);
    if (attr) {
      out.push(`[${k}="${maskAttributeFn ? maskAttributeFn(k, attr, el) : attr}"]`);
    }
  }
  return out.join("");
}

export { htmlTreeAsString };
//# sourceMappingURL=htmlTreeAsString.js.map
