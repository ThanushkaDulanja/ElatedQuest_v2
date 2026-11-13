const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const SECRET_QUERY = /([?&](?:token|code|state|key|secret|password|auth|access_token|refresh_token)=)[^&#\s]*/giu;
const SECRET_VALUE = /\b((?:token|code|state|key|secret|password|auth|access_token|refresh_token)\s*[:=]\s*)[^\s,;]+/giu;

function scrubText(value) {
  return String(value).replace(EMAIL, "[redacted-email]").replace(SECRET_QUERY, "$1[redacted]").replace(SECRET_VALUE, "$1[redacted]");
}

function scrubUrl(value) {
  try {
    const url = new URL(String(value));
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value).split(/[?#]/u, 1)[0];
  }
}

export function scrubSentryEvent(event) {
  if (event.request) {
    if (event.request.url) { event.request.url = scrubUrl(event.request.url); }
    delete event.request.query_string;
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
  }
  if (event.user) { delete event.user.email; delete event.user.username; delete event.user.ip_address; }
  for (const item of event.exception?.values ?? []) {
    if (item.value) { item.value = scrubText(item.value); }
  }
  if (event.message) { event.message = scrubText(event.message); }
  if (event.logentry?.message) { event.logentry.message = scrubText(event.logentry.message); }
  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => {
    if (breadcrumb.message) { breadcrumb.message = scrubText(breadcrumb.message); }
    if (breadcrumb.data) {
      if (breadcrumb.data.url) { breadcrumb.data.url = scrubUrl(breadcrumb.data.url); }
      delete breadcrumb.data.request_body;
      delete breadcrumb.data.response_body;
    }
    return breadcrumb;
  });
  return event;
}
