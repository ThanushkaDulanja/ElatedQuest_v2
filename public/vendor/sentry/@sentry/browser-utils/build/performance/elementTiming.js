import { UI_ELEMENT_IDENTIFIER, SENTRY_ORIGIN, UI_ELEMENT_PAINT_TYPE, UI_ELEMENT_ID, UI_ELEMENT_TYPE, UI_ELEMENT_URL, UI_ELEMENT_WIDTH, UI_ELEMENT_HEIGHT } from '@sentry/conventions/attributes';
import { defineIntegration, browserPerformanceTimeOrigin, filterCollectedUrl, metrics } from '@sentry/core';
import { addPerformanceInstrumentationHandler } from '../instrumentation/performanceObserver.js';
import { getBrowserPerformanceAPI } from './utils.js';

const INTEGRATION_NAME = "ElementTiming";
const _elementTimingIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      const performance = getBrowserPerformanceAPI();
      if (!performance || !browserPerformanceTimeOrigin()) {
        return;
      }
      addPerformanceInstrumentationHandler("element", ({ entries }) => {
        for (const entry of entries) {
          const elementEntry = entry;
          if (!elementEntry.identifier) {
            continue;
          }
          const identifier = elementEntry.identifier;
          const paintType = elementEntry.name;
          const renderTime = elementEntry.renderTime;
          const loadTime = elementEntry.loadTime;
          const metricAttributes = {
            [SENTRY_ORIGIN]: "auto.ui.browser.element_timing",
            [UI_ELEMENT_IDENTIFIER]: identifier
          };
          if (paintType) {
            metricAttributes[UI_ELEMENT_PAINT_TYPE] = paintType;
          }
          if (elementEntry.id) {
            metricAttributes[UI_ELEMENT_ID] = elementEntry.id;
          }
          if (elementEntry.element) {
            metricAttributes[UI_ELEMENT_TYPE] = elementEntry.element.tagName.toLowerCase();
          }
          if (elementEntry.url) {
            metricAttributes[UI_ELEMENT_URL] = filterCollectedUrl(elementEntry.url);
          }
          if (elementEntry.naturalWidth) {
            metricAttributes[UI_ELEMENT_WIDTH] = elementEntry.naturalWidth;
          }
          if (elementEntry.naturalHeight) {
            metricAttributes[UI_ELEMENT_HEIGHT] = elementEntry.naturalHeight;
          }
          if (renderTime > 0) {
            metrics.distribution(`ui.element.render_time`, renderTime, {
              unit: "millisecond",
              attributes: metricAttributes
            });
          }
          if (loadTime > 0) {
            metrics.distribution(`ui.element.load_time`, loadTime, {
              unit: "millisecond",
              attributes: metricAttributes
            });
          }
        }
      });
    }
  };
});
const elementTimingIntegration = defineIntegration(_elementTimingIntegration);
function startTrackingElementTiming() {
  return () => void 0;
}

export { elementTimingIntegration, startTrackingElementTiming };
//# sourceMappingURL=elementTiming.js.map
