import { NETWORK_PROTOCOL_VERSION, NETWORK_PROTOCOL_NAME, HTTP_REQUEST_TIME_TO_FIRST_BYTE, HTTP_REQUEST_RESPONSE_END, HTTP_REQUEST_RESPONSE_START, HTTP_REQUEST_REQUEST_START, HTTP_REQUEST_CONNECTION_END, HTTP_REQUEST_SECURE_CONNECTION_START, HTTP_REQUEST_CONNECT_START, HTTP_REQUEST_DOMAIN_LOOKUP_END, HTTP_REQUEST_DOMAIN_LOOKUP_START, HTTP_REQUEST_FETCH_START, HTTP_REQUEST_WORKER_START, HTTP_REQUEST_REDIRECT_END, HTTP_REQUEST_REDIRECT_START } from '@sentry/conventions/attributes';
import { _INTERNAL_performanceTimeToSeconds } from '@sentry/core';
import { extractNetworkProtocol, msToSec } from './utils.js';

function resourceTimingToSpanAttributes(resourceTiming) {
  const timingSpanData = {};
  if (resourceTiming.nextHopProtocol != void 0) {
    const { name, version } = extractNetworkProtocol(resourceTiming.nextHopProtocol);
    timingSpanData[NETWORK_PROTOCOL_VERSION] = version;
    timingSpanData[NETWORK_PROTOCOL_NAME] = name;
  }
  if (_INTERNAL_performanceTimeToSeconds(resourceTiming.startTime) === void 0) {
    return timingSpanData;
  }
  const getAbsoluteTime = (time) => (
    // falsy values should be preserved so that we can later on drop undefined values and
    // preserve 0 vals for cross-origin resources without proper `Timing-Allow-Origin` header.
    time ? _INTERNAL_performanceTimeToSeconds(time, resourceTiming.startTime) : time
  );
  return dropUndefinedKeysFromObject({
    ...timingSpanData,
    [HTTP_REQUEST_REDIRECT_START]: getAbsoluteTime(resourceTiming.redirectStart),
    [HTTP_REQUEST_REDIRECT_END]: getAbsoluteTime(resourceTiming.redirectEnd),
    [HTTP_REQUEST_WORKER_START]: getAbsoluteTime(resourceTiming.workerStart),
    [HTTP_REQUEST_FETCH_START]: getAbsoluteTime(resourceTiming.fetchStart),
    [HTTP_REQUEST_DOMAIN_LOOKUP_START]: getAbsoluteTime(resourceTiming.domainLookupStart),
    [HTTP_REQUEST_DOMAIN_LOOKUP_END]: getAbsoluteTime(resourceTiming.domainLookupEnd),
    [HTTP_REQUEST_CONNECT_START]: getAbsoluteTime(resourceTiming.connectStart),
    [HTTP_REQUEST_SECURE_CONNECTION_START]: getAbsoluteTime(resourceTiming.secureConnectionStart),
    [HTTP_REQUEST_CONNECTION_END]: getAbsoluteTime(resourceTiming.connectEnd),
    [HTTP_REQUEST_REQUEST_START]: getAbsoluteTime(resourceTiming.requestStart),
    [HTTP_REQUEST_RESPONSE_START]: getAbsoluteTime(resourceTiming.responseStart),
    [HTTP_REQUEST_RESPONSE_END]: getAbsoluteTime(resourceTiming.responseEnd),
    // For TTFB we actually want the relative time from timeOrigin to responseStart
    // This way, TTFB always measures the "first page load" experience.
    // see: https://web.dev/articles/ttfb#measure-resource-requests
    [HTTP_REQUEST_TIME_TO_FIRST_BYTE]: resourceTiming.responseStart != null ? msToSec(resourceTiming.responseStart) : void 0
  });
}
function dropUndefinedKeysFromObject(attrs) {
  return Object.fromEntries(Object.entries(attrs).filter(([, value]) => value != null));
}

export { resourceTimingToSpanAttributes };
//# sourceMappingURL=resourceTiming.js.map
