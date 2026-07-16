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
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(requestInit.headers);
  headers.set("Authorization", `Bearer ${workerSecret}`);

  try {
    return await (deps.fetch ?? globalThis.fetch)(
      buildWorkerUrl(workerUrl, path),
      {
        ...requestInit,
        headers,
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
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
