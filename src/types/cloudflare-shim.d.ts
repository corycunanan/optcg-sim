// Ambient stubs for Cloudflare Workers runtime types referenced by
// `workers/game/src/types.ts` (the `Env` interface). The engine types we
// pull into the Next.js app via `@engine/*` transitively load that file,
// but the app never instantiates these — only the worker does, and the
// worker's own tsconfig loads the real types from `@cloudflare/workers-types`.
declare type DurableObjectNamespace = unknown;
