/**
 * Sentry options for the game worker (OPT-1063). `index.ts` passes these to
 * `withSentry` (entry fetch) and `instrumentDurableObjectWithSentry`
 * (GameSession). With `SENTRY_DSN` unset the SDK stays disabled.
 */

import type { CloudflareOptions } from "@sentry/cloudflare";
import { scrubProviderEvent } from "../../../../shared/error-report.js";
import type { Env } from "../types.js";

export function sentryOptions(env: Env): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    environment: env.SENTRY_ENVIRONMENT ?? "production",
    tracesSampleRate: 0,
    beforeSend: (event) => scrubProviderEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubProviderEvent(breadcrumb),
  };
}
