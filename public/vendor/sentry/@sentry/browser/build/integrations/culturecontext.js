import { CULTURE_CALENDAR, CULTURE_TIMEZONE, CULTURE_LOCALE } from '@sentry/conventions/attributes';
import { defineIntegration, safeSetSpanJSONAttributes } from '@sentry/core';
import { WINDOW } from '../helpers.js';

const INTEGRATION_NAME = "CultureContext";
const _cultureContextIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    preprocessEvent(event) {
      const culture = getCultureContext();
      if (culture) {
        event.contexts = {
          ...event.contexts,
          culture: { ...culture, ...event.contexts?.culture }
        };
      }
    },
    processSegmentSpan(span) {
      const culture = getCultureContext();
      if (culture) {
        safeSetSpanJSONAttributes(span, {
          [CULTURE_LOCALE]: culture.locale,
          [CULTURE_TIMEZONE]: culture.timezone,
          [CULTURE_CALENDAR]: culture.calendar
        });
      }
    }
  };
});
const cultureContextIntegration = defineIntegration(_cultureContextIntegration);
function getCultureContext() {
  try {
    const intl = WINDOW.Intl;
    if (!intl) {
      return void 0;
    }
    const options = intl.DateTimeFormat().resolvedOptions();
    return {
      locale: options.locale,
      timezone: options.timeZone,
      calendar: options.calendar
    };
  } catch {
    return void 0;
  }
}

export { cultureContextIntegration };
//# sourceMappingURL=culturecontext.js.map
