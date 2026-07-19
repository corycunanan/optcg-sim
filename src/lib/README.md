# Library organization

`src/lib/` holds non-visual application logic used by Next.js pages, route
handlers, hooks, and components. Keep a one-file cross-cutting utility at the
root; create or use a feature folder when several files share a domain.

## Current map

| Location                                                       | Owns                                                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-client.ts`, `api-response.ts`                             | Client request/envelope handling and server auth/response helpers.                                                                                                            |
| `db.ts`                                                        | The application Prisma singleton.                                                                                                                                             |
| `motion.ts`, `relative-time.ts`, `search-query.ts`, `utils.ts` | Small cross-feature constants and pure utilities.                                                                                                                             |
| `rate-limit.ts`                                                | Shared API limiter configuration and local-development fallback.                                                                                                              |
| `lobbies.ts`                                                   | Small lobby-code generation/normalization helpers; persistence and room state belong in `lobbies/`.                                                                           |
| `cards/`                                                       | Card browser query construction, selects, holo metadata, and public-card rate-limit adapter.                                                                                  |
| `deck-builder/`                                                | Client deck state/reducer, parsing, customization options, and legality validation. See [`deck-builder/README.md`](./deck-builder/README.md).                                 |
| `decks/`                                                       | Server-side saved-deck selection, copy-limit checks, and playable-deck loading.                                                                                               |
| `game/`                                                        | Next.js-side game helpers: card-data conversion, client legality, targeting, finalization, tokens, and presentation metadata. The authoritative engine is in `workers/game/`. |
| `game-worker/`                                                 | Authenticated HTTP client for calls from Next.js to the game worker.                                                                                                          |
| `lobbies/`                                                     | Lobby persistence/state assembly, invite cancellation, and concurrency helpers.                                                                                               |
| `realtime/`                                                    | Realtime event serialization, client dispatch, and server-to-worker fan-out.                                                                                                  |
| `sandbox/`                                                     | Deterministic sandbox state/event adapters and scenario manifests.                                                                                                            |
| `validators/`                                                  | Zod schemas for Next.js API inputs and response payloads. Cross-runtime WebSocket contracts belong in `shared/validators/`.                                                   |

## Placement rule

- Use the root for a small application-wide primitive with no natural feature
  owner.
- Use `deck-builder/`, `cards/`, `decks/`, `game/`, `lobbies/`, or `realtime/`
  when the logic speaks that domain's vocabulary, even if only one caller uses
  it today.
- Use `shared/` instead when the same runtime-neutral contract must compile in
  both the Next.js app and another runtime. See [`shared/README.md`](../../shared/README.md).
- Keep Cloudflare/Durable Object behavior and worker-narrowed runtime types in
  `workers/game/`; `src/lib/game/` is not the game engine.
- Put broadly shared app model types in `src/types/`; co-locate narrow types with
  their implementation.

Import the Prisma client from `@/lib/db`; do not instantiate another client.
