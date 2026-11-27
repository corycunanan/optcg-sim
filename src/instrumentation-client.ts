import { reportError } from "@/lib/error-reporting";

/**
 * Browser instrumentation (OPT-1063). Runs once before the app hydrates and
 * forwards errors that no React error boundary catches. Boundaries report
 * their own errors through `reportError` with source `app.boundary`.
 */
if (typeof window !== "undefined") {
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
