/**
 * Worker-side error reporting hook (OPT-1063).
 *
 * Builds a scrubbed, provider-agnostic report (`shared/error-report.ts`) and
 * hands it to the installed reporter. The default reporter emits an
 * `error.reported` structured log line through `log()`, so it reaches
 * `wrangler tail` and the optional `LOG_URL` sink, and is forwarded to Sentry
 * when `SENTRY_DSN` is set (see `sentry.ts`).
 */

import {
  buildErrorReport,
  type ErrorReport,
  type ErrorReportContext,
  type ErrorReporter,
} from "../../../../shared/error-report.js";
import * as Sentry from "@sentry/cloudflare";
import { toProviderTags } from "../../../../shared/error-report.js";
import { log } from "./log.js";

export type { ErrorReport, ErrorReportContext, ErrorReporter };

export const logErrorReporter: ErrorReporter = (report) => {
  log("error.reported", report);
};

/**
 * Forwards to Sentry. Without a DSN (`SENTRY_DSN` unset, or outside the
 * `withSentry` / Durable Object wrappers) the SDK has no client and this is
 * a no-op. Errors those wrappers also see are captured once: Sentry marks a
 * captured error and skips it the second time.
 */
export const sentryErrorReporter: ErrorReporter = (report, error) => {
  Sentry.captureException(error, {
    tags: toProviderTags(report),
    user: report.userId ? { id: report.userId } : undefined,
  });
};

export const defaultErrorReporter: ErrorReporter = (report, error) => {
  logErrorReporter(report, error);
  try {
    sentryErrorReporter(report, error);
  } catch {
    /* Sentry failures never block the log line. */
  }
};

let reporter: ErrorReporter = defaultErrorReporter;

export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function resetErrorReporter(): void {
  reporter = defaultErrorReporter;
}

/** Reports a caught or unhandled error. Never throws. */
export function reportError(error: unknown, context: ErrorReportContext): void {
  try {
    reporter(buildErrorReport(error, context), error);
  } catch {
    /* Reporting must never break gameplay. */
  }
}
