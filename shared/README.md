# Shared contracts

`shared/` contains pure, runtime-neutral contracts used by more than one runtime,
such as the Next.js app, game worker, and card-data pipeline.

## Rules

- Depend only on TypeScript and runtime-neutral standard language features. Do not
  import from the app, Prisma, Next.js, Cloudflare Workers, or Node-specific APIs.
- Import shared modules through the `@shared/*` path alias (for example,
  `@shared/card-parsing`), which maps to this directory in the root TypeScript
  configuration.
- Place shared-module tests in `src/__tests__/` as `*.test.ts` files so the
  repository Vitest configuration discovers them.
- Keep worker-only contracts in `workers/game/src/`; `shared/` is only for pure
  contracts that must cross runtime boundaries.

`game-init.ts` is the canonical Next.js-to-game-worker initialization wire
contract. Its generic card-data parameter lets the worker narrow validated card
schemas without changing the serialized payload shape.

`target-filter.ts` is the canonical runtime-neutral TargetFilter predicate
core. App and worker adapters supply their own effective-stat, keyword, and
result-reference reads while sharing the same per-key boolean semantics.
