import {
  buildErrorReport,
  type ErrorReport,
  type ErrorReportContext,
  type ErrorReporter,
} from "@shared/error-report";

/**
 * App-side error reporting hook (OPT-1063). Safe in server, edge and browser
 * code. The default reporter writes one `[ERROR_REPORT]` console line, which
 * Vercel's runtime logs and the browser console both keep. A tracking
 * provider plugs in with `setErrorReporter()` from instrumentation.
 */

export type { ErrorReport, ErrorReportContext, ErrorReporter };

export const consoleErrorReporter: ErrorReporter = (report) => {
  console.error("[ERROR_REPORT]", report);
};

let reporter: ErrorReporter = consoleErrorReporter;

export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function resetErrorReporter(): void {
  reporter = consoleErrorReporter;
}

/** Reports a caught or unhandled error. Never throws. */
export function reportError(error: unknown, context: ErrorReportContext): void {
  try {
    reporter(buildErrorReport(error, context));
  } catch {
    /* Reporting must never break the caller. */
  }
}
