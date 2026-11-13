import { LRUMap, getClient, safeCallback, debug, parseStringToURLObject } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build.js';
import { getLocationHref } from './getLocationHref.js';

const CLIENT_ROUTE_PROVIDERS = /* @__PURE__ */ new WeakMap();
function setRouteProvider(provider, client = getClient()) {
  if (!client) {
    DEBUG_BUILD && debug.warn("Cannot set a route provider without a client.");
    return;
  }
  if (DEBUG_BUILD && getRouteProvider(client)) {
    debug.warn(
      "A route provider is already registered for this client and will be replaced. Routes only the previous provider knows about will no longer resolve."
    );
  }
  CLIENT_ROUTE_PROVIDERS.set(client, provider);
}
function getRouteProvider(client = getClient()) {
  return client && CLIENT_ROUTE_PROVIDERS.get(client);
}
function resolveRoute(url, client = getClient()) {
  const provider = getRouteProvider(client);
  if (!provider) {
    return void 0;
  }
  const urlObject = typeof url === "string" ? parseLocation(url) : url;
  if (!urlObject) {
    return void 0;
  }
  return safeCallback(
    DEBUG_BUILD ? "Route provider threw while resolving a route:" : "",
    () => provider.resolveRoute(urlObject) || void 0,
    () => void 0
  );
}
function resolveCurrentRoute(client = getClient()) {
  const provider = getRouteProvider(client);
  return safeCallback(
    DEBUG_BUILD ? "Route provider threw while resolving a route:" : "",
    () => provider?.resolveCurrentRoute() || void 0,
    () => void 0
  );
}
function createUrlRouteProvider(resolveRouteFromUrl) {
  return {
    resolveRoute: resolveRouteFromUrl,
    resolveCurrentRoute: () => {
      const urlObject = parseLocation(getLocationHref());
      return urlObject && resolveRouteFromUrl(urlObject);
    }
  };
}
function createCachedRouteProvider(maxEntries = 50) {
  const routeNames = new LRUMap(maxEntries);
  return {
    ...createUrlRouteProvider((url) => routeNames.get(url.pathname)),
    record(pathname, routeName) {
      if (pathname && routeName) {
        routeNames.set(pathname, routeName);
      }
    }
  };
}
function parseLocation(url) {
  return url ? parseStringToURLObject(url, getLocationHref() || void 0) : void 0;
}

export { createCachedRouteProvider, createUrlRouteProvider, getRouteProvider, resolveCurrentRoute, resolveRoute, setRouteProvider };
//# sourceMappingURL=routing.js.map
