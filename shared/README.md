# Shared runtime contracts

`shared/` is the runtime-neutral boundary used by the Next.js app, the
Cloudflare game worker, and (for card parsing) the data pipeline.

| File                           | Contract                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `card-parsing.ts`              | Card ID and effect-text parsing shared by the app/pipeline.                               |
| `game-init.ts`                 | Serialized Next.js-to-worker initialization payloads and pregame mode normalization.      |
| `game-types.ts`                | Public game state, action, event, prompt, and transport types consumed by app and worker. |
| `target-filter.ts`             | Runtime-neutral target-filter shape, key list, and predicate core with adapter callbacks. |
| `validators/client-message.ts` | Zod schemas for WebSocket client messages and game actions.                               |

## Boundary rules

- Shared modules may depend on TypeScript, runtime-neutral language features,
  other shared modules, and runtime-neutral packages such as Zod. They must not
  import Next.js, Prisma, Node-only APIs, Cloudflare APIs, `src/`, or `workers/`.
- The app imports this directory through `@shared/*` (configured in the root
  `tsconfig.json`). The worker uses explicit relative `.js` imports so its own
  TypeScript build resolves the same source files.
- Use `src/types/` for types shared only inside the Next.js application.
- Use `workers/game/src/types.ts` and adjacent worker modules for engine-only or
  runtime-narrowed types, such as validated effect schemas and executable prompt
  continuation state. Worker types may refine shared wire shapes; they do not
  replace the serialized contract.
- Put shared-module tests under `src/__tests__/` and name them `*.test.ts` or
  `*.test.tsx`. The root `vitest.config.ts` only discovers
  `src/**/*.test.ts(x)`, so a colocated test such as `shared/foo.test.ts` would
  silently never run.
- Put cross-runtime validation here. Keep API-only request/response validators in
  `src/lib/validators/`.

## Compile-time schema contract (OPT-410)

`shared/validators/client-message.ts` pairs every `GameAction` variant with a
Zod schema. Its erased `ActionSchemaAssertions` prove that each inferred schema
is exactly the corresponding union member, and `GameActionSchemaAssertions`
proves the assertion keys exhaust `GameAction["type"]`. Adding or changing an
action therefore requires updating both the type union and schema in the same
change; TypeScript fails if they drift.

The worker performs the runtime parse in `workers/game/src/util/validate.ts`.
Initialization and worker-owned narrowing are documented at their source in
`shared/game-init.ts` and `workers/game/src/types.ts`.
