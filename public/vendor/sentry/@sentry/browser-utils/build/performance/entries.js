import { spanToJSON, _INTERNAL_performanceTimeToSeconds, getActiveSpan, UI_LONG_TASK_SPAN_NAME_FALLBACK, parseUrl, filterCollectedUrl, RESOURCE_SPAN_NAME_FALLBACK, setMeasurement, BROWSER_NAVIGATION_TIMING_SPAN_NAMES } from '@sentry/core';
import { SENTRY_OP, BROWSER_PAINT_TYPE, SENTRY_ORIGIN, NETWORK_CONNECTION_EFFECTIVE_TYPE, EFFECTIVECONNECTIONTYPE, NETWORK_CONNECTION_TYPE, CONNECTIONTYPE, NETWORK_CONNECTION_RTT, DEVICE_MEMORY_ESTIMATED_CAPACITY, DEVICEMEMORY, DEVICE_PROCESSOR_COUNT, HARDWARECONCURRENCY, BROWSER_SCRIPT_INVOKER, BROWSER_SCRIPT_INVOKER_TYPE, CODE_FILE_PATH, CODE_FUNCTION_NAME, BROWSER_SCRIPT_SOURCE_CHAR_POSITION, URL_FULL, URL_SCHEME, SERVER_ADDRESS, URL_DOMAIN, HTTP_REQUEST_SAME_ORIGIN, HTTP_RESPONSE_STATUS_CODE, HTTP_RESPONSE_SIZE, HTTP_RESPONSE_BODY_SIZE, HTTP_RESPONSE_BODY_DECODED_SIZE, RESOURCE_RENDER_BLOCKING_STATUS } from '@sentry/conventions/attributes';
import { UI_LONG_ANIMATION_FRAME, RESOURCE_OTHER, BROWSER_PAINT, BROWSER_LOAD_EVENT, BROWSER_DOM_CONTENT_LOADED_EVENT, BROWSER_CONNECT, BROWSER_REDIRECT, BROWSER_UNLOAD_EVENT, BROWSER_DNS, BROWSER_CACHE, BROWSER_TLS_SSL, BROWSER_REQUEST, BROWSER_RESPONSE, UI_LONG_TASK } from '@sentry/conventions/op';
import { addPerformanceInstrumentationHandler } from '../instrumentation/performanceObserver.js';
import { WINDOW } from '../types.js';
import { resourceTimingToSpanAttributes } from './resourceTiming.js';
import { getBrowserPerformanceAPI, msToSec, startAndEndSpan, isMeasurementValue } from './utils.js';

const MAX_INT_AS_BYTES = 2147483647;
let _performanceCursor = 0;
function startTrackingLongTasks() {
  addPerformanceInstrumentationHandler("longtask", ({ entries }) => {
    const parent = getActiveSpan();
    if (!parent) {
      return;
    }
    const { attributes: parentAttributes, start_timestamp: parentStartTimestamp } = spanToJSON(parent);
    for (const entry of entries) {
      const startTime = _INTERNAL_performanceTimeToSeconds(entry.startTime);
      if (!startTime) {
        continue;
      }
      const duration = msToSec(entry.duration);
      if (parentAttributes[SENTRY_OP] === "navigation" && parentStartTimestamp && startTime < parentStartTimestamp) {
        continue;
      }
      startAndEndSpan(parent, startTime, startTime + duration, {
        name: UI_LONG_TASK_SPAN_NAME_FALLBACK,
        op: UI_LONG_TASK,
        attributes: {
          [SENTRY_ORIGIN]: "auto.ui.browser.metrics"
        }
      });
    }
  });
}
function startTrackingLongAnimationFrames() {
  const observer = new PerformanceObserver((list) => {
    const parent = getActiveSpan();
    if (!parent) {
      return;
    }
    for (const entry of list.getEntries()) {
      const startTime = _INTERNAL_performanceTimeToSeconds(entry.startTime);
      if (!startTime || !entry.scripts[0]) {
        continue;
      }
      const {
        start_timestamp: parentStartTimestamp,
        attributes: { [SENTRY_OP]: parentOp }
      } = spanToJSON(parent);
      if (parentOp === "navigation" && parentStartTimestamp && startTime < parentStartTimestamp) {
        continue;
      }
      const duration = msToSec(entry.duration);
      const attributes = {
        [SENTRY_ORIGIN]: "auto.ui.browser.metrics"
      };
      const longestScript = entry.scripts.reduce(
        (longest, script) => script.duration > longest.duration ? script : longest
      );
      const { invoker, invokerType, sourceURL, sourceFunctionName, sourceCharPosition } = longestScript;
      attributes[BROWSER_SCRIPT_INVOKER] = invoker;
      attributes[BROWSER_SCRIPT_INVOKER_TYPE] = invokerType;
      if (sourceURL) {
        attributes[CODE_FILE_PATH] = sourceURL;
      }
      if (sourceFunctionName) {
        attributes[CODE_FUNCTION_NAME] = sourceFunctionName;
      }
      if (sourceCharPosition !== -1) {
        attributes[BROWSER_SCRIPT_SOURCE_CHAR_POSITION] = sourceCharPosition;
      }
      startAndEndSpan(parent, startTime, startTime + duration, {
        name: UI_LONG_TASK_SPAN_NAME_FALLBACK,
        op: UI_LONG_ANIMATION_FRAME,
        attributes
      });
    }
  });
  observer.observe({ type: "long-animation-frame", buffered: true });
}
function addPerformanceEntries(span, options) {
  const performance = getBrowserPerformanceAPI();
  if (!performance?.getEntries) {
    return;
  }
  const { spanStreamingEnabled, ignoreResourceSpans } = options;
  const performanceEntries = performance.getEntries();
  const { attributes, start_timestamp: transactionStartTime } = spanToJSON(span);
  performanceEntries.slice(_performanceCursor).forEach((entry) => {
    const startTimestamp = _INTERNAL_performanceTimeToSeconds(entry.startTime);
    if (!startTimestamp) {
      return;
    }
    const duration = msToSec(
      // Inexplicably, Chrome sometimes emits a negative duration. We need to work around this.
      // There is a SO post attempting to explain this, but it leaves one with open questions: https://stackoverflow.com/questions/23191918/peformance-getentries-and-negative-duration-display
      // The way we clamp the value is probably not accurate, since we have observed this happen for things that may take a while to load, like for example the replay worker.
      // TODO: Investigate why this happens and how to properly mitigate. For now, this is a workaround to prevent transactions being dropped due to negative duration spans.
      Math.max(0, entry.duration)
    );
    if (attributes[SENTRY_OP] === "navigation" && transactionStartTime && startTimestamp < transactionStartTime) {
      return;
    }
    switch (entry.entryType) {
      case "navigation": {
        _addNavigationSpans(span, entry, spanStreamingEnabled);
        break;
      }
      case "paint": {
        _addPaintSpan(span, entry, startTimestamp, duration);
        break;
      }
      case "resource": {
        _addResourceSpans(
          span,
          entry,
          entry.name,
          startTimestamp,
          duration,
          ignoreResourceSpans,
          spanStreamingEnabled
        );
        break;
      }
    }
  });
  _performanceCursor = Math.max(performanceEntries.length - 1, 0);
  _trackNavigator(span, spanStreamingEnabled);
}
function _addPaintSpan(span, entry, startTimestamp, duration) {
  startAndEndSpan(span, startTimestamp, startTimestamp + duration, {
    // The entry name (`first-paint`, `first-contentful-paint`) is already the low-cardinality name
    // the conventions ask for, so only the attribute backing it has to be added.
    name: entry.name,
    attributes: {
      [SENTRY_OP]: BROWSER_PAINT,
      [SENTRY_ORIGIN]: "auto.resource.browser.metrics",
      [BROWSER_PAINT_TYPE]: entry.name
    }
  });
}
function _addNavigationSpans(span, entry, spanStreamingEnabled) {
  _addPerformanceNavigationTiming(span, entry, "unloadEvent", spanStreamingEnabled);
  _addPerformanceNavigationTiming(span, entry, "redirect", spanStreamingEnabled);
  _addPerformanceNavigationTiming(span, entry, "domContentLoadedEvent", spanStreamingEnabled);
  _addPerformanceNavigationTiming(span, entry, "loadEvent", spanStreamingEnabled);
  _addPerformanceNavigationTiming(span, entry, "connect", spanStreamingEnabled);
  _addPerformanceNavigationTiming(span, entry, "secureConnection", spanStreamingEnabled);
  _addPerformanceNavigationTiming(span, entry, "fetch", spanStreamingEnabled);
  _addPerformanceNavigationTiming(span, entry, "domainLookup", spanStreamingEnabled);
  _addRequest(span, entry, spanStreamingEnabled);
}
function _navigationTimeToSeconds(entry, time) {
  return _INTERNAL_performanceTimeToSeconds(time, entry.startTime);
}
const NAVIGATION_TIMING_SPAN_OPS = {
  secureConnection: BROWSER_TLS_SSL,
  fetch: BROWSER_CACHE,
  domainLookup: BROWSER_DNS,
  unloadEvent: BROWSER_UNLOAD_EVENT,
  redirect: BROWSER_REDIRECT,
  connect: BROWSER_CONNECT,
  domContentLoadedEvent: BROWSER_DOM_CONTENT_LOADED_EVENT,
  loadEvent: BROWSER_LOAD_EVENT
};
function _addPerformanceNavigationTiming(span, entry, event, spanStreamingEnabled) {
  const eventEnd = _getEndPropertyNameForNavigationTiming(event);
  const end = entry[eventEnd];
  const start = entry[`${event}Start`];
  if (!start || !end) {
    return;
  }
  const op = NAVIGATION_TIMING_SPAN_OPS[event];
  const filteredUrl = filterCollectedUrl(entry.name);
  startAndEndSpan(span, _navigationTimeToSeconds(entry, start), _navigationTimeToSeconds(entry, end), {
    // With span streaming, span names have to be low cardinality, so we can't fall back to the
    // document URL. `url.full` keeps it, and is what Relay derives the description from.
    name: spanStreamingEnabled ? BROWSER_NAVIGATION_TIMING_SPAN_NAMES[op] : filteredUrl,
    attributes: {
      [SENTRY_OP]: op,
      [SENTRY_ORIGIN]: "auto.ui.browser.metrics",
      [URL_FULL]: filteredUrl,
      ...event === "redirect" && entry.redirectCount != null ? { "http.redirect_count": entry.redirectCount } : {}
    }
  });
}
function _getEndPropertyNameForNavigationTiming(event) {
  if (event === "secureConnection") {
    return "connectEnd";
  }
  if (event === "fetch") {
    return "domainLookupStart";
  }
  return `${event}End`;
}
function _addRequest(span, entry, spanStreamingEnabled) {
  const requestStartTimestamp = _navigationTimeToSeconds(entry, entry.requestStart);
  const responseEndTimestamp = _navigationTimeToSeconds(entry, entry.responseEnd);
  const responseStartTimestamp = _navigationTimeToSeconds(entry, entry.responseStart);
  if (entry.responseEnd) {
    const filteredUrl = filterCollectedUrl(entry.name);
    startAndEndSpan(span, requestStartTimestamp, responseEndTimestamp, {
      name: spanStreamingEnabled ? BROWSER_NAVIGATION_TIMING_SPAN_NAMES[BROWSER_REQUEST] : filteredUrl,
      attributes: {
        [SENTRY_OP]: BROWSER_REQUEST,
        [SENTRY_ORIGIN]: "auto.ui.browser.metrics",
        [URL_FULL]: filteredUrl
      }
    });
    startAndEndSpan(span, responseStartTimestamp, responseEndTimestamp, {
      name: spanStreamingEnabled ? BROWSER_NAVIGATION_TIMING_SPAN_NAMES[BROWSER_RESPONSE] : filteredUrl,
      attributes: {
        [SENTRY_OP]: BROWSER_RESPONSE,
        [SENTRY_ORIGIN]: "auto.ui.browser.metrics",
        [URL_FULL]: filteredUrl
      }
    });
  }
}
function _addResourceSpans(span, entry, resourceUrl, startTimestamp, duration, ignoredResourceSpanOps, spanStreamingEnabled) {
  if (entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch") {
    return;
  }
  const op = entry.initiatorType ? `resource.${entry.initiatorType}` : RESOURCE_OTHER;
  if (ignoredResourceSpanOps?.includes(op)) {
    return;
  }
  const attributes = {
    [SENTRY_ORIGIN]: "auto.resource.browser.metrics"
  };
  const parsedUrl = parseUrl(resourceUrl);
  if (parsedUrl.protocol) {
    attributes[URL_SCHEME] = parsedUrl.protocol.split(":").pop();
  }
  const host = parsedUrl.host?.replace(/^.*@/, "");
  if (host) {
    attributes[SERVER_ADDRESS] = host;
  }
  const domain = host?.replace(/:\d+$/, "");
  if (domain) {
    attributes[URL_DOMAIN] = domain;
  }
  attributes[HTTP_REQUEST_SAME_ORIGIN] = resourceUrl.includes(WINDOW.location.origin);
  const filteredUrl = filterCollectedUrl(resourceUrl);
  attributes[URL_FULL] = filteredUrl;
  _setResourceRequestAttributes(entry, attributes, [
    // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus
    ["responseStatus", HTTP_RESPONSE_STATUS_CODE],
    ["transferSize", HTTP_RESPONSE_SIZE],
    ["encodedBodySize", HTTP_RESPONSE_BODY_SIZE],
    ["decodedBodySize", HTTP_RESPONSE_BODY_DECODED_SIZE],
    // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/renderBlockingStatus
    ["renderBlockingStatus", RESOURCE_RENDER_BLOCKING_STATUS],
    // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
    ["deliveryType", "http.response_delivery_type"]
  ]);
  const attributesWithResourceTiming = { ...attributes, ...resourceTimingToSpanAttributes(entry) };
  const endTimestamp = startTimestamp + duration;
  startAndEndSpan(span, startTimestamp, endTimestamp, {
    // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
    name: spanStreamingEnabled ? domain || RESOURCE_SPAN_NAME_FALLBACK : filteredUrl.replace(WINDOW.location.origin, ""),
    op,
    attributes: attributesWithResourceTiming
  });
}
function _trackNavigator(span, spanStreamingEnabled) {
  const navigator = WINDOW.navigator;
  if (!navigator) {
    return;
  }
  const connection = navigator.connection;
  if (connection) {
    if (connection.effectiveType) {
      span.setAttribute(
        // oxlint-disable-next-line typescript/no-deprecated -- Preserve the existing attribute name.
        spanStreamingEnabled ? NETWORK_CONNECTION_EFFECTIVE_TYPE : EFFECTIVECONNECTIONTYPE,
        connection.effectiveType
      );
    }
    if (connection.type) {
      span.setAttribute(spanStreamingEnabled ? NETWORK_CONNECTION_TYPE : CONNECTIONTYPE, connection.type);
    }
    if (isMeasurementValue(connection.rtt)) {
      if (spanStreamingEnabled) {
        span.setAttribute(NETWORK_CONNECTION_RTT, connection.rtt);
      } else if (spanToJSON(span).attributes[SENTRY_OP] === "pageload") {
        setMeasurement("connection.rtt", connection.rtt, "millisecond");
      }
    }
  }
  if (isMeasurementValue(navigator.deviceMemory)) {
    if (spanStreamingEnabled) {
      span.setAttribute(DEVICE_MEMORY_ESTIMATED_CAPACITY, navigator.deviceMemory);
    } else {
      span.setAttribute(DEVICEMEMORY, `${navigator.deviceMemory} GB`);
    }
  }
  if (isMeasurementValue(navigator.hardwareConcurrency)) {
    if (spanStreamingEnabled) {
      span.setAttribute(DEVICE_PROCESSOR_COUNT, navigator.hardwareConcurrency);
    } else {
      span.setAttribute(HARDWARECONCURRENCY, String(navigator.hardwareConcurrency));
    }
  }
}
function _setResourceRequestAttributes(entry, attributes, properties) {
  properties.forEach(([entryKey, attributeKey]) => {
    const entryVal = entry[entryKey];
    if (entryVal != null && (typeof entryVal === "number" && entryVal < MAX_INT_AS_BYTES || typeof entryVal === "string")) {
      attributes[attributeKey] = entryVal;
    }
  });
}

export { _addNavigationSpans, _addPaintSpan, _addResourceSpans, _setResourceRequestAttributes, addPerformanceEntries, startTrackingLongAnimationFrames, startTrackingLongTasks };
//# sourceMappingURL=entries.js.map
