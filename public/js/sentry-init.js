import * as Sentry from "@sentry/browser";
import { scrubSentryEvent } from "./sentry-scrub.js";

const dsn = document.currentScript?.dataset?.dsn ?? document.querySelector("meta[name='sentry-dsn']")?.content;
if (dsn) {
  Sentry.init({ dsn, sendDefaultPii: false, tracesSampleRate: 0, beforeSend: scrubSentryEvent });
}
