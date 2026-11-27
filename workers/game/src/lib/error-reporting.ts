/**
 * Worker-side error reporting hook (OPT-1063).
 *
 * Builds a scrubbed, provider-agnostic report (`shared/error-report.ts`) and
 * hands it to the installed reporter. The default reporter emits an
 * `error.reported` structured log line through `log()`, so it reaches
 * `wrangler tail` and the optional `LOG_URL` sink today. A tracking provider
 * plugs in with `setErrorReporter()`; call sites stay the same.
 */

import {
  buildErrorReport,
  type ErrorReport,
  type ErrorReportContext,
  type ErrorReporter,
} from "../../../../shared/error-report.js";
import { log } from "./log.js";

export type { ErrorReport, ErrorReportContext, ErrorReporter };

export const logErrorReporter: ErrorReporter = (report) => {
  log("error.reported", report);
};

let reporter: ErrorReporter = logErrorReporter;

export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function resetErrorReporter(): void {
  reporter = logErrorReporter;
}

/** Reports a caught or unhandled error. Never throws. */
export function reportError(error: unknown, context: ErrorReportContext): void {
  try {
    reporter(buildErrorReport(error, context));
  } catch {
    /* Reporting must never break gameplay. */
  }
}
