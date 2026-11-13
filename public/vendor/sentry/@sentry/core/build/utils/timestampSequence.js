import { SENTRY_TIMESTAMP_SEQUENCE } from '@sentry/conventions/attributes';

let _sequenceNumber = 0;
let _previousTimestampMs;
function getSequenceAttribute(timestampInSeconds) {
  const nowMs = Math.floor(timestampInSeconds * 1e3);
  if (_previousTimestampMs !== void 0 && nowMs !== _previousTimestampMs) {
    _sequenceNumber = 0;
  }
  const value = _sequenceNumber;
  _sequenceNumber++;
  _previousTimestampMs = nowMs;
  return {
    key: SENTRY_TIMESTAMP_SEQUENCE,
    value: { value, type: "integer" }
  };
}

export { getSequenceAttribute };
//# sourceMappingURL=timestampSequence.js.map
