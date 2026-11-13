import { HTTP_RESPONSE_STATUS_CODE, HTTP_RESPONSE_BODY_SIZE, SENTRY_PROFILE_ID, SENTRY_PROFILER_ID, CULTURE_LOCALE, CULTURE_TIMEZONE, STATE_TYPE, ANGULAR_VERSION, REACT_VERSION } from '@sentry/conventions/attributes';

function scopeContextsToSpanAttributes(contexts) {
  const attrs = {};
  const { response, profile, cloud_resource, culture, state } = contexts;
  if (response) {
    if (response.status_code != null) {
      attrs[HTTP_RESPONSE_STATUS_CODE] = response.status_code;
    }
    if (response.body_size != null) {
      attrs[HTTP_RESPONSE_BODY_SIZE] = response.body_size;
    }
  }
  if (profile) {
    if (profile.profile_id) {
      attrs[SENTRY_PROFILE_ID] = profile.profile_id;
    }
    if (profile.profiler_id) {
      attrs[SENTRY_PROFILER_ID] = profile.profiler_id;
    }
  }
  if (cloud_resource) {
    for (const [key, value] of Object.entries(cloud_resource)) {
      if (value != null) {
        attrs[key] = value;
      }
    }
  }
  if (culture) {
    if (culture.locale) {
      attrs[CULTURE_LOCALE] = culture.locale;
    }
    if (culture.timezone) {
      attrs[CULTURE_TIMEZONE] = culture.timezone;
    }
  }
  if (state?.state && typeof state.state.type === "string") {
    attrs[STATE_TYPE] = state.state.type;
  }
  const angular = contexts["angular"];
  if (angular) {
    const version = angular["version"];
    if (typeof version === "string" || typeof version === "number") {
      attrs[ANGULAR_VERSION] = version;
    }
  }
  const react = contexts["react"];
  if (react) {
    const version = react["version"];
    if (typeof version === "string" || typeof version === "number") {
      attrs[REACT_VERSION] = version;
    }
  }
  return attrs;
}

export { scopeContextsToSpanAttributes };
//# sourceMappingURL=scopeContextAttributes.js.map
