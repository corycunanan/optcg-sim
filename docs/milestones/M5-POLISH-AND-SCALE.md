# M5 — UI Overhaul & Design System

> shadcn component library, motion.dev animations, new visual direction, and page redesigns. Transform the simulator into a polished, immersive gaming product.

---

## Scope

M5 runs in parallel with playtesting and game engine bug fixes. It overhauls the UI from a functional tool with loose styling into a cohesive, animated, premium gaming experience. The milestone replaces the hand-built component library with shadcn/ui, deeply integrates motion.dev for interactive feel, and redesigns all major pages under a unified design system.

### Deliverables

- [ ] Design brief — new visual direction, token values, typography, motion language
- [ ] shadcn/ui component library replacing all hand-built Radix wrappers
- [ ] motion.dev animation system with shared presets and utilities
- [ ] Redesigned pages: Navbar, Home, Login, Onboarding, Deck List, Deck Builder, Lobbies
- [ ] Game board motion integration (card play, attacks, DON!! attach, life damage, modals)
- [ ] Updated design documentation (`.impeccable.md`, `CLAUDE.md`, design system docs)

---

## Architecture (M5-Specific)

M5 doesn't introduce new services — it transforms the client layer.

```
┌────────────────────────────────────────────────────────────────────┐
│  Design System Foundation                                          │
│                                                                    │
│  Design Brief (Phase 0)                                            │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Riftbound reference analysis                                  │ │
│  │ New palette, typography, motion language                      │ │
│  │ Token mapping: current values → new values                    │ │
│  │ Updated .impeccable.md + CLAUDE.md                            │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Component Library (Phase 1-2)                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ shadcn/ui init + token application                            │ │
│  │ Replace: Button, Dialog, Input, Badge, Tabs, Toast, Tooltip   │ │
│  │ Add: Card, DropdownMenu, Select, Sheet, Skeleton, Avatar, ... │ │
│  │ motion.dev utility module (presets, springs, easing)           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Page Redesigns (Phase 3)                                          │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Navbar → Home → Login/Onboarding → Deck List → Builder → Lobby│ │
│  │ New components + design tokens + motion throughout             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Animation Layer (Phase 4-5)                                       │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Page transitions, micro-interactions, scroll animations       │ │
│  │ Game board: card play, attack, DON!!, life, phase transitions │ │
│  │ Performance validated at 60fps                                │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 0: Design Brief

**Goal**: Produce a comprehensive design brief that locks in all visual decisions before code changes begin. This happens in a dedicated conversation.

**Inputs:**
- Riftbound (riftbound.leagueoflegends.com) HTML/CSS sources provided by user
- Current design tokens in `src/app/globals.css`
- Current brand direction in `.impeccable.md`

**Outputs:**
1. `docs/design/RIFTBOUND-REFERENCE.md` — extracted design patterns (layout, spacing, animation timings, component patterns)
2. Design brief deliverable defining:
   - Color palette and token values (what to keep, what to change, what to adopt)
   - Typography system (display font, body font, type scale)
   - Motion language and timing standards
   - Component visual patterns
   - Token mapping: current tokens → new values
3. Updated `.impeccable.md` and `CLAUDE.md` Design Context section

### Phase 1: Foundation — Tooling & Tokens

**Goal**: Install tools, apply token values from the design brief. App renders in new palette with zero component changes.

| Task | Files |
|------|-------|
| Install `motion` (motion.dev) | `package.json` |
| Install shadcn/ui | creates `components.json` |
| Apply new design tokens from brief | `src/app/globals.css` |
| Add shadcn CSS variable aliases alongside existing tokens | `src/app/globals.css` |
| Update font configuration per brief | `src/app/layout.tsx` |
| Verify all pages render correctly with new tokens | visual QA |

**Key insight**: The existing token architecture is solid — components reference semantic names (`bg-surface-1`, `text-content-primary`), not literal colors. Swapping token values transforms the entire app without touching component files.

### Phase 2: shadcn Component Library

**Goal**: Replace all 7 hand-built UI components with shadcn equivalents, add new components needed for redesigns.

**Replace existing** (`src/components/ui/`):

| Current | shadcn Replacement | Notes |
|---------|-------------------|-------|
| `button.tsx` | shadcn Button | Preserve variant names (primary/secondary/ghost/destructive) |
| `dialog.tsx` | shadcn Dialog | Preserve custom `size` prop, add `DialogBody` extension |
| `input.tsx` | shadcn Input | Preserve `error` prop |
| `badge.tsx` | shadcn Badge | Add TCG card color variants |
| `tabs.tsx` | shadcn Tabs | Direct replacement |
| `toast.tsx` | shadcn Sonner | Different API — update all toast call sites |
| `tooltip.tsx` | shadcn Tooltip | Direct replacement |

**Add new components:**
- Card, DropdownMenu, Select, Separator, Avatar, Sheet, Skeleton, Command

**Motion utilities** (parallel with component work):
- New `src/lib/motion.ts` — animation presets, transition defaults, spring presets, `useReducedMotion` wrapper
- Values derived from the design brief's motion language

### Phase 3: Page Redesigns

Pages redesigned in priority order. Each gets new shadcn components, design tokens, and motion treatment.

| Priority | Page | File(s) | Impact |
|----------|------|---------|--------|
| 3A | Navbar | `src/components/nav/navbar.tsx` | Highest — visible on every page |
| 3B | Home/Landing | `src/app/page.tsx` | First impression — emotional impact |
| 3C | Login + Onboarding | `src/app/(auth)/login/page.tsx`, `onboarding/page.tsx` | Auth flow polish |
| 3D | Deck List | `src/app/decks/page.tsx` | Collection browsing |
| 3E | Deck Builder | `src/components/deck-builder/deck-builder-shell.tsx` + children | Highest effort — most user time |
| 3F | Lobbies | `src/components/lobbies/lobbies-shell.tsx` | Play enablement |

All redesigns include mobile/responsive treatment (3 breakpoints: <640px, 640-1024px, >1024px).

### Phase 4: Motion Deep Integration

**Goal**: Layer animation across all non-game surfaces.

| Task | Scope |
|------|-------|
| Page transitions | `AnimatePresence` in layout wrapper, fade+slide between routes |
| Micro-interactions | Button press, card hover, toast entrance, dialog/tooltip animation, dropdown cascade |
| Scroll animations | Element reveal on scroll, parallax where appropriate |
| Loading states | Skeleton shimmer, staggered grid skeleton, smooth skeleton→content transition |

### Phase 5: Game Board Motion & Polish

**Goal**: Bring motion.dev to the game board without breaking drag-drop or performance.

| Task | Files |
|------|-------|
| Card play animation (hand → field) | `hand-layer.tsx`, `field-card.tsx` |
| Attack animation | `field-card.tsx` |
| DON!! attach animation | `don-zone.tsx` |
| Life damage feedback | `life-zone.tsx` |
| Phase/turn transitions | `mid-zone.tsx` |
| Modal animations | All 6 game modals |
| Performance validation (60fps) | Profile on mid-range hardware |
| `useReducedMotion` fallbacks | All animated components |

---

## Sequencing

```
Phase 0 (Design Brief)  ████                    ← separate conversation
Phase 1 (Foundation)          ████████
Phase 2 (Components)                  ████████
Phase 3 (Redesigns)                           ████████████████
Phase 4 (Motion)                                      ████████████
Phase 5 (Game Board)                                            ████████████

Playtesting/Bug fixes    ████████████████████████████████████████████████████████
```

Phases 0→1→2→3 are strictly sequential. Within Phase 3, pages can be parallelized after the navbar (3A) is done. Phase 4 overlaps with late Phase 3. Phase 5 is last — most complex and most sensitive to regressions.

---

## Acceptance Criteria

- [ ] Design brief reviewed and approved before implementation begins
- [ ] All existing pages render with new tokens — no broken styles, no console errors
- [ ] All existing functionality works with shadcn components — no import errors
- [ ] Each redesigned page matches design brief, responsive at mobile/tablet/desktop
- [ ] Animations at 60fps, `prefers-reduced-motion` respected, no layout shifts
- [ ] Game board drag-drop works flawlessly with motion.dev, no frame drops
- [ ] Full user flow (home → login → deck builder → lobby → game) feels cohesive and polished
- [ ] WCAG AA accessibility maintained (4.5:1 contrast, focus visible, 44px touch targets)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| shadcn init conflicts with Tailwind v4 | Blocks foundation | shadcn v2+ supports Tailwind v4 natively via `@theme inline` — same mechanism project uses |
| Replacing UI components breaks existing pages | Regressions | Keep API surface identical where possible; replace one component at a time; test all usages |
| motion.dev performance on game board | Frame drops | Profile early; use GPU-accelerated transforms only; `useReducedMotion` for accessibility |
| Design brief iteration takes longer than expected | Delays all phases | Brief is a dedicated focused conversation; keep scope to tokens + typography + motion language |
| Scope creep with animation polish | Never ships | Ship functional redesign (Phases 1-3) first, layer motion (4-5) incrementally |

---

## Dependencies

- M0–M4 complete (full game simulator with automated effects)
- Riftbound HTML/CSS reference sources (provided by user)
- Playtesting feedback informing UX priorities

---

## Relationship to Other Milestones

| Milestone | Relationship |
|-----------|-------------|
| M2.5 (Design System) | M5 supersedes — replaces token system and component library |
| M4/M4.5 (Effect Engine) | Game board motion (Phase 5) builds on stable M4 engine |
| M6 (Scale & Features) | Old M5 content — LLM parsing, spectator, replay, full card DB |
| M7 (Effect Showcase) | Old M6 content — interactive effect testing harness |

---

_Last updated: 2026-03-30_
