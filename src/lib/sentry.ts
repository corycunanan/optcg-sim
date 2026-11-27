import {
  scrubProviderEvent,
  toProviderTags,
  type ErrorReporter,
} from "@shared/error-report";

/**
 * Sentry wiring for the Next.js app (OPT-1063). Sentry is enabled only when a
 * DSN is configured: `SENTRY_DSN` on the server and edge runtimes,
 * `NEXT_PUBLIC_SENTRY_DSN` in the browser. Without one, nothing loads.
 *
 * Sentry's automatic capture is kept off where `reportError` already covers
 * the same errors, so each error reaches Sentry once, through the scrubbed
 * hook. Every event and breadcrumb also passes `scrubProviderEvent`.
 */

type SentryLike = {
  captureException: (
    error: unknown,
    hint: {
      tags: Record<string, string>;
      user?: { id: string };
    }
  ) => unknown;
};

export function sentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "development"
  );
}

export function sentryBaseOptions(dsn: string) {
  return {
    dsn,
    environment: sentryEnvironment(),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: <T>(event: T) => scrubProviderEvent(event),
    beforeBreadcrumb: <T>(breadcrumb: T) => scrubProviderEvent(breadcrumb),
  };
}

export function createSentryReporter(sentry: SentryLike): ErrorReporter {
  return (report, error) => {
    sentry.captureException(error, {
      tags: toProviderTags(report),
      user: report.userId ? { id: report.userId } : undefined,
    });
  };
}

/** Runs each reporter; one failing never stops the others. */
export function combineReporters(...reporters: ErrorReporter[]): ErrorReporter {
  return (report, error) => {
    for (const reporter of reporters) {
      try {
        reporter(report, error);
      } catch {
        /* keep going */
      }
    }
  };
}
