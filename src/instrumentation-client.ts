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
 * Browser instrumentation (OPT-1063). Runs once before the app hydrates and
 * forwards errors that no React error boundary catches. Boundaries report
 * their own errors through `reportError` with source `app.boundary`.
 *
 * With `NEXT_PUBLIC_SENTRY_DSN` set, Sentry loads as a separate chunk and
 * receives the same reports. Its own global handlers stay off because the
 * listeners below already cover those errors.
 */
if (typeof window !== "undefined") {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    void import("@sentry/nextjs").then((Sentry) => {
      Sentry.init({
        ...sentryBaseOptions(dsn),
        integrations: (defaults) =>
          defaults.filter(
            (integration) => integration.name !== "GlobalHandlers"
          ),
      });
      setErrorReporter(
        combineReporters(consoleErrorReporter, createSentryReporter(Sentry))
      );
    });
  }

  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, {
      source: "app.client",
      tags: { kind: "error", path: window.location.pathname },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, {
      source: "app.client",
      tags: { kind: "unhandledrejection", path: window.location.pathname },
    });
  });
}
