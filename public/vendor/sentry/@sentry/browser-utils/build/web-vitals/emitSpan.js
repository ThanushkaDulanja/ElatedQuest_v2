import { getRootSpan, spanToJSON, getCurrentScope, getClient } from '@sentry/core';
import { startInactiveSpan } from '@sentry/core/browser';
import { USER_AGENT_ORIGINAL, SENTRY_OP, SENTRY_SEGMENT_NAME, SENTRY_TRANSACTION, SENTRY_EXCLUSIVE_TIME, SENTRY_ORIGIN, SENTRY_REPLAY_ID, SENTRY_PAGELOAD_SPAN_ID, BROWSER_NAVIGATION_ID, BROWSER_NAVIGATION_TYPE } from '@sentry/conventions/attributes';
import { WINDOW } from '../types.js';

function _emitWebVitalSpan(options) {
  const {
    name,
    op,
    origin,
    metricName,
    value,
    attributes: passedAttributes,
    parentSpan,
    startTime,
    endTime,
    standalone,
    softNavigationId,
    navigationType
  } = options;
  const segmentSpan = parentSpan && getRootSpan(parentSpan);
  const segmentName = segmentSpan ? spanToJSON(segmentSpan).name : getCurrentScope().getScopeData().transactionName;
  const attributes = {
    [SENTRY_ORIGIN]: origin,
    [SENTRY_OP]: op,
    [SENTRY_EXCLUSIVE_TIME]: 0,
    [`browser.web_vital.${metricName}.value`]: value,
    // oxlint-disable-next-line typescript-eslint/no-deprecated
    [SENTRY_TRANSACTION]: segmentName,
    [SENTRY_SEGMENT_NAME]: segmentName,
    // Web vital score calculation relies on the user agent
    [USER_AGENT_ORIGINAL]: WINDOW.navigator?.userAgent,
    ...passedAttributes
  };
  if (parentSpan && spanToJSON(parentSpan).attributes[SENTRY_OP] === "pageload") {
    attributes[SENTRY_PAGELOAD_SPAN_ID] = parentSpan.spanContext().spanId;
  }
  if (softNavigationId != null) {
    attributes[BROWSER_NAVIGATION_ID] = softNavigationId;
  }
  if (navigationType) {
    attributes[BROWSER_NAVIGATION_TYPE] = navigationType;
  }
  if (standalone) {
    Object.assign(attributes, getReplayAttributes());
  }
  const span = startInactiveSpan({
    name,
    attributes,
    startTime,
    parentSpan,
    // oxlint-disable-next-line typescript/no-deprecated -- intentional during the v1/v2 transition; see the TODO(standalone) above
    experimental: standalone ? { standalone: true } : void 0
  });
  if (span) {
    span.end(endTime ?? startTime);
  }
}
function getReplayAttributes() {
  const replay = getClient()?.getIntegrationByName("Replay");
  const replayId = replay?.getReplayId(true);
  if (!replayId) {
    return {};
  }
  return {
    [SENTRY_REPLAY_ID]: replayId,
    // Not the `SENTRY_REPLAY_IS_BUFFERING` convention: that one has no `sentry._internal.` prefix, and
    // the rest of the SDK sets the prefixed key (see `logs/internal.ts`, `metrics/internal.ts`).
    "sentry._internal.replay_is_buffering": replay.getRecordingMode() === "buffer" ? true : void 0
  };
}

export { _emitWebVitalSpan };
//# sourceMappingURL=emitSpan.js.map
