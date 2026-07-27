# API route map

`src/app/api/` currently has 14 top-level domains and 43 `route.ts` files.
Routes use Next.js App Router named method exports; the table includes every
exported endpoint, including the temporary deprecated deck `PUT` alias.

| Domain        | Endpoints                                                                                                                                                                              | Responsibility                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Auth          | `GET, POST /api/auth/[...nextauth]`; `POST /api/auth/register`                                                                                                                         | NextAuth handlers and credentials registration.                                                                                |
| Cards         | `GET, POST /api/cards`; `GET, PATCH /api/cards/[id]`                                                                                                                                   | Public search/detail reads and admin-only card writes.                                                                         |
| Cron          | `GET /api/cron/lobby-retention`                                                                                                                                                        | `CRON_SECRET`-authenticated lobby retention job and dry run.                                                                   |
| Decks         | `GET, POST /api/decks`; `GET, PATCH, PUT, DELETE /api/decks/[id]`; `POST /api/decks/import`                                                                                            | Owned deck CRUD and deck-list import. `PUT` delegates to `PATCH` for pre-deploy clients and is marked deprecated in the route. |
| Friends       | `GET /api/friends`; `DELETE /api/friends/[userId]`; `GET, POST /api/friends/requests`; `PUT /api/friends/requests/[id]`                                                                | Friend list/removal and request lifecycle.                                                                                     |
| Game          | `GET, POST /api/game/[id]`; `GET /api/game/active`; `POST /api/game/result`; `GET /api/game/token`                                                                                     | Participant status/fallback actions, active-game lookup, worker result callback, and game WebSocket tokens.                    |
| Lobbies       | `POST /api/lobbies`; `POST /api/lobbies/join`; `GET, PATCH, DELETE /api/lobbies/[id]`; `POST /api/lobbies/[id]/invite`; `POST /api/lobbies/[id]/leave`; `POST /api/lobbies/[id]/start` | Lobby creation, membership, settings, invites, close/leave, and start transitions.                                             |
| Lobby invites | `GET /api/lobby-invites/pending`; `POST /api/lobby-invites/[id]/accept`; `POST /api/lobby-invites/[id]/decline`                                                                        | Recipient invite inbox and decisions.                                                                                          |
| Messages      | `GET /api/messages/conversations`; `GET, POST /api/messages/[userId]`; `POST /api/messages/[userId]/read`; `PUT /api/messages/read`                                                    | Conversation summaries, thread history/send, and bulk or single-message read updates.                                          |
| Notifications | `GET, PUT /api/notifications`; `PUT /api/notifications/[id]`                                                                                                                          | Paginated notification inbox, read/dismiss actions, and friend-request decision proxying.                                      |
| Realtime      | `GET /api/realtime/friends-of/[userId]`; `POST /api/realtime/token`; `POST /api/realtime/users/[userId]/last-seen`                                                                     | Worker-authenticated friend/last-seen callbacks and session-authenticated user-channel tokens.                                 |
| Sets          | `GET /api/sets`                                                                                                                                                                        | Public card-set listing.                                                                                                       |
| User          | `POST /api/user/username`                                                                                                                                                              | Authenticated username setup/update.                                                                                           |
| Users         | `GET /api/users/presence`; `GET /api/users/search`                                                                                                                                     | Friend-filtered presence snapshot and authenticated user search.                                                               |

## Conventions

- Session and admin gates come from [`src/lib/api-response.ts`](../../lib/api-response.ts);
  worker callbacks use `Bearer GAME_WORKER_SECRET`, and the retention route uses
  `Bearer CRON_SECRET`. Consult the route itself for the authoritative gate.
- Request and response schemas live in [`src/lib/validators/`](../../lib/validators/).
  Cross-runtime client-message validation lives in `shared/validators/`.
- Rate limits are applied per handler, not automatically by the directory.
  [`src/lib/rate-limit.ts`](../../lib/rate-limit.ts) defines `authLimiter`,
  `socialLimiter`, `searchLimiter`, and `apiLimiter`, backed by Upstash Redis with
  an in-memory local fallback. Read that file and the handler's `.check(...)`
  call for the current window, limit, identifier, and whether a method is gated.
- Lobby writes use revisions and conditional transitions in several routes.
  Treat each route and the helpers in `src/lib/lobbies/` as the source of truth
  rather than copying concurrency details into documentation.

To add an endpoint, follow a neighboring route: validate at the boundary, use
`requireAuth`/`requireAdmin` where applicable, import `prisma` from `@/lib/db`,
and use `PATCH` for partial resource updates.
