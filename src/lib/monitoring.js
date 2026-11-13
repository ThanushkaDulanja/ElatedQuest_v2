import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";
import { scrubSentryEvent } from "./sentry-scrub.js";

if (env.sentryDsn) {
  Sentry.init({ dsn: env.sentryDsn, environment: env.nodeEnv, sendDefaultPii: false, beforeSend: scrubSentryEvent });
}

export function captureException(error, context = {}) {
  Sentry.captureException(error, { extra: context });
}

export function captureJobError(error, job) {
  captureException(error, { job });
}
