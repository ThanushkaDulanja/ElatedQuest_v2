import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { defineIntegration, spanToJSON, _INTERNAL_performanceTimeToSeconds, stringMatchesSomePattern, isPrimitive } from '@sentry/core';
import { getBrowserPerformanceAPI, startAndEndSpan } from './utils.js';
import { getNavigationEntry } from '../web-vitals/utils.js';

const INTEGRATION_NAME = "UserTiming";
const _userTimingIntegration = ((options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const performance = getBrowserPerformanceAPI();
      if (!performance?.getEntries) {
        return;
      }
      let performanceCursor = 0;
      client.on("beforeIdleSpanEnd", (idleSpan) => {
        const { attributes, start_timestamp: parentStartTimestamp } = spanToJSON(idleSpan);
        const parentOp = attributes[SENTRY_OP];
        if (parentOp !== "pageload" && parentOp !== "navigation") {
          return;
        }
        const requestStart = getNavigationEntry(false)?.requestStart ?? 0;
        const performanceEntries = performance.getEntries();
        for (const entry of performanceEntries.slice(performanceCursor)) {
          if (entry.entryType !== "mark" && entry.entryType !== "measure") {
            continue;
          }
          const startTimestamp = _INTERNAL_performanceTimeToSeconds(entry.startTime);
          if (!startTimestamp) {
            continue;
          }
          if (parentOp === "navigation" && parentStartTimestamp && startTimestamp < parentStartTimestamp) {
            continue;
          }
          const endTimestamp = _INTERNAL_performanceTimeToSeconds(
            entry.startTime + Math.max(0, entry.duration),
            entry.startTime
          );
          const requestTimestamp = _INTERNAL_performanceTimeToSeconds(requestStart, entry.startTime);
          _addUserTimingSpan(idleSpan, entry, startTimestamp, endTimestamp, requestTimestamp, options.ignore ?? []);
        }
        performanceCursor = performanceEntries.length;
      });
    }
  };
});
const userTimingIntegration = defineIntegration(_userTimingIntegration);
function _addUserTimingSpan(parentSpan, entry, startTimestamp, endTimestamp, requestTimestamp, ignore) {
  if (isReact19MeasureEntry(entry) || stringMatchesSomePattern(entry.name, ignore)) {
    return;
  }
  const spanStartTimestamp = Math.max(startTimestamp, requestTimestamp);
  const attributes = {
    [SENTRY_ORIGIN]: `auto.browser.user_timing.${entry.entryType}`
  };
  if (spanStartTimestamp !== startTimestamp) {
    attributes["sentry.browser.measure_happened_before_request"] = true;
    attributes["sentry.browser.measure_start_time"] = spanStartTimestamp;
  }
  addDetailToSpanAttributes(attributes, entry);
  if (spanStartTimestamp <= endTimestamp) {
    startAndEndSpan(parentSpan, spanStartTimestamp, endTimestamp, {
      name: entry.name,
      op: entry.entryType,
      attributes
    });
  }
}
function isReact19MeasureEntry(entry) {
  if (entry.entryType !== "measure") {
    return;
  }
  try {
    return entry.detail.devtools.track === "Components \u269B";
  } catch {
    return;
  }
}
function addDetailToSpanAttributes(attributes, entry) {
  try {
    const detail = entry.detail;
    if (!detail) {
      return;
    }
    if (typeof detail === "object") {
      for (const [key, value] of Object.entries(detail)) {
        if (value && isPrimitive(value)) {
          attributes[`sentry.browser.measure.detail.${key}`] = value;
        } else if (value !== void 0) {
          try {
            attributes[`sentry.browser.measure.detail.${key}`] = JSON.stringify(value);
          } catch {
          }
        }
      }
      return;
    }
    if (isPrimitive(detail)) {
      attributes["sentry.browser.measure.detail"] = detail;
      return;
    }
    try {
      attributes["sentry.browser.measure.detail"] = JSON.stringify(detail);
    } catch {
    }
  } catch {
  }
}

export { _addUserTimingSpan, userTimingIntegration };
//# sourceMappingURL=userTiming.js.map
