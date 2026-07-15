# Shared contracts

`shared/` contains pure, runtime-neutral contracts used by more than one runtime,
such as the Next.js app and the card-data pipeline.

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
