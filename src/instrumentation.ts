import type { Instrumentation } from "next";
import {
  consoleErrorReporter,
  reportError,
  setErrorReporter,
} from "@/lib/error-reporting";
import {
  combineReporters,
  createSentryReporter,
  sentryBaseOptions,
} from "@/lib/sentry";

/**
 * Starts Sentry on the Node.js and edge runtimes when `SENTRY_DSN` is set
 * (OPT-1063). Reports keep their `[ERROR_REPORT]` log line as well.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(sentryBaseOptions(dsn));
  setErrorReporter(
    combineReporters(consoleErrorReporter, createSentryReporter(Sentry))
  );
}

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
