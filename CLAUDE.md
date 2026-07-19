# OPTCG Simulator — CLAUDE.md

## Project

One Piece Trading Card Game simulator — deck builder, card database, and game engine. Built with Next.js 16, React 19, Tailwind CSS v4, Prisma 6, TypeScript.

## Codebase Map

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `src/app/` | Next.js App Router — pages and API routes |
| `src/app/(auth)/` | Auth pages: `/login`, `/onboarding` |
| `src/app/admin/` | Admin UI — card browser, editor, set management |
| `src/app/api/` | REST API routes — 36 route files; inventory with `find src/app/api -name route.ts` |
| `src/app/decks/` | Deck builder pages |
| `src/app/game/` | Game board pages (dynamic `[id]` route, scaffold, error boundary) |
| `src/app/lobbies/` | Lobby browser, creation, and dynamic lobby room pages |
| `src/components/ui/` | Base UI primitives (Button, Input, Dialog, Badge, Tabs, Toast, Tooltip) |
| `src/components/admin/` | Admin-specific card browser and edit components |
| `src/components/deck-builder/` | Deck builder components (search, list, header, stats, validation) |
| `src/components/game/` | Game board components (board layout, zones, modals, hand, effects) |
| `src/components/social/` | Social components (sidebar, chat widget, user avatar) |
| `src/components/lobbies/` | Lobby room, invite, and lobby-action UI |
| `src/components/nav/` | Navigation (Navbar) |
| `src/hooks/` | Custom React hooks — game sessions, WebSockets, lobby reliability, async operations, and animations |
| `src/lib/` | Shared utilities and business logic |
| `src/lib/deck-builder/` | Deck builder state machine and validation engine |
| `src/lib/game/` | Game-related utilities (card data helpers, keyword definitions) |
| `src/lib/validators/` | Zod validation schemas for API and realtime boundaries |
| `src/types/` | Global TypeScript types (supplements Prisma-generated types) |
| `pipeline/` | Card data ETL: vegapull JSON → transform → PostgreSQL + R2 |
| `workers/game/` | Cloudflare Worker + Durable Objects — game engine, effect resolver, and authored card schema sets |
| `workers/images/` | Cloudflare Worker — CDN image serving with CORS |
| `prisma/` | Database schema (`schema.prisma`) and migrations |
| `docs/` | Project documentation (see `docs/README.md` for full index) |
| `docs/architecture/` | System design — architecture, tech stack, data pipeline |
| `docs/milestones/` | Phase docs M0–M7, including M5.1–M5.5 sub-milestones |
| `docs/game-engine/` | Game engine design — effect schema spec, rules-to-engine map, encoding guide |
| `docs/design/` | UI/UX design — branding guidelines, audits, critiques, game board layout |
| `docs/project/` | Project management — PRD, planning, workflows, learnings |
| `docs/rules/` | Official OPTCG Comprehensive Rules v1.2.0 |
| `docs/cards/` | Canonical card effect text organized by set |
| `docs/research/` | Technical investigations and evaluations |

### Key Files

| File | Purpose |
|------|---------|
| `src/auth.ts` | NextAuth v5 config — Google OAuth + email/password, JWT/session callbacks |
| `src/lib/db.ts` | Prisma client singleton — import `{ prisma }` from here |
| `src/lib/utils.ts` | `cn()` class merger + card ID helpers (`cardIdToOriginSet`, `stripVariantSuffix`) |
| `src/proxy.ts` | Next.js proxy: auth guards for `/admin` and `/onboarding`, plus public `/cards` and `/sets` page rate limiting |
| `src/lib/deck-builder/state.ts` | Deck builder state types, `deckBuilderReducer`, `createInitialState` |
| `src/lib/deck-builder/validation.ts` | OPTCG deck validation rules engine (`validateDeck`) |
| `src/types/index.ts` | Shared types: `CardColor`, `CardRarity`, `CardSearchParams`, pipeline types |
| `src/app/globals.css` | Design tokens (CSS custom properties) and global styles — source of truth for all tokens |
| `prisma/schema.prisma` | Full database schema — source of truth for all data shapes |
| `workers/game/src/engine/pipeline.ts` | 7-step action pipeline — entry point for every game state mutation |
| `workers/game/src/engine/effect-resolver/resolver.ts` | Core effect resolver — 50+ action handlers for all game mechanics |
| `workers/game/src/engine/triggers.ts` | Auto effect trigger registration, matching, and ordering |
| `workers/game/src/engine/schema-registry.ts` | Loads the generated authored card schema registry at runtime |
| `workers/game/src/GameSession.ts` | Durable Object — WebSocket session management, game lifecycle |
| `workers/game/wrangler.toml` | Cloudflare Worker config for game server |

### Where Things Go

**New API endpoint** → `src/app/api/<domain>/route.ts`
Choose the real guard (`requireAuth`, `requireAdmin`, signed worker secret, cron secret, or intentionally public), validate with Zod, use the response helpers from `src/lib/api-response.ts`, and add a colocated route test. DB: `prisma` from `@/lib/db`. Follow a current route in the same domain.

**New page** → `src/app/<route>/page.tsx`
Server component by default. Use `"use client"` only when interactivity is required at the page level — prefer interactive child components inside a server shell.

**New component** — group by feature domain:
- Generic/reusable UI → `src/components/ui/`
- Admin UI → `src/components/admin/`
- Deck builder UI → `src/components/deck-builder/`
- Social/friends/lobby UI → `src/components/social/`
- Navigation → `src/components/nav/`

**New shared utility** → `src/lib/utils.ts` (pure functions) or `src/lib/<feature>/` (feature-scoped logic)

**New type** → `src/types/index.ts` if app-wide; co-locate with the feature if narrowly scoped

**New custom hook** → `src/hooks/`

### Import Conventions

```ts
import { cn } from "@/lib/utils";           // class merging utility
import { prisma } from "@/lib/db";          // database client
import { auth } from "@/auth";              // session/auth
import { Button } from "@/components/ui";  // UI primitives (barrel export)
// Feature types:
import type { CardColor } from "@/types";
import type { DeckBuilderState } from "@/lib/deck-builder/state";
```

## API Response Contracts

`src/lib/api-response.ts` is the default contract for app API routes:

- `apiSuccess(data, status?, headers?)` returns `{ data: T }` (normally `200`; creates normally use `201`).
- `apiList(data, pagination?, headers?)` returns `{ data: T[] }` with optional `{ pagination }`.
- `apiAction()` returns `{ success: true }` for actions without a resource body.
- `apiError(message, status, extra?)` returns `{ error: string, ...extra }`. Validation helpers in `src/lib/validators/helpers.ts` return this error shape with `400`.
- Preserve route-specific contracts where an external protocol requires them: Auth.js handlers, cron metrics, realtime worker callbacks, and `204` no-content routes are intentional exceptions. Read the target route and its tests before normalizing it.

Use semantic HTTP status codes already represented by neighboring routes: `400` invalid input, `401` missing authentication, `403` insufficient privilege, `404` missing resource, `409` state/uniqueness conflict, `410` expired invite, `422` understood but unplayable state, `429` rate limited, `500` unexpected server failure, `501` recognized but unimplemented mode, and `502`/`503` unavailable dependencies or configuration. Mutating and read-heavy routes call the appropriate limiter from `src/lib/rate-limit.ts`; a limited request returns `429` before performing the mutation. Keep the identifier namespace used by the route and cover the limited path in its route test.

Lobby room snapshots use the wire type in `src/lib/lobbies/state.ts`. `buildLobbyRoomState()` maps the database's monotonic `Lobby.revision` to response/event `version`; every write that changes observable lobby state must atomically increment `revision`, including compensating writes. Conflict responses may include current state through `apiError(..., 409, extra)`; follow the concurrency patterns and tests in `src/app/api/lobbies/`.

Message sends accept the optional UUID `idempotencyKey` defined by `SendMessageSchema` in `src/lib/validators/messages.ts`. `POST /api/messages/[userId]` checks for an existing message before rate limiting, relies on the database unique constraint to close concurrent races, returns the original row with `200` on replay, and returns a new row with `201`. Keep side-effect fanout single-shot.

Client code should use `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete` from `src/lib/api-client.ts`. Supply a Zod schema whenever response data is consumed; without one the return type is intentionally `unknown`.

## Error Handling Conventions

- API routes log unexpected errors with a stable, route-scoped prefix, then return a non-sensitive `apiError(..., 500)`. Translate expected Prisma errors and domain conflicts to their established status instead of leaking database details. `src/app/api/messages/[userId]/route.ts` and the lobby routes are current references for race handling.
- `parseBody()` plus `isErrorResponse()` in `src/lib/validators/helpers.ts` is the standard JSON/Zod boundary. Do not trust request or response JSON via a type assertion.
- Client API failures are `ApiError` instances carrying `message` and `status`. Branch on `instanceof ApiError` only where status changes recovery (for example `404`, `409`, `410`, `429`, or auth `503`); otherwise show its message with a concise fallback for unknown failures.
- User-triggered feedback uses Sonner (`toast.success`, `toast.error`, `toast.info`). Keep one toast per outcome and avoid toasting expected background polling/reconciliation failures. See `src/components/lobbies/lobby-room-shell.tsx` and `src/components/social/chat-widget.tsx`.
- Missing auth-secret degradation is deliberate. `src/lib/auth-configuration.ts` emits throttled `[AUTH_CONFIG]` errors by site. Session reads degrade to signed out, while auth mutations/register return the dedicated `503` body. Do not replace this with generic exception logging or expose secret values.

## Auth & Authorization

Auth.js configuration lives in `src/auth.ts`; `auth()` is the server session primitive and sessions include `user.id`, `user.username`, and `user.isAdmin`. API routes normally use `requireAuth()` or `requireAdmin()` from `src/lib/api-response.ts`, returning their `Response` immediately. `requireAuth()` yields `401`; `requireAdmin()` distinguishes `401` from `403`. Public card/set reads, Auth.js, registration, the authenticated worker callbacks, and cron routes use their own guards—verify the target route rather than assuming all `/api/*` routes share one policy.

`src/proxy.ts` matches `/admin/:path*`, `/onboarding`, `/cards`, and `/sets`. It redirects signed-out users only for the protected admin/onboarding pages; `/cards` and `/sets` take the public-card rate-limit branch before rendering. API authorization remains route-local and is not supplied by the proxy.

`hasAuthSecret()` accepts `AUTH_SECRET` with `NEXTAUTH_SECRET` as fallback. When neither exists, `auth()` with no arguments resolves to `null`, the session endpoint returns a signed-out session, proxy-protected pages behave signed out, and auth mutations return `503` with `{ message: "Authentication is temporarily unavailable." }` through `authUnavailableResponse()`. Preserve the site-specific `[AUTH_CONFIG]` degradation log contract in `src/auth.ts`, `src/proxy.ts`, and `src/lib/auth-configuration.ts`.

## Naming Conventions

- Files and directories are predominantly lowercase kebab-case: `deck-builder-shell.tsx`, `use-game-session.ts`, and `effect-resolver/`. Next.js reserved files remain `page.tsx`, `layout.tsx`, `route.ts`, and dynamic segments use brackets. Preserve established legacy names such as `src/components/home/CardColumns.tsx`; do not rename them incidentally.
- React components, classes, exported types/interfaces, and Zod schemas use PascalCase. Hooks begin with `use`. Functions and local variables use camelCase. True module constants use UPPER_SNAKE_CASE; component-adjacent timing/config constants may follow the existing descriptive uppercase form.
- Tests are `*.test.ts` or `*.test.tsx`. App tests are colocated with their source; worker engine tests live in `workers/game/src/__tests__/`. Storybook stories use `*.stories.tsx` under `__stories__/` where that feature already uses stories.
- API directories describe plural resources in kebab-case and dynamic parameters in brackets. Route handlers export uppercase HTTP verbs.
- Prisma models/enums use PascalCase and fields use camelCase; database mappings in `prisma/schema.prisma` retain the established table/column mapping. Migration directories use timestamped snake-case descriptions, matching the existing history.
- Card effect schema files use lowercase set IDs (`op16.ts`, `st30.ts`); card IDs and engine discriminants use their canonical uppercase forms.

## Verification Commands

Run commands from the repository root unless noted:

```bash
npx tsc --noEmit
npm run lint
pnpm --dir workers/game type-check
node workers/game/src/engine/schemas/lint-schemas.sh
node workers/game/src/engine/schemas/check-doc-drift.sh
pnpm lint:design-system
pnpm db:check-migration-drift  # requires SHADOW_DATABASE_URL
pnpm verify
```

The schema lint scripts locate repository documentation and imports internally; invoke them from the repository root as shown. When passing `lint-schemas.sh` an optional target file, that argument is resolved from the current working directory, so use a repository-relative path at root (for example `workers/game/src/engine/schemas/op16.ts`). `pnpm schema:check` is the complete schema gate (generated registry, schema lint, docs drift, action inventory, and authored-schema tests). `pnpm verify` is the final CI-equivalent gate and includes app/worker type checks, schema checks, tests, coverage, bundle capacity, and production build.

## Design Context

### Users
One Piece Trading Card Game players — competitive and casual — who want to build decks, browse cards, and play games online. They're typically engaged fans who spend long sessions deckbuilding and testing. The context is focused, functional play: search a card, build a deck, jump into a game. They expect the tool to feel like a premium OPTCG product, not a generic gaming app or a spreadsheet.

### Brand Personality
**Adventurous. Warm. Confident.**

The OPTCG Simulator channels the spirit of One Piece — joyful, energetic, and alive. It should feel like the official OPTCG website but purpose-built for play: clean, welcoming, unmistakably One Piece. Card art is spectacular and deserves a focused, uncluttered navy stage.

Emotional goals: delight when browsing cards, focus when building decks, immersion during gameplay.

### References
- **[Official OPTCG Website](https://en.onepiece-cardgame.com/)** — deep navy structure, gold accents, generous whitespace, and card art as hero. This is the primary brand reference, adapted to a dark-only product surface.
- **[Riftbound (League of Legends TCG)](https://riftbound.leagueoflegends.com/)** — blade section architecture, ornamental CTA buttons, carousel with progress bar, responsive spacing variables, dramatic serif display typography, backdrop overlays. Key structural reference for layout and component patterns.
- **[MTG Arena](https://magic.wizards.com/en/mtgarena)** — spacing discipline, fluid typography, purposeful motion, CSS variable system.
- **[Branding Guidelines](docs/design/BRANDING-GUIDELINES.md)** — comprehensive design brief for M5 UI Overhaul. Defines all token values, typography, motion language, component patterns, and game board theming architecture. Source of truth for implementation.

### Aesthetic Direction
- **Visual tone:** Clean, warm, and confident on deep navy. Dark never means gloomy, cold, low-contrast, or gamer-neon.
- **Primary theme:** Dark-only. The main app uses a navy-900 page foundation with progressively lighter navy elevations; the game board remains a separate, darker themed context.
- **Color palette:**
  - Deep navy (`oklch(22% 0.04 245)`) — the page background and structural foundation, with lighter navy elevation steps for panels and controls
  - Warm white (`oklch(96% 0.008 75)`) — primary text, with warm secondary and tertiary steps for hierarchy
  - Warm gold (`oklch(78% 0.14 75)`) — primary interaction, visible focus, and premium/treasure moments
  - One Piece red (`oklch(74% 0.20 25)`) for emphasis, energy, and destructive actions only
  - Six TCG card colors (Red, Blue, Green, Purple, Black, Yellow) remain functional identifiers only
- **Typography:**
  - **Display/headings:** DM Serif Display (Google Fonts) — high-contrast display serif for page titles, section headers. Uppercase. Italic variant for featured callouts and pull-quotes.
  - **Body:** Geist Sans — all body text, labels, UI elements.
  - Strict type scale: 12/14/16/18/20/24/30/36/48px. No custom `text-[Xpx]` sizes in components. See `docs/design/BRANDING-GUIDELINES.md` for full scale.
- **Accessibility:** WCAG AA — 4.5:1 contrast for text, keyboard navigable, focus visible.
- **Card presentation:** Restrained elevated navy surfaces let art breathe. Single, clean hover state — no stacking of lift + shadow + blur.
- **Anti-references:** NOT gloomy, low-contrast, cold gray, or gamer-neon. NOT generic SaaS dashboard. NOT over-decorated with gradients and backdrop blurs.

### Styling Rules (enforced)

These rules exist to prevent "AI slop" — arbitrary decisions that look reasonable in isolation but break the system:

1. **No inline `style={{}}` for design properties** — all colors, borders, and backgrounds go through Tailwind utilities backed by CSS tokens
2. **No hardcoded oklch/hex values in component files** — define in `globals.css` tokens, reference by name
3. **No custom font sizes** — `text-[9px]`, `text-[10px]`, `text-[11px]` are banned. Use `text-xs` (12px) minimum
4. **Spacing scale only** — only Tailwind steps 1/2/3/4/5/6/8/10/12/16. No `p-2.5`, `px-3 py-1.5`, etc.
5. **Three border-radius values** — `rounded` (4px, badges), `rounded-md` (8px, inputs/buttons), `rounded-lg` (12px, panels/modals), `rounded-full` (pills). Nothing else.
6. **No JS style manipulation** — no `element.style.X =` or `onMouseOver` setting inline properties. Use CSS state (Tailwind `group-hover:`, `data-[state]:`)
7. **`cn()` for all conditional classes** — use clsx + tailwind-merge, never string concatenation
8. **Inside-board floor (scaled game board)** — anything rendered inside `<ScaledBoard>` / `BoardLayout`'s transformed subtree (zones, on-board cards, in-board CTAs, on-board overlays) lifts the floor: **`text-base` (16px)** for labels/counters/badges, **`text-lg` (18px)** for body text, **`ring-4`** for focus indicators. Chrome (navbar, modals, tooltips, popovers, side panels — anything portaled or outside the scaled wrapper) keeps `text-xs`/`ring-2`. Background: at the 1280×640 floor viewport the board scales to ~0.59, which collapses chrome's defaults below the legibility floor. Full table in `docs/design/BRANDING-GUIDELINES.md` §13.

**Enforcement and exceptions:** `scripts/lint-design-system.mjs` scans all `.tsx` files for arbitrary font sizes, raw colors, off-scale spacing, and disallowed inline design properties. It permits runtime geometry/transform properties and narrow file/property or CSS-variable allowlists; it also treats `src/components/ui/` as the vendored shadcn spacing exemption. The script is the source of truth—do not broaden an allowlist merely to silence a violation.

### Design Principles

1. **Card art is the hero** — Restrained navy surfaces amplify artwork. UI chrome minimizes and recedes.
2. **One Piece warmth** — Warm whites, gold, red, and whitespace keep the dark foundation energetic and inviting without decorative gradients.
3. **Tight system, loose expression** — Every spacing, type, and color decision traces back to a token. Within that system, layouts can be expressive.
4. **Motion earns its place** — Transitions communicate state. One clear animation per interaction, not stacked effects.
5. **Progressive clarity** — Simple at rest, detailed on interaction. Dense information (stats, filters) is scannable through hierarchy, not visual noise.
