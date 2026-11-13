import { SENTRY_MESSAGE_TEMPLATE, SENTRY_TRACE_PARENT_SPAN_ID, USER_ID, USER_EMAIL, USER_NAME, SENTRY_RELEASE, SENTRY_ENVIRONMENT, SENTRY_SDK_NAME, SENTRY_SDK_VERSION, SENTRY_REPLAY_ID } from '@sentry/conventions/attributes';
import { serializeAttributes } from '../attributes.js';
import { getGlobalSingleton } from '../carrier.js';
import { getClient, getIsolationScope, getCurrentScope } from '../currentScopes.js';
import { DEBUG_BUILD } from '../debug-build.js';
import { debug, consoleSandbox } from '../utils/debug-logger.js';
import { isParameterizedString } from '../utils/is.js';
import { safeCallback, CALLBACK_ERROR } from '../utils/safeCallback.js';
import { getCombinedScopeData } from '../utils/scopeData.js';
import { getActiveSpan } from '../utils/spanUtils.js';
import { timestampInSeconds } from '../utils/time.js';
import { getSequenceAttribute } from '../utils/timestampSequence.js';
import { _getTraceInfoFromScope } from '../utils/trace-info.js';
import { SEVERITY_TEXT_TO_SEVERITY_NUMBER } from './constants.js';
import { createLogEnvelope } from './envelope.js';

const MAX_LOG_BUFFER_SIZE = 100;
function setLogAttribute(logAttributes, key, value, setEvenIfPresent = true) {
  if (value && (!logAttributes[key] || setEvenIfPresent)) {
    logAttributes[key] = value;
  }
}
function _INTERNAL_captureSerializedLog(client, serializedLog) {
  const bufferMap = _getBufferMap();
  const logBuffer = _INTERNAL_getLogBuffer(client);
  if (logBuffer === void 0) {
    bufferMap.set(client, [serializedLog]);
  } else {
    if (logBuffer.length >= MAX_LOG_BUFFER_SIZE) {
      _INTERNAL_flushLogsBuffer(client, logBuffer);
      bufferMap.set(client, [serializedLog]);
    } else {
      bufferMap.set(client, [...logBuffer, serializedLog]);
    }
  }
}
function _INTERNAL_captureLog(beforeLog, currentScope = getCurrentScope(), captureSerializedLog = _INTERNAL_captureSerializedLog) {
  const client = currentScope?.getClient() ?? getClient();
  if (!client) {
    DEBUG_BUILD && debug.warn("No client available to capture log.");
    return;
  }
  const { release, environment, beforeSendLog } = client.getOptions();
  const [, traceContext] = _getTraceInfoFromScope(client, currentScope);
  const processedLogAttributes = {
    ...beforeLog.attributes
  };
  const {
    user: { id, email, username },
    attributes: scopeAttributes
  } = getCombinedScopeData(getIsolationScope(), currentScope);
  setLogAttribute(processedLogAttributes, USER_ID, id, false);
  setLogAttribute(processedLogAttributes, USER_EMAIL, email, false);
  setLogAttribute(processedLogAttributes, USER_NAME, username, false);
  setLogAttribute(processedLogAttributes, SENTRY_RELEASE, release);
  setLogAttribute(processedLogAttributes, SENTRY_ENVIRONMENT, environment);
  const { name, version } = client.getSdkMetadata()?.sdk ?? {};
  setLogAttribute(processedLogAttributes, SENTRY_SDK_NAME, name);
  setLogAttribute(processedLogAttributes, SENTRY_SDK_VERSION, version);
  const replay = client.getIntegrationByName("Replay");
  const replayId = replay?.getReplayId(true);
  setLogAttribute(processedLogAttributes, SENTRY_REPLAY_ID, replayId);
  if (replayId && replay?.getRecordingMode() === "buffer") {
    setLogAttribute(processedLogAttributes, "sentry._internal.replay_is_buffering", true);
  }
  const beforeLogMessage = beforeLog.message;
  if (isParameterizedString(beforeLogMessage)) {
    const { __sentry_template_string__, __sentry_template_values__ = [] } = beforeLogMessage;
    if (__sentry_template_values__?.length) {
      processedLogAttributes[SENTRY_MESSAGE_TEMPLATE] = __sentry_template_string__;
    }
    __sentry_template_values__.forEach((param, index) => {
      processedLogAttributes[`sentry.message.parameter.${index}`] = param;
    });
  }
  const span = getActiveSpan(currentScope);
  setLogAttribute(processedLogAttributes, SENTRY_TRACE_PARENT_SPAN_ID, span?.spanContext().spanId);
  const processedLog = { ...beforeLog, attributes: processedLogAttributes };
  client.emit("beforeCaptureLog", processedLog);
  const log = beforeSendLog ? safeCallback(
    DEBUG_BUILD ? "The `beforeSendLog` callback threw an error, dropping the log:" : "",
    // We need to wrap this in `consoleSandbox` to avoid recursive calls to `beforeSendLog`
    () => consoleSandbox(() => beforeSendLog(processedLog)),
    () => CALLBACK_ERROR
  ) : processedLog;
  if (log === CALLBACK_ERROR) {
    client.recordDroppedEvent("callback_error", "log_item", 1);
    return;
  }
  if (!log) {
    client.recordDroppedEvent("before_send", "log_item", 1);
    DEBUG_BUILD && debug.warn("beforeSendLog returned null, log will not be captured.");
    return;
  }
  const { level, message, attributes: logAttributes = {}, severityNumber } = log;
  const timestamp = timestampInSeconds();
  const sequenceAttr = getSequenceAttribute(timestamp);
  const serializedLog = {
    timestamp,
    level,
    body: _removeLoneSurrogates(String(message)),
    trace_id: traceContext?.trace_id,
    severity_number: severityNumber ?? SEVERITY_TEXT_TO_SEVERITY_NUMBER[level],
    attributes: sanitizeLogAttributes({
      ...serializeAttributes(scopeAttributes),
      ...serializeAttributes(logAttributes, true),
      [sequenceAttr.key]: sequenceAttr.value
    })
  };
  captureSerializedLog(client, serializedLog);
  client.emit("afterCaptureLog", log);
}
function _INTERNAL_flushLogsBuffer(client, maybeLogBuffer) {
  const logBuffer = maybeLogBuffer ?? _INTERNAL_getLogBuffer(client) ?? [];
  if (logBuffer.length === 0) {
    return;
  }
  const clientOptions = client.getOptions();
  const envelope = createLogEnvelope(
    logBuffer,
    clientOptions._metadata,
    clientOptions.tunnel,
    client.getDsn(),
    client.getDataCollectionOptions().userInfo
  );
  _getBufferMap().set(client, []);
  client.emit("flushLogs");
  client.sendEnvelope(envelope);
}
function _INTERNAL_getLogBuffer(client) {
  return _getBufferMap().get(client);
}
function _getBufferMap() {
  return getGlobalSingleton("clientToLogBufferMap", () => /* @__PURE__ */ new WeakMap());
}
function sanitizeLogAttributes(attributes) {
  const sanitized = {};
  for (const [key, attr] of Object.entries(attributes)) {
    const sanitizedKey = _removeLoneSurrogates(key);
    if (attr.type === "string") {
      sanitized[sanitizedKey] = { ...attr, value: _removeLoneSurrogates(attr.value) };
    } else {
      sanitized[sanitizedKey] = attr;
    }
  }
  return sanitized;
}
function _removeLoneSurrogates(str) {
  const strObj = Object(str);
  const isWellFormed = strObj["isWellFormed"];
  const toWellFormed = strObj["toWellFormed"];
  if (typeof isWellFormed === "function" && typeof toWellFormed === "function") {
    return isWellFormed.call(str) ? str : toWellFormed.call(str);
  }
  return str;
}

export { _INTERNAL_captureLog, _INTERNAL_captureSerializedLog, _INTERNAL_flushLogsBuffer, _INTERNAL_getLogBuffer, _removeLoneSurrogates };
//# sourceMappingURL=internal.js.map
