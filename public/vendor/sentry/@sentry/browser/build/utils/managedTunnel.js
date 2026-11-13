import { makeDsn, getTunnelPath, _INTERNAL_normalizeTunnelBasePath, debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build.js';

function resolveBrowserTunnelOption(options) {
  const { tunnel, dsn, transportOptions } = options;
  if (!tunnel || typeof tunnel === "string") {
    return { tunnel, transportOptions };
  }
  const tunnelOptions = tunnel === true ? {} : tunnel;
  const dsnComponents = dsn && makeDsn(dsn);
  const tunnelPath = tunnelOptions.path ?? (dsnComponents && getTunnelPath(dsnComponents));
  if (!tunnelPath) {
    return { tunnel: void 0, transportOptions };
  }
  const basePath = _INTERNAL_normalizeTunnelBasePath(tunnelOptions.basePath);
  const resolvedTunnel = `${basePath}${tunnelPath}${tunnelOptions.trailingSlash ? "/" : ""}`;
  DEBUG_BUILD && debug.log(`Tunneling events to "${resolvedTunnel}"`);
  return {
    tunnel: resolvedTunnel,
    transportOptions: {
      ...transportOptions,
      // CSRF protection (SvelteKit, Astro) rejects the default `text/plain` POST to the tunnel as a form submission.
      headers: { "Content-Type": "application/x-sentry-envelope", ...transportOptions?.headers }
    }
  };
}

export { resolveBrowserTunnelOption };
//# sourceMappingURL=managedTunnel.js.map
