const DEFAULT_TIMEOUT_MS = 2_000;

export interface GameWorkerClientDeps {
  fetch?: typeof fetch;
  workerUrl?: string;
  workerSecret?: string;
}

export interface GameWorkerRequestInit extends RequestInit {
  timeoutMs?: number;
}

export class GameWorkerConfigurationError extends Error {
  constructor() {
    super("Game worker URL or secret is missing");
    this.name = "GameWorkerConfigurationError";
  }
}

export function isGameWorkerConfigured(
  deps: GameWorkerClientDeps = {}
): boolean {
  const { workerUrl, workerSecret } = readGameWorkerConfig(deps);
  return Boolean(workerUrl && workerSecret);
}

export async function gameWorkerFetch(
  path: string,
  init: GameWorkerRequestInit = {},
  deps: GameWorkerClientDeps = {}
): Promise<Response> {
  const { workerUrl, workerSecret } = readGameWorkerConfig(deps);
  if (!workerUrl || !workerSecret) {
    throw new GameWorkerConfigurationError();
  }

  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    ...requestInit
  } = init;
  // Header validation can throw. Finish it before installing abort resources
  // so malformed configuration cannot leak a timer or caller-signal listener.
  const headers = new Headers(requestInit.headers);
  headers.set("Authorization", `Bearer ${workerSecret}`);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (deps.fetch ?? globalThis.fetch)(
      buildWorkerUrl(workerUrl, path),
      {
        ...requestInit,
        headers,
        signal: controller.signal,
      }
    );
    const bodyText = await response.text();
    return bufferedResponse(response, bodyText);
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

function readGameWorkerConfig(deps: GameWorkerClientDeps) {
  return {
    workerUrl: deps.workerUrl ?? process.env.GAME_WORKER_URL ?? "",
    workerSecret: deps.workerSecret ?? process.env.GAME_WORKER_SECRET ?? "",
  };
}

function buildWorkerUrl(workerUrl: string, path: string): string {
  return `${workerUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
