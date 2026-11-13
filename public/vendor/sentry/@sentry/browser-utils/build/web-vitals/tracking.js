import { browserPerformanceTimeOrigin, spanToJSON, setMeasurement, debug, filterCollectedUrl } from '@sentry/core';
import { SENTRY_OP, BROWSER_NAVIGATION_TYPE, BROWSER_PERFORMANCE_TIME_ORIGIN, PERFORMANCE_TIMEORIGIN, BROWSER_PERFORMANCE_NAVIGATION_ACTIVATION_START, PERFORMANCE_ACTIVATIONSTART, LCP_ELEMENT, LCP_ID, LCP_URL, LCP_LOADTIME, LCP_RENDERTIME, LCP_SIZE, BROWSER_WEB_VITAL_TTFB_REQUEST_TIME } from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../debug-build.js';
import { htmlTreeAsString } from '../htmlTreeAsString.js';
import { addLcpInstrumentationHandler, addClsInstrumentationHandler, addTtfbInstrumentationHandler, addFcpInstrumentationHandler, addPerformanceInstrumentationHandler } from '../instrumentation/performanceObserver.js';
import { getBrowserPerformanceAPI, msToSec } from '../performance/utils.js';
import { isValidLcpMetric } from './lcp.js';
import { getActivationStart, getNavigationEntry, getVisibilityWatcher } from './utils.js';

let _measurements = {};
let _lcpEntry;
let _clsEntry;
let _navigationType;
function startTrackingWebVitals({ trackCls, trackLcp }) {
  const performance = getBrowserPerformanceAPI();
  if (performance && browserPerformanceTimeOrigin()) {
    const lcpCleanupCallback = trackLcp ? _trackLCP() : void 0;
    const clsCleanupCallback = trackCls ? _trackCLS() : void 0;
    const ttfbCleanupCallback = _trackTtfb();
    const fcpCleanupCallback = _trackFcp();
    const fpCleanupCallback = _trackFp();
    return () => {
      ttfbCleanupCallback();
      fcpCleanupCallback();
      fpCleanupCallback();
      lcpCleanupCallback?.();
      clsCleanupCallback?.();
    };
  }
  return () => void 0;
}
function _trackCLS() {
  return addClsInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry) {
      return;
    }
    _measurements["cls"] = { value: metric.value, unit: "" };
    _clsEntry = entry;
  }, true);
}
function _trackLCP() {
  return addLcpInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry || !isValidLcpMetric(metric.value)) {
      return;
    }
    _measurements["lcp"] = { value: metric.value, unit: "millisecond" };
    _lcpEntry = entry;
  }, true);
}
function _trackTtfb() {
  return addTtfbInstrumentationHandler(({ metric }) => {
    _navigationType = metric.navigationType;
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry) {
      return;
    }
    _measurements["ttfb"] = { value: metric.value, unit: "millisecond" };
  });
}
function _trackFcp() {
  return addFcpInstrumentationHandler(({ metric }) => {
    _navigationType = metric.navigationType;
    _measurements["fcp"] = { value: metric.value, unit: "millisecond" };
  });
}
function _trackFp() {
  return addPerformanceInstrumentationHandler("paint", ({ entries }) => {
    const firstHidden = getVisibilityWatcher();
    for (const entry of entries) {
      if (entry.name === "first-paint" && entry.startTime < firstHidden.firstHiddenTime) {
        _measurements["fp"] = { value: entry.startTime, unit: "millisecond" };
      }
    }
  });
}
function addWebVitalsToSpan(span, options) {
  const origin = browserPerformanceTimeOrigin();
  if (!getBrowserPerformanceAPI()?.getEntries || !origin) {
    resetWebVitalState();
    return;
  }
  const { spanStreamingEnabled, recordClsOnPageloadSpan, recordLcpOnPageloadSpan } = options;
  const timeOrigin = msToSec(origin);
  if (spanToJSON(span).attributes[SENTRY_OP] === "pageload") {
    _addTtfbRequestTimeToMeasurements(_measurements);
    _rebaseFpAgainstActivationStart(_measurements);
    if (spanStreamingEnabled) {
      const setAttr = (shortWebVitalName, value, customAttrName) => {
        const attrKey = customAttrName ?? `browser.web_vital.${shortWebVitalName}.value`;
        span.setAttribute(attrKey, value);
        DEBUG_BUILD && debug.log("Setting web vital attribute", { [attrKey]: value }, "on pageload span");
      };
      ["ttfb", "fp", "fcp"].forEach((measurementName) => {
        if (_measurements[measurementName]) {
          setAttr(measurementName, _measurements[measurementName].value);
        }
      });
      if (_measurements["ttfb.requestTime"]) {
        setAttr("ttfb.requestTime", _measurements["ttfb.requestTime"].value, BROWSER_WEB_VITAL_TTFB_REQUEST_TIME);
      }
    } else {
      if (!recordClsOnPageloadSpan) {
        delete _measurements.cls;
      }
      if (!recordLcpOnPageloadSpan) {
        delete _measurements.lcp;
      }
      Object.entries(_measurements).forEach(([measurementName, measurement]) => {
        setMeasurement(measurementName, measurement.value, measurement.unit, span);
      });
      _setWebVitalAttributes(span, options);
    }
    if (_navigationType) {
      span.setAttribute(BROWSER_NAVIGATION_TYPE, _navigationType);
    }
    span.setAttribute(spanStreamingEnabled ? BROWSER_PERFORMANCE_TIME_ORIGIN : PERFORMANCE_TIMEORIGIN, timeOrigin);
    span.setAttribute(
      // oxlint-disable-next-line typescript/no-deprecated -- Preserve the existing attribute name.
      spanStreamingEnabled ? BROWSER_PERFORMANCE_NAVIGATION_ACTIVATION_START : PERFORMANCE_ACTIVATIONSTART,
      getActivationStart()
    );
  }
  resetWebVitalState();
}
function resetWebVitalState() {
  _lcpEntry = void 0;
  _clsEntry = void 0;
  _navigationType = void 0;
  _measurements = {};
}
function _setWebVitalAttributes(span, options) {
  if (_lcpEntry && options.recordLcpOnPageloadSpan) {
    if (_lcpEntry.element) {
      span.setAttribute(LCP_ELEMENT, htmlTreeAsString(_lcpEntry.element));
    }
    if (_lcpEntry.id) {
      span.setAttribute(LCP_ID, _lcpEntry.id);
    }
    if (_lcpEntry.url) {
      span.setAttribute(LCP_URL, filterCollectedUrl(_lcpEntry.url.trim()).slice(0, 200));
    }
    if (_lcpEntry.loadTime != null) {
      span.setAttribute(LCP_LOADTIME, _lcpEntry.loadTime);
    }
    if (_lcpEntry.renderTime != null) {
      span.setAttribute(LCP_RENDERTIME, _lcpEntry.renderTime);
    }
    span.setAttribute(LCP_SIZE, _lcpEntry.size);
  }
  if (_clsEntry?.sources && options.recordClsOnPageloadSpan) {
    _clsEntry.sources.forEach(
      (source, index) => span.setAttribute(`cls.source.${index + 1}`, htmlTreeAsString(source.node))
    );
  }
}
function _rebaseFpAgainstActivationStart(measurements) {
  const fp = measurements["fp"];
  if (fp) {
    fp.value = Math.max(fp.value - getActivationStart(), 0);
  }
}
function _addTtfbRequestTimeToMeasurements(_measurements2) {
  const navEntry = getNavigationEntry(false);
  if (!navEntry) {
    return;
  }
  const { responseStart, requestStart } = navEntry;
  if (requestStart <= responseStart) {
    _measurements2["ttfb.requestTime"] = {
      value: responseStart - requestStart,
      unit: "millisecond"
    };
  }
}

export { addWebVitalsToSpan, startTrackingWebVitals };
//# sourceMappingURL=tracking.js.map
