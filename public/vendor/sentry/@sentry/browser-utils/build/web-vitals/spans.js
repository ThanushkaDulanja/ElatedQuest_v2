import { browserPerformanceTimeOrigin, hasSpanStreamingEnabled, spanToJSON, debug, _INTERNAL_performanceTimeToSeconds, getClient, filterCollectedUrl, timestampInSeconds, getActiveSpan, getRootSpan, UI_WEBVITAL_CLS_SPAN_NAME_FALLBACK, UI_INTERACTION_PRESS_SPAN_NAME_FALLBACK, UI_INTERACTION_DRAG_SPAN_NAME_FALLBACK, UI_INTERACTION_HOVER_SPAN_NAME_FALLBACK, UI_INTERACTION_CLICK_SPAN_NAME_FALLBACK, UI_WEBVITAL_LCP_SPAN_NAME_FALLBACK } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build.js';
import { htmlTreeAsString } from '../htmlTreeAsString.js';
import { getComponentName } from '../component-name.js';
import { MAX_PLAUSIBLE_INP_DURATION, INP_ENTRY_MAP, getCachedInteractionContext, UNKNOWN_ELEMENT_NAME } from './inp.js';
import { addClsInstrumentationHandler, addInpInstrumentationHandler, addLcpInstrumentationHandler } from '../instrumentation/performanceObserver.js';
import { SENTRY_OP, BROWSER_NAVIGATION_TYPE, SENTRY_EXCLUSIVE_TIME, UI_COMPONENT_NAME, BROWSER_WEB_VITAL_INP_TARGET, BROWSER_WEB_VITAL_INP_INTERACTION_TYPE, BROWSER_WEB_VITAL_LCP_ELEMENT, BROWSER_WEB_VITAL_LCP_ID, BROWSER_WEB_VITAL_LCP_URL, BROWSER_WEB_VITAL_LCP_LOAD_TIME, BROWSER_WEB_VITAL_LCP_RENDER_TIME, BROWSER_WEB_VITAL_LCP_SIZE } from '@sentry/conventions/attributes';
import { _emitWebVitalSpan } from './emitSpan.js';
import { isValidLcpMetric } from './lcp.js';
import { listenForWebVitalReportEvents } from './reportEvents.js';
import { getNavigationSpanForMetric } from './softNavs.js';
import { supportsWebVital, getBrowserPerformanceAPI, msToSec } from '../performance/utils.js';
import { NAVIGATION, UI_WEBVITAL_CLS, UI_INTERACTION_PRESS, UI_INTERACTION_DRAG, UI_INTERACTION_HOVER, UI_INTERACTION_CLICK, UI_WEBVITAL_LCP } from '@sentry/conventions/op';

const INTERACTION_TYPE_TO_SPAN_OP = {
  click: UI_INTERACTION_CLICK,
  hover: UI_INTERACTION_HOVER,
  drag: UI_INTERACTION_DRAG,
  press: UI_INTERACTION_PRESS
};
const INTERACTION_TYPE_TO_SPAN_NAME_FALLBACK = {
  click: UI_INTERACTION_CLICK_SPAN_NAME_FALLBACK,
  hover: UI_INTERACTION_HOVER_SPAN_NAME_FALLBACK,
  drag: UI_INTERACTION_DRAG_SPAN_NAME_FALLBACK,
  press: UI_INTERACTION_PRESS_SPAN_NAME_FALLBACK
};
function trackWebVitalPerNavigation(client, addInstrumentationHandler, send) {
  let pageloadSpan;
  client.on("afterStartPageLoadSpan", (span) => {
    pageloadSpan = span;
  });
  let bfcacheNavigationSpan;
  client.on("spanStart", (span) => {
    const attributes = spanToJSON(span).attributes;
    if (attributes?.[SENTRY_OP] === NAVIGATION && attributes[BROWSER_NAVIGATION_TYPE] === "back-forward-cache") {
      bfcacheNavigationSpan = span;
    }
  });
  addInstrumentationHandler(({ metric }) => {
    const navigationSpan = getNavigationSpanForMetric(metric);
    if (metric.navigationType === "soft-navigation") {
      if (navigationSpan) {
        send(metric, navigationSpan, metric.navigationId);
      } else {
        DEBUG_BUILD && debug.log(`[SoftNav] Dropping ${metric.name} for uncorrelated soft navigation ${metric.navigationId}`);
      }
      return;
    }
    if (metric.navigationType === "back-forward-cache") {
      send(metric, bfcacheNavigationSpan, void 0);
      return;
    }
    send(metric, pageloadSpan, void 0);
  });
}
function trackLcpAsSpan(client, perNavigation = false) {
  if (!supportsWebVital("largest-contentful-paint")) {
    return;
  }
  if (perNavigation) {
    trackWebVitalPerNavigation(client, addLcpInstrumentationHandler, (metric, parentSpan, softNavigationId) => {
      const entry = metric.entries[metric.entries.length - 1];
      _sendLcpSpan(
        metric.value,
        entry,
        parentSpan,
        softNavigationId,
        metric.navigationType,
        metric.navigationStartTime
      );
    });
    return;
  }
  let lcpValue = 0;
  let lcpEntry;
  let lcpNavigationType;
  const cleanupLcpHandler = addLcpInstrumentationHandler(({ metric }) => {
    lcpNavigationType = metric.navigationType;
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry || !isValidLcpMetric(metric.value)) {
      return;
    }
    lcpValue = metric.value;
    lcpEntry = entry;
  }, true);
  listenForWebVitalReportEvents(client, (pageloadSpan) => {
    _sendLcpSpan(lcpValue, lcpEntry, pageloadSpan, void 0, lcpNavigationType);
    cleanupLcpHandler();
  });
}
function _sendLcpSpan(lcpValue, entry, pageloadSpan, softNavigationId, navigationType, navigationStartTime) {
  if (!isValidLcpMetric(lcpValue)) {
    return;
  }
  DEBUG_BUILD && debug.log(`Sending LCP span (${lcpValue})`);
  const navigationStart = navigationStartTime || 0;
  const startTime = _INTERNAL_performanceTimeToSeconds(navigationStart) ?? msToSec(navigationStart);
  const endTime = entry ? _INTERNAL_performanceTimeToSeconds(entry.startTime, navigationStart) ?? msToSec(entry.startTime) : startTime + msToSec(lcpValue);
  const selector = entry ? htmlTreeAsString(entry.element) : void 0;
  const componentName = entry?.element ? getComponentName(entry.element) : null;
  const client = getClient();
  const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);
  const name = hasSpanStreaming ? componentName || UI_WEBVITAL_LCP_SPAN_NAME_FALLBACK : selector ?? UI_WEBVITAL_LCP_SPAN_NAME_FALLBACK;
  const attributes = {};
  if (selector) {
    attributes[BROWSER_WEB_VITAL_LCP_ELEMENT] = selector;
  }
  if (componentName) {
    attributes[UI_COMPONENT_NAME] = componentName;
  }
  entry?.id && (attributes[BROWSER_WEB_VITAL_LCP_ID] = entry.id);
  entry?.url && (attributes[BROWSER_WEB_VITAL_LCP_URL] = filterCollectedUrl(entry.url, client));
  entry?.loadTime != null && (attributes[BROWSER_WEB_VITAL_LCP_LOAD_TIME] = entry.loadTime);
  entry?.renderTime != null && (attributes[BROWSER_WEB_VITAL_LCP_RENDER_TIME] = entry.renderTime);
  entry?.size != null && (attributes[BROWSER_WEB_VITAL_LCP_SIZE] = entry.size);
  _emitWebVitalSpan({
    name,
    op: UI_WEBVITAL_LCP,
    origin: "auto.ui.browser.lcp",
    metricName: "lcp",
    value: lcpValue,
    attributes,
    parentSpan: pageloadSpan,
    startTime,
    endTime,
    softNavigationId,
    navigationType
  });
}
function trackClsAsSpan(client, perNavigation = false) {
  if (!supportsWebVital("layout-shift")) {
    return;
  }
  if (perNavigation) {
    trackWebVitalPerNavigation(client, addClsInstrumentationHandler, (metric, parentSpan, softNavigationId) => {
      const entry = metric.entries[metric.entries.length - 1];
      _sendClsSpan(
        metric.value,
        entry,
        parentSpan,
        softNavigationId,
        metric.navigationType,
        metric.navigationStartTime
      );
    });
    return;
  }
  let clsValue = 0;
  let clsEntry;
  let clsNavigationType;
  const cleanupClsHandler = addClsInstrumentationHandler(({ metric }) => {
    clsNavigationType = metric.navigationType;
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry) {
      return;
    }
    clsValue = metric.value;
    clsEntry = entry;
  }, true);
  listenForWebVitalReportEvents(client, (pageloadSpan) => {
    _sendClsSpan(clsValue, clsEntry, pageloadSpan, void 0, clsNavigationType);
    cleanupClsHandler();
  });
}
function _sendClsSpan(clsValue, entry, pageloadSpan, softNavigationId, navigationType, navigationStartTime) {
  DEBUG_BUILD && debug.log(`Sending CLS span (${clsValue})`);
  const offset = entry?.startTime ?? navigationStartTime ?? 0;
  const startTime = _INTERNAL_performanceTimeToSeconds(offset) ?? timestampInSeconds();
  const firstSourceNode = entry?.sources[0]?.node;
  const selector = entry ? htmlTreeAsString(firstSourceNode) : void 0;
  const componentName = firstSourceNode ? getComponentName(firstSourceNode) : null;
  const client = getClient();
  const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);
  const name = hasSpanStreaming ? componentName || UI_WEBVITAL_CLS_SPAN_NAME_FALLBACK : selector ?? UI_WEBVITAL_CLS_SPAN_NAME_FALLBACK;
  const attributes = {};
  if (componentName) {
    attributes[UI_COMPONENT_NAME] = componentName;
  }
  if (entry?.sources) {
    entry.sources.forEach((source, index) => {
      attributes[`browser.web_vital.cls.source.${index + 1}`] = htmlTreeAsString(source.node);
    });
  }
  _emitWebVitalSpan({
    name,
    op: UI_WEBVITAL_CLS,
    origin: "auto.ui.browser.cls",
    metricName: "cls",
    value: clsValue,
    attributes,
    parentSpan: pageloadSpan,
    startTime,
    softNavigationId,
    navigationType
  });
}
function trackInpAsSpan(client, perNavigation = false) {
  const performance = getBrowserPerformanceAPI();
  if (!performance || !browserPerformanceTimeOrigin()) {
    return;
  }
  const standalone = !hasSpanStreamingEnabled(client);
  if (perNavigation) {
    trackWebVitalPerNavigation(client, addInpInstrumentationHandler, (metric, parentSpan, softNavigationId) => {
      if (isPlausibleInp(metric)) {
        _sendInpSpan(metric.value, findInpEntry(metric), standalone, parentSpan, softNavigationId, metric);
      }
    });
    return;
  }
  const onInp = ({ metric }) => {
    if (isPlausibleInp(metric)) {
      _sendInpSpan(metric.value, findInpEntry(metric), standalone, void 0, void 0, metric);
    }
  };
  addInpInstrumentationHandler(onInp);
}
function isPlausibleInp(metric) {
  return metric.value != null && msToSec(metric.value) <= MAX_PLAUSIBLE_INP_DURATION;
}
function findInpEntry(metric) {
  return metric.entries.find((e) => e.duration === metric.value && INP_ENTRY_MAP[e.name]);
}
function _sendInpSpan(inpValue, entry, standalone = false, attributedSpan, softNavigationId, metric) {
  DEBUG_BUILD && debug.log(`Sending INP span (${inpValue})`);
  const startTime = _INTERNAL_performanceTimeToSeconds(entry?.startTime ?? metric?.navigationStartTime ?? 0);
  if (!startTime) {
    return;
  }
  const duration = msToSec(inpValue);
  const entryInteractionType = entry && INP_ENTRY_MAP[entry.name];
  const interactionType = entryInteractionType || "click";
  const cachedContext = entry && getCachedInteractionContext(entry.interactionId);
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan ? getRootSpan(activeSpan) : void 0;
  const spanToUse = attributedSpan || cachedContext?.span || rootSpan;
  const selector = cachedContext?.elementName || (entry ? htmlTreeAsString(entry.target) : void 0);
  const componentName = entry?.target ? getComponentName(entry.target) : null;
  const client = getClient();
  const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);
  const fallbackName = INTERACTION_TYPE_TO_SPAN_NAME_FALLBACK[interactionType];
  const name = hasSpanStreaming ? componentName || fallbackName : selector ?? "Interaction to next paint";
  const attributes = {
    [SENTRY_EXCLUSIVE_TIME]: entry?.duration ?? inpValue
  };
  selector && selector !== UNKNOWN_ELEMENT_NAME && (attributes[BROWSER_WEB_VITAL_INP_TARGET] = selector);
  entryInteractionType && (attributes[BROWSER_WEB_VITAL_INP_INTERACTION_TYPE] = entryInteractionType);
  if (componentName) {
    attributes[UI_COMPONENT_NAME] = componentName;
  }
  _emitWebVitalSpan({
    name,
    op: INTERACTION_TYPE_TO_SPAN_OP[interactionType],
    origin: "auto.ui.browser.inp",
    metricName: "inp",
    value: inpValue,
    attributes,
    startTime,
    endTime: startTime + duration,
    navigationType: metric?.navigationType,
    parentSpan: spanToUse,
    standalone,
    softNavigationId
  });
}

export { _sendClsSpan, _sendInpSpan, _sendLcpSpan, trackClsAsSpan, trackInpAsSpan, trackLcpAsSpan };
//# sourceMappingURL=spans.js.map
