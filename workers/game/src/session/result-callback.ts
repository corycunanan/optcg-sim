import { log } from "../lib/log.js";

export const RESULT_CALLBACK_TIMEOUT_MS = 2_000;
export const RESULT_CALLBACK_MAX_ATTEMPTS = 3;
export const RESULT_CALLBACK_BACKOFF_MS = 250;

const RETRYABLE_STATUSES = new Set([408, 425, 429]);

export interface ResultCallbackFetchDeps {
  fetch?: typeof fetch;
  wait?: (delayMs: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

/**
 * Adds a bounded timeout and transient-failure retries to the result callback
 * without changing SessionRepository's non-fatal result boundary.
 */
export function createResultCallbackFetch(
  deps: ResultCallbackFetchDeps = {}
): typeof fetch {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const wait = deps.wait ?? waitFor;
  const timeoutMs = deps.timeoutMs ?? RESULT_CALLBACK_TIMEOUT_MS;
  const maxAttempts = deps.maxAttempts ?? RESULT_CALLBACK_MAX_ATTEMPTS;
  const backoffMs = deps.backoffMs ?? RESULT_CALLBACK_BACKOFF_MS;

  return (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    const gameId = readGameId(init?.body);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(
          fetchImpl,
          input,
          init,
          timeoutMs
        );
        if (response.ok) return response;

        if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
          log("game.result_write_failed", {
            source: "GameSession.writeResultToDb",
            gameId,
            attempts: attempt,
            status: response.status,
          });
          return response;
        }

        // The network body was already materialized under this attempt's
        // deadline. Cancel the in-memory retry response before backoff so no
        // response body remains open across attempts.
        await response.body?.cancel();
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) {
          log("game.result_write_failed", {
            source: "GameSession.writeResultToDb",
            gameId,
            attempts: attempt,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }

      await wait(backoffMs * attempt);
    }

    throw (
      lastError ??
      new Error("Game result callback exhausted without a response")
    );
  }) as typeof fetch;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
    try {
      const bodyText = await response.text();
      return bufferedResponse(response, bodyText);
    } catch (error) {
      if (!response.ok && !isRetryableStatus(response.status)) {
        return bufferedResponse(response, "");
      }
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function bufferedResponse(response: Response, bodyText: string): Response {
  const body = [204, 205, 304].includes(response.status) ? null : bodyText;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

function readGameId(body: BodyInit | null | undefined): string | null {
  if (typeof body !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return null;
    const gameId = Reflect.get(parsed, "gameId");
    return typeof gameId === "string" ? gameId : null;
  } catch {
    return null;
  }
}

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
