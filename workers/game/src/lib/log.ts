/**
 * Structured logging for the game worker.
 *
 * Module-level singleton: `configureLogger()` is called once from
 * `GameSession` on construction with `env.LOG_URL`. Other engine modules
 * import `log()` directly — no parameter threading.
 *
 * Each event is emitted as a single JSON line on stdout (visible in
 * `wrangler tail`) and, if `LOG_URL` is set, POSTed fire-and-forget.
 * Logging must never throw or block gameplay; failures are swallowed.
 *
 * Tests do not call `configureLogger`, so logging is a no-op by default.
 */

export type LogData = Record<string, unknown>;

export interface LogEvent extends LogData {
  event: string;
  timestamp: string;
}

export interface Logger {
  log(event: string, data?: LogData): void;
}

class NoopLogger implements Logger {
  log(): void {
    /* tests + unconfigured default: silent */
  }
}

class ActiveLogger implements Logger {
  constructor(private readonly logUrl: string | undefined) {}

  log(event: string, data?: LogData): void {
    const entry: LogEvent = {
      event,
      timestamp: new Date().toISOString(),
      ...data,
    };
    const body = JSON.stringify(entry);
    console.log(body);
    if (this.logUrl) {
      fetch(this.logUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }).catch(() => {
        /* swallow */
      });
    }
  }
}

let current: Logger = new NoopLogger();

export function configureLogger(logUrl: string | undefined): void {
  current = new ActiveLogger(logUrl);
}

export function log(event: string, data?: LogData): void {
  current.log(event, data);
}
