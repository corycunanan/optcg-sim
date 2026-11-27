/**
 * Provider-agnostic error reports (OPT-1063), shared by the Next.js app and
 * the game worker.
 *
 * Callers build a report with `buildErrorReport()`, which normalizes any
 * thrown value and scrubs personal data, then hand it to whichever reporter
 * the runtime installed. Until a tracking provider is chosen, both runtimes
 * install a structured-log reporter. Swapping in a provider means installing
 * a different reporter; no call site changes.
 *
 * Privacy contract: the only identity that may leave the app is the opaque
 * `userId` a caller passes explicitly. Email addresses, bearer tokens, JWTs,
 * cookie and query-string credentials are redacted from the message, stack
 * and every context value.
 */

export type ErrorReportSource =
  | "app.server"
  | "app.client"
  | "app.boundary"
  | "worker.fetch"
  | "worker.session";

export type ErrorReportContextValue = string | number | boolean | null;

export type ErrorReportContext = {
  source: ErrorReportSource;
  /** Opaque user id. Never pass an email, username or display name. */
  userId?: string | null;
  /** Low-cardinality labels such as a route or game id. */
  tags?: Record<string, ErrorReportContextValue | undefined>;
};

export type ErrorReport = {
  source: ErrorReportSource;
  name: string;
  message: string;
  stack: string | null;
  /** Next.js server error digest, when the error came through a boundary. */
  digest: string | null;
  userId: string | null;
  tags: Record<string, ErrorReportContextValue>;
  timestamp: string;
};

/**
 * Receives the scrubbed report and the original thrown value. Providers that
 * parse stack frames (Sentry) need the original; they must scrub their own
 * event payload before sending it (see `scrubText`).
 */
export type ErrorReporter = (report: ErrorReport, error: unknown) => void;

export const REDACTED = "[redacted]";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_STACK_LENGTH = 8_000;
const MAX_TAG_LENGTH = 500;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const CREDENTIAL_PAIR_PATTERN =
  /\b((?:[\w.-]*session[-_]?token|[\w.-]*csrf[-_]?token|token|secret|password|api[-_]?key|access[-_]?token|refresh[-_]?token|authorization|cookie)["']?\s*[=:]\s*["']?)[^\s"'&;,]+/gi;
const URL_CREDENTIALS_PATTERN =
  /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi;

/** Redacts emails, bearer/basic credentials, JWTs and key=value secrets. */
export function scrubText(text: string): string {
  return text
    .replace(URL_CREDENTIALS_PATTERN, `$1${REDACTED}@`)
    .replace(BEARER_PATTERN, `$1 ${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(CREDENTIAL_PAIR_PATTERN, `$1${REDACTED}`)
    .replace(EMAIL_PATTERN, REDACTED);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function describeThrown(error: unknown): {
  name: string;
  message: string;
  stack: string | null;
  digest: string | null;
} {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    return {
      name: error.name || "Error",
      message: error.message,
      stack: typeof error.stack === "string" ? error.stack : null,
      digest: typeof digest === "string" ? digest : null,
    };
  }
  if (typeof error === "string") {
    return {
      name: "NonErrorThrown",
      message: error,
      stack: null,
      digest: null,
    };
  }
  let message: string;
  try {
    message = JSON.stringify(error) ?? String(error);
  } catch {
    message = String(error);
  }
  return { name: "NonErrorThrown", message, stack: null, digest: null };
}

export function buildErrorReport(
  error: unknown,
  context: ErrorReportContext,
  now: Date = new Date()
): ErrorReport {
  const thrown = describeThrown(error);
  const tags: Record<string, ErrorReportContextValue> = {};
  for (const [key, value] of Object.entries(context.tags ?? {})) {
    if (value === undefined) continue;
    tags[key] =
      typeof value === "string"
        ? truncate(scrubText(value), MAX_TAG_LENGTH)
        : value;
  }
  return {
    source: context.source,
    name: truncate(scrubText(thrown.name), MAX_TAG_LENGTH),
    message: truncate(scrubText(thrown.message), MAX_MESSAGE_LENGTH),
    stack: thrown.stack
      ? truncate(scrubText(thrown.stack), MAX_STACK_LENGTH)
      : null,
    digest: thrown.digest,
    userId: context.userId ?? null,
    tags,
    timestamp: now.toISOString(),
  };
}

/** Report tags as Sentry tags: string values, plus the report source. */
export function toProviderTags(report: ErrorReport): Record<string, string> {
  const tags: Record<string, string> = { source: report.source };
  for (const [key, value] of Object.entries(report.tags)) {
    if (value !== null) tags[key] = String(value);
  }
  if (report.digest) tags.digest = report.digest;
  return tags;
}

const DROPPED_REQUEST_FIELDS = [
  "cookies",
  "headers",
  "data",
  "query_string",
  "env",
];

function scrubDeep(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubText(value);
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = scrubDeep(value[index], depth + 1);
    }
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    record[key] = scrubDeep(record[key], depth + 1);
  }
  return record;
}

/**
 * Scrubs a provider event (Sentry event or breadcrumb) in place before it is
 * sent: drops request cookies, headers, body and query string, keeps only an
 * opaque user id, and redacts every remaining string with `scrubText`.
 */
export function scrubProviderEvent<T>(event: T): T {
  if (event === null || typeof event !== "object") return event;
  const record = event as Record<string, unknown>;
  const request = record.request;
  if (request && typeof request === "object") {
    const fields = request as Record<string, unknown>;
    for (const field of DROPPED_REQUEST_FIELDS) delete fields[field];
    if (typeof fields.url === "string") fields.url = fields.url.split("?")[0];
  }
  const user = record.user;
  if (user && typeof user === "object") {
    const id = (user as Record<string, unknown>).id;
    record.user =
      typeof id === "string" || typeof id === "number" ? { id } : undefined;
  }
  return scrubDeep(event, 0) as T;
}
