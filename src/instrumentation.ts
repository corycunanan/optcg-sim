import type { Instrumentation } from "next";
import { reportError } from "@/lib/error-reporting";

/**
 * Next.js server instrumentation (OPT-1063). `onRequestError` receives every
 * uncaught error from server components, route handlers, server actions and
 * the proxy. Only the path and route labels are forwarded; request headers
 * and cookies are deliberately left out.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context
) => {
  reportError(error, {
    source: "app.server",
    tags: {
      method: request.method,
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
    },
  });
};
