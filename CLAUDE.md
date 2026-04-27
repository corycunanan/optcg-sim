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
| `src/app/api/` | REST API routes — 24 endpoints across 8 domains |
| `src/app/decks/` | Deck builder pages |
| `src/app/game/` | Game board pages (dynamic `[id]` route, scaffold, error boundary) |
| `src/app/lobbies/` | Lobby browser and creation |
| `src/components/ui/` | Base UI primitives (Button, Input, Dialog, Badge, Tabs, Toast, Tooltip) — 29 files |
| `src/components/admin/` | Admin-specific components (card browser, filters, grid, edit form) — 9 files |
| `src/components/deck-builder/` | Deck builder components (search, list, header, stats, validation) — 16 files |
| `src/components/game/` | Game board components (board layout, zones, modals, hand, effects) — 30 files |
| `src/components/social/` | Social components (sidebar, chat widget, user avatar) — 5 files |
| `src/components/lobbies/` | Lobby UI components — 2 files |
| `src/components/nav/` | Navigation (Navbar) |
| `src/hooks/` | Custom React hooks — game session, WebSocket, animations, mobile detection (6 hooks) |
| `src/lib/` | Shared utilities and business logic |
| `src/lib/deck-builder/` | Deck builder state machine and validation engine |
| `src/lib/game/` | Game-related utilities (card data helpers, keyword definitions) |
| `src/lib/validators/` | Zod validation schemas for all API domains (9 files) |
| `src/types/` | Global TypeScript types (supplements Prisma-generated types) |
| `pipeline/` | Card data ETL: vegapull JSON → transform → PostgreSQL + R2 (8 stages) |
| `workers/game/` | Cloudflare Worker + Durable Object — game engine, effect resolver, 51 card schema sets |
| `workers/images/` | Cloudflare Worker — CDN image serving with CORS |
| `prisma/` | Database schema (`schema.prisma`) and migrations |
| `docs/` | Project documentation (see `docs/README.md` for full index) |
| `docs/architecture/` | System design — architecture, tech stack, data pipeline |
| `docs/milestones/` | Phase docs M0–M7, including M5.1–M5.5 sub-milestones |
| `docs/game-engine/` | Game engine design — effect schema spec, rules-to-engine map, encoding guide |
| `docs/design/` | UI/UX design — branding guidelines, audits, critiques, game board layout |
| `docs/project/` | Project management — PRD, planning, workflows, learnings |
| `docs/rules/` | Official OPTCG Comprehensive Rules v1.2.0 |
| `docs/cards/` | Card effect text for all 51 sets |
| `docs/research/` | Technical investigations and evaluations |

### Key Files

| File | Purpose |
|------|---------|
| `src/auth.ts` | NextAuth v5 config — Google OAuth + email/password, JWT/session callbacks |
| `src/lib/db.ts` | Prisma client singleton — import `{ prisma }` from here |
| `src/lib/utils.ts` | `cn()` class merger + card ID helpers (`cardIdToOriginSet`, `stripVariantSuffix`) |
| `src/lib/proxy.ts` | Route protection middleware logic (auth guard for `/admin`, `/onboarding`) |
| `src/lib/deck-builder/state.ts` | Deck builder state types, `deckBuilderReducer`, `createInitialState` |
| `src/lib/deck-builder/validation.ts` | OPTCG deck validation rules engine (`validateDeck`) |
| `src/types/index.ts` | Shared types: `CardColor`, `CardRarity`, `CardSearchParams`, pipeline types |
| `src/app/globals.css` | Design tokens (CSS custom properties) and global styles — source of truth for all tokens |
| `prisma/schema.prisma` | Full database schema — source of truth for all data shapes |
| `workers/game/src/engine/pipeline.ts` | 7-step action pipeline — entry point for every game state mutation |
| `workers/game/src/engine/effect-resolver/resolver.ts` | Core effect resolver — 50+ action handlers for all game mechanics |
| `workers/game/src/engine/triggers.ts` | Auto effect trigger registration, matching, and ordering |
| `workers/game/src/engine/schema-registry.ts` | Loads card effect schemas from 51 set files at runtime |
| `workers/game/src/GameSession.ts` | Durable Object — WebSocket session management, game lifecycle |
| `workers/game/wrangler.toml` | Cloudflare Worker config for game server |

### Where Things Go

**New API endpoint** → `src/app/api/<domain>/route.ts`
Auth: `const session = await auth()` from `@/auth`. DB: `prisma` from `@/lib/db`. Follow existing route files as pattern.

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

## Design Context

### Users
One Piece Trading Card Game players — competitive and casual — who want to build decks, browse cards, and play games online. They're typically engaged fans who spend long sessions deckbuilding and testing. The context is focused, functional play: search a card, build a deck, jump into a game. They expect the tool to feel like a premium OPTCG product, not a generic gaming app or a spreadsheet.

### Brand Personality
**Adventurous. Warm. Confident.**

The OPTCG Simulator channels the spirit of One Piece — joyful, energetic, and alive. It should feel like the official OPTCG website but purpose-built for play: clean, welcoming, unmistakably One Piece. Card art is spectacular and deserves a bright, uncluttered stage.

Emotional goals: delight when browsing cards, focus when building decks, immersion during gameplay.

### References
- **[Official OPTCG Website](https://en.onepiece-cardgame.com/)** — bright white surfaces, deep navy navigation, gold accents, generous whitespace, card art as hero. This is the primary reference.
- **[Riftbound (League of Legends TCG)](https://riftbound.leagueoflegends.com/)** — blade section architecture, ornamental CTA buttons, carousel with progress bar, responsive spacing variables, dramatic serif display typography, backdrop overlays. Key structural reference for layout and component patterns.
- **[MTG Arena](https://magic.wizards.com/en/mtgarena)** — spacing discipline, fluid typography, purposeful motion, CSS variable system.
- **[Branding Guidelines](docs/design/BRANDING-GUIDELINES.md)** — comprehensive design brief for M5 UI Overhaul. Defines all token values, typography, motion language, component patterns, and game board theming architecture. Source of truth for implementation.

### Aesthetic Direction
- **Visual tone:** Clean and bright, with purposeful dark moments for the game board. Not dark/moody/gamer — that's not what One Piece is.
- **Primary theme:** Light mode. Dark surfaces reserved for the game board where immersion matters most.
- **Color palette:**
  - Warm white (`oklch(98% 0.005 75)`) and off-white for surfaces
  - Deep navy (`oklch(22% 0.04 245)`) — **primary accent AND structure**: buttons, active states, navigation, highlights
  - Warm gold (`oklch(72% 0.14 75)`) — secondary accent for premium/treasure moments
  - One Piece red (`oklch(55% 0.20 25)`) for emphasis, energy, and destructive actions only
  - Six TCG card colors (Red, Blue, Green, Purple, Black, Yellow) remain functional identifiers only
- **Typography:**
  - **Display/headings:** DM Serif Display (Google Fonts) — high-contrast display serif for page titles, section headers. Uppercase. Italic variant for featured callouts and pull-quotes.
  - **Body:** Geist Sans — all body text, labels, UI elements.
  - Strict type scale: 12/14/16/18/20/24/30/36/48px. No custom `text-[Xpx]` sizes in components. See `docs/design/BRANDING-GUIDELINES.md` for full scale.
- **Accessibility:** WCAG AA — 4.5:1 contrast for text, keyboard navigable, focus visible.
- **Card presentation:** Warm white or light surfaces let art breathe. Single, clean hover state — no stacking of lift + shadow + blur.
- **Anti-references:** NOT dark/teal/moody. NOT gamer-neon. NOT generic SaaS dashboard. NOT over-decorated with gradients and backdrop blurs.

### Styling Rules (enforced)

These rules exist to prevent "AI slop" — arbitrary decisions that look reasonable in isolation but break the system:

1. **No inline `style={{}}` for design properties** — all colors, borders, and backgrounds go through Tailwind utilities backed by CSS tokens
2. **No hardcoded oklch/hex values in component files** — define in `globals.css` tokens, reference by name
3. **No custom font sizes** — `text-[9px]`, `text-[10px]`, `text-[11px]` are banned. Use `text-xs` (12px) minimum
4. **Spacing scale only** — only Tailwind steps 1/2/3/4/5/6/8/10/12/16. No `p-2.5`, `px-3 py-1.5`, etc.
5. **Three border-radius values** — `rounded` (4px, badges), `rounded-md` (8px, inputs/buttons), `rounded-lg` (12px, panels/modals), `rounded-full` (pills). Nothing else.
6. **No JS style manipulation** — no `element.style.X =` or `onMouseOver` setting inline properties. Use CSS state (Tailwind `group-hover:`, `data-[state]:`)
7. **`cn()` for all conditional classes** — use clsx + tailwind-merge, never string concatenation
8. **Inside-board floor (scaled game board)** — anything rendered inside `<ScaledBoard>` / `BoardLayout`'s transformed subtree (zones, on-board cards, in-board CTAs, on-board overlays) lifts the floor: **`text-sm` (14px)** for labels/counters/badges, **`text-base` (16px)** for body text, **`ring-3`** for focus indicators. Chrome (navbar, modals, tooltips, popovers, side panels — anything portaled or outside the scaled wrapper) keeps `text-xs`/`ring-2`. Background: at the 1280×720 floor viewport the board scales to ~0.67, which collapses chrome's defaults below the legibility floor. Full table in `docs/design/BRANDING-GUIDELINES.md` §13.

### Design Principles

1. **Card art is the hero** — Clean, bright surfaces amplify artwork. UI chrome minimizes and recedes.
2. **One Piece warmth** — Bright, energetic, inviting. Color and whitespace create warmth, not decoration or gradients.
3. **Tight system, loose expression** — Every spacing, type, and color decision traces back to a token. Within that system, layouts can be expressive.
4. **Motion earns its place** — Transitions communicate state. One clear animation per interaction, not stacked effects.
5. **Progressive clarity** — Simple at rest, detailed on interaction. Dense information (stats, filters) is scannable through hierarchy, not visual noise.
