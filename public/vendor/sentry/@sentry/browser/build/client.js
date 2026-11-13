import { setRouteProvider } from '@sentry/browser-utils';
import { Client, getSDKSource, applySdkMetadata, addAutoIpAddressToSession, timestampInSeconds } from '@sentry/core';
import { eventFromException, eventFromMessage } from './eventbuilder.js';
import { WINDOW } from './helpers.js';

class BrowserClient extends Client {
  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  constructor(options) {
    const opts = applyDefaultOptions(options);
    const sdkSource = WINDOW.SENTRY_SDK_SOURCE || getSDKSource();
    applySdkMetadata(opts, "browser", ["browser"], sdkSource);
    super(opts);
    if (opts.routeProvider) {
      setRouteProvider(opts.routeProvider, this);
    }
    this._unhandledSessionStatus = "unhandled";
    const { userInfo } = this.getDataCollectionOptions();
    if (opts._metadata?.sdk) {
      opts._metadata.sdk.settings = {
        // Only allow IP inferral by Relay if the user opted in via dataCollection
        infer_ip: userInfo ? "auto" : "never",
        // purposefully allowing already passed settings to override the default
        ...opts._metadata.sdk.settings
      };
    }
    const { sendClientReports } = this._options;
    const checkDrift = () => {
      timestampInSeconds();
    };
    const listeners = [
      // Flush buffered data when the page becomes hidden (e.g. tab switch, navigation, or the page
      // being discarded). `flush()` emits the `flush` hook, which drains the span (streaming), log and
      // metric buffers and hands the resulting envelopes to the transport (which uses `keepalive`).
      // Client report outcomes don't listen to the `flush` hook, so we flush them separately.
      [
        WINDOW.document,
        "visibilitychange",
        () => {
          checkDrift();
          if (WINDOW.document.visibilityState === "hidden") {
            if (sendClientReports) {
              this._flushOutcomes();
            }
            queueMicrotask(() => {
              void this.flush();
            });
          }
        }
      ],
      // `freeze` and `resume` are only fired by Chromium browsers. Other browsers never fire them, so these listeners
      // are no-ops there.
      [WINDOW.document, "freeze", checkDrift],
      [WINDOW.document, "resume", checkDrift],
      // Pages restored from the back/forward cache were paused while they were cached.
      [WINDOW, "pagehide", checkDrift],
      [WINDOW, "pageshow", checkDrift]
    ];
    listeners.forEach(([target, name, listener]) => target?.addEventListener?.(name, listener));
    this.on(
      "close",
      () => listeners.forEach(([target, name, listener]) => target?.removeEventListener?.(name, listener))
    );
    if (userInfo) {
      this.on("beforeSendSession", addAutoIpAddressToSession);
    }
  }
  /**
   * @inheritDoc
   */
  eventFromException(exception, hint) {
    return eventFromException(this._options.stackParser, exception, hint, this._options.attachStacktrace);
  }
  /**
   * @inheritDoc
   */
  eventFromMessage(message, level = "info", hint) {
    return eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace);
  }
  /**
   * @inheritDoc
   */
  _prepareEvent(event, hint, currentScope, isolationScope) {
    event.platform = event.platform || "javascript";
    return super._prepareEvent(event, hint, currentScope, isolationScope);
  }
}
function applyDefaultOptions(optionsArg) {
  return {
    release: typeof __SENTRY_RELEASE__ === "string" ? __SENTRY_RELEASE__ : WINDOW.SENTRY_RELEASE?.id,
    // This supports the variable that sentry-webpack-plugin injects
    sendClientReports: true,
    // We default this to true, as it is the safer scenario
    parentSpanIsAlwaysRootSpan: true,
    ...optionsArg
  };
}

export { BrowserClient, applyDefaultOptions };
//# sourceMappingURL=client.js.map
