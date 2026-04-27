---
linear-project: Responsive Game Board
linear-project-url: https://linear.app/optcg-sim/project/responsive-game-board-e42dfec537cc
last-updated: 2026-04-27 (OPT-308 + OPT-309 + OPT-313 in review; OPT-319 ready in parallel)
---

# Responsive Game Board — Handoff Doc

Make the game board fully responsive on desktop (1280×720+) by authoring it once at a fixed design resolution (1920×1080) and applying a uniform CSS `transform: scale()` to fit the viewport. Same pattern Hearthstone, Legends of Runeterra, TFT, and Master Duel use — translated from Unity's `CanvasScaler` to CSS/React. Full scope: [`docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md`](../RESPONSIVE-GAME-BOARD-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-308](https://linear.app/optcg-sim/issue/OPT-308) | Build `<ScaledBoard>` primitive: viewport measurement, transform-scale, initial-render handling | 3 | — | In Review | [#153](https://github.com/corycunanan/optcg-sim/pull/153) | Gate ticket for PR 1. Establishes `BoardScaleContext`. Initial render: opacity-0 until first measure, fade-in respects reduced-motion. Resize re-scaling always snaps. |
| 2 | [OPT-309](https://linear.app/optcg-sim/issue/OPT-309) | Build `<PortalRoot>` for tooltip/modal/popover targets outside scaled subtree | 1 | — | In Review | _(this PR)_ | Independent. Establishes the rule "always portal overlays" for the audit later. |
| 3 | [OPT-313](https://linear.app/optcg-sim/issue/OPT-313) | Audit zone CSS: remove responsive logic, port to design pixels at 1920×1080 | 5 | — | In Review | _(this PR)_ | Audit found zones already pixel-based; only structural change was portaling `card-animation-layer` to `#overlay-root`. BoardLayout's self-scaling deferred to OPT-314/315 (replaced by `<ScaledBoard>` wrapper). |
| 4 | [OPT-319](https://linear.app/optcg-sim/issue/OPT-319) | Verify card image source resolution ≥ 2x design size | 2 | — | Backlog | — | Fully independent. Run anytime. If sources are < 2x, file follow-up but don't block migration — slightly soft 4K cards is acceptable for v1. |
| 5 | [OPT-310](https://linear.app/optcg-sim/issue/OPT-310) | Build `useBoardScale()` hook | 1 | OPT-308 | Backlog | — | Reads from `BoardScaleContext` set up by `<ScaledBoard>`. Throws if used outside one. |
| 6 | [OPT-311](https://linear.app/optcg-sim/issue/OPT-311) | Build `useScaledDrag()` hook | 2 | OPT-310 | Backlog | — | Wraps motion.dev drag with scale-aware delta math. Unit tests at scale 1.0 / 0.5 / 2.0. |
| 7 | [OPT-312](https://linear.app/optcg-sim/issue/OPT-312) | Storybook entries for scaled-board primitives | 1 | OPT-308, OPT-309, OPT-310, OPT-311 | Backlog | — | Validates primitives in isolation before they're consumed by shells. |
| 8 | [OPT-316](https://linear.app/optcg-sim/issue/OPT-316) | Apply inside-board design system updates: text floor + focus ring proportional | 2 | OPT-313 | Backlog | — | Inside-board: `text-sm` (14px) labels, `text-base` (16px) body, `ring-3` focus. Chrome keeps `text-xs` (12px), `ring-2`. Updates BRANDING-GUIDELINES + CLAUDE.md. |
| 9 | [OPT-317](https://linear.app/optcg-sim/issue/OPT-317) | Portal audit: tooltips, modals, popovers must render outside scaled subtree | 2 | OPT-309 | Backlog | — | Most shadcn/Radix primitives portal by default; audit catches custom overlays + any `position: fixed` direct usage. |
| 10 | [OPT-314](https://linear.app/optcg-sim/issue/OPT-314) | Build `<SandboxShell>` consuming scaled-board primitives | 2 | OPT-308, OPT-309, OPT-313 | Backlog | — | Hosts sandbox-only chrome (scenario picker, playback controls, debug overlays). Shell contract: state/dispatch only into `<Board>`. |
| 11 | [OPT-315](https://linear.app/optcg-sim/issue/OPT-315) | Build `<LiveGameShell>` consuming scaled-board primitives | 3 | OPT-308, OPT-309, OPT-313 | Backlog | — | Hosts live-only chrome (chat sidebar, opponent info, connection status). Same shell contract. |
| 12 | [OPT-318](https://linear.app/optcg-sim/issue/OPT-318) | Migrate hand-to-board (and other) drag interactions to `useScaledDrag` | 3 | OPT-311, OPT-314, OPT-315 | Backlog | — | Manual QA at 1280×720, 1920×1080, 2560×1440 to confirm pointer tracking. |
| 13 | [OPT-320](https://linear.app/optcg-sim/issue/OPT-320) | Min-viewport gate UI: "use a larger screen" below 1280×720 | 1 | OPT-314, OPT-315 | Backlog | — | Game routes only (live + sandbox). Re-evaluates on resize. |
| 14 | [OPT-321](https://linear.app/optcg-sim/issue/OPT-321) | ESLint rule: enforce shell-injects-state-only contract | 2 | OPT-314, OPT-315 | Backlog | — | Sequence after PR 2 so the new file structure exists. Otherwise the rule has nothing to constrain. |

**Total estimate:** 30 points.

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-313 — zone CSS audit (independent, ready now). OPT-319 (image asset verification) is also ready now and can run in parallel. OPT-310 / OPT-311 / OPT-312 unblock once PR #153 merges; OPT-317 (portal audit) is now unblocked by OPT-309 but the action plan defers it to PR 3 because it needs the migrated zone CSS (PR 2) to audit against.

### PR phasing

PRs map onto ticket batches:

| PR | Tickets | Why this batch |
|----|---------|----------------|
| PR 1 | OPT-308, OPT-309, OPT-310, OPT-311, OPT-312 | Primitives in isolation, used by nothing yet. Reviewable as a focused unit. |
| PR 2 | OPT-313, OPT-314, OPT-315, OPT-316 | Migration. Atomic — once responsive CSS is gone, both shells must be ready. Touches every zone file. |
| PR 3 | OPT-317 | Portal audit, independent. |
| PR 4 | OPT-318 | Drag refactor, depends on PR 1 + PR 2. |
| PR 5 | OPT-319 | Card asset verification, fully independent. |
| PR 6 | OPT-320, OPT-321 | Gate UI + ESLint rule, depends on shells existing. |

PRs 3, 4, 5, 6 can land in any order after their dependencies clear. PR 5 (asset verification) can land first chronologically since it's the most independent.

### Pre-merge gate

The open M5d motion PR merges to main **before** OPT-308 begins. PR 2's CSS audit (OPT-313) explicitly touches M5d-modified files; most motion code (transform-based) survives the migration intact, but viewport-relative units and `position: fixed` need rework. Re-test M5d animations in sandbox after OPT-313 lands as part of its acceptance criteria.

### Deferred / tech debt

- **Visual regression test** for board parity between `<SandboxShell>` and `<LiveGameShell>` (Layer 3b in the alignment plan). Deferred — revisit after the ESLint rule (OPT-321) has been in production for a while; if drift is still happening despite the lint, build the visual test.

---

## Handoffs

Append new entries at the bottom. Each entry is written *by* the agent who just finished a ticket, *for* the agent who picks up the next ticket.

<!--
Copy this block when writing a new handoff:

### OPT-XXX → OPT-YYY
**From:** session on YYYY-MM-DD · **Commit:** `<short-sha>` · **PR:** #NN

- **Primer:** <1 sentence — what changed at the system level>
- **Read first:** `path/to/file.ts`, `path/to/other.ts`
- **Gotchas / do NOT touch:** <what to leave alone and why, OR "none">
- **Unresolved:** <follow-ups, open questions, deferred work, tracking IDs — OR "none">
- **Why this matters for OPT-YYY:** <1–2 sentences tying the above to the next ticket's surface>

-->

### OPT-308 → OPT-309
**From:** session on 2026-04-27 · **Commit:** `0beeff4` · **PR:** [#153](https://github.com/corycunanan/optcg-sim/pull/153)

- **Primer:** `<ScaledBoard>` primitive landed in `src/components/game/scaled-board/` with internal `BoardScaleContext`. Pure `computeBoardScale()` is unit-tested. Barrel exposes `ScaledBoard` + `ScaledBoardProps` only — context is intentionally not exported (the consumer hook ships in OPT-310).
- **Read first:** `src/components/game/scaled-board/scaled-board.tsx` (so OPT-309's `<PortalRoot>` mirrors the file/style conventions); `docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md` §Architecture / §"What scales vs what doesn't".
- **Gotchas / do NOT touch:** Don't widen the `scaled-board/index.ts` barrel — `BoardScaleContext` must stay private to the folder; OPT-310 will import it from inside. `<PortalRoot>` must mount **outside** any future `<ScaledBoard>` ancestor (the whole point: `position: fixed` does not escape a transformed parent — see scope doc Risks §High).
- **Unresolved:** No Storybook entries yet (OPT-312); manual verification of fade-in / snap-on-resize / equal letterboxing is deferred to OPT-312's Storybook, not done in PR #153. No consumers of `<ScaledBoard>` yet — first consumer lands with OPT-314/315 shells.
- **Why this matters for OPT-309:** OPT-309 is independent of `<ScaledBoard>` (deps: none) but is the *paired* primitive — `<PortalRoot>` is the only correct way to render overlays once the board sits inside `<ScaledBoard>`. The two together are PR 1's reviewable unit alongside OPT-310/311/312.

### OPT-309 → OPT-313
**From:** session on 2026-04-27 · **Commit:** `cad5aac` · **PR:** _(opened from this branch)_

- **Primer:** `<PortalRoot>` + SSR-safe `getPortalContainer()` helper landed in `src/components/game/scaled-board/portal-root.tsx`. Render-only `<div id={id}>` (default `id="overlay-root"`). Folder gained a `README.md` documenting the portal rule for downstream OPT-317. Barrel now exports `PortalRoot`, `PortalRootProps`, and `getPortalContainer`; `BoardScaleContext` still intentionally private.
- **Read first:** `docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md` §"What scales vs what doesn't" (the table is the migration spec); the M5d motion files in `src/components/game/zones/` (transform-based motion survives, but `vh`/`vw`/`%`/`clamp`/`position: fixed` need rework — see scope doc Risks §Medium).
- **Gotchas / do NOT touch:** OPT-313 is the migration heavyweight, not a primitive change — do **not** edit `src/components/game/scaled-board/`; `<PortalRoot>` and `<ScaledBoard>` are stable. M5d motion code is in scope to *re-test*, not to rewrite. Only Tailwind utilities backed by tokens (per `CLAUDE.md` styling rules) — no inline `oklch`/hex/`text-[Xpx]`/`p-2.5` etc.
- **Unresolved:** Manual verification of `<PortalRoot>` (does Radix `Portal container={getPortalContainer()}` actually escape a transformed parent at runtime?) is deferred to OPT-312's Storybook + OPT-317's portal audit — neither component nor helper has runtime tests in PR 1. No shells consume `<PortalRoot>` yet — first consumer is OPT-314/315.
- **Why this matters for OPT-313:** OPT-313 doesn't import `<PortalRoot>` directly, but its audit must replace any `position: fixed` *inside* zone CSS with portaled overlays (per the scope doc table). Knowing the portal target exists and is keyed by `#overlay-root` is the contract OPT-313 codes against — when it removes a `position: fixed`, the replacement is "portal to `#overlay-root`," not "use `position: absolute`."

### OPT-313 → OPT-316
**From:** session on 2026-04-27 · **Commit:** `40d3004` · **PR:** _(opened from this branch)_

- **Primer:** Audit confirmed every zone (`src/components/game/board-layout/*.tsx`), card, and on-board UI sibling already authors at 1920×1080 design pixels — no `vh`/`vw`/`%`/`clamp()`, no Tailwind responsive prefixes, no off-scale spacing inside the would-be scaled subtree. The only structural change was `card-animation-layer.tsx`, which now portals to `#overlay-root` via `getPortalContainer()` when present (in-tree fallback preserves today's behavior until shells mount `<PortalRoot>`).
- **Read first:** `docs/design/BRANDING-GUIDELINES.md` §typography for the project-wide type scale; `src/components/game/board-layout/` zones to see current `text-xs` (12px) usage that OPT-316 will lift to the inside-board floor (`text-sm` 14px / `text-base` 16px).
- **Gotchas / do NOT touch:** `BoardLayout`'s self-scaling math (`computeBoardScaling` + `transform: scale(${boardScale})` wrappers in `board-layout.tsx`) is deliberately left in place — that's the hand-rolled `<ScaledBoard>` scaffold that OPT-314/315 will replace when they wrap `<Board>` in the real primitive. Don't strip it from inside OPT-316. Per scope doc, focus rings inside the board → `ring-3`, chrome stays at `ring-2` (focus rings outside the board are not in scope). Text inputs always live in chrome, never inside the scaled board.
- **Unresolved:** (1) Card flight animations were not visually verified in a live game during this session (no easy way to spin a 2-player session) — type-check + lint + 199 tests all pass. The conditional portal preserves current behavior by construction. (2) `FlyingCard` sizes its in-flight card at NATIVE pixel sizes (`BOARD_CARD_W` etc.) while zone rects come from `getBoundingClientRect()` (post-transform viewport space) — pre-existing mismatch at non-1.0 scales, deferred to OPT-311/318 territory. (3) `<PortalRoot>` mount order matters: shells should render `<PortalRoot />` **before** `<ScaledBoard>` in JSX so `#overlay-root` exists when scaled descendants first render — the README example shows the reverse order; OPT-314/315 should pick the order that lands the portal target first (or accept the conditional fallback).
- **Why this matters for OPT-316:** OPT-316 will touch every zone file to lift labels to `text-sm` and bump focus rings to `ring-3` — it walks the same surface OPT-313 just audited. The audit's "already pixel-based, no responsive logic to strip" finding means OPT-316 is purely a typography/focus-ring sweep, not a layout one. If OPT-316 spots any new `vh`/`vw`/`%`/`clamp()`/`position: fixed` that wasn't there at commit `40d3004`, that's a regression — file a follow-up rather than absorbing it into OPT-316's scope.
