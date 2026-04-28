---
linear-project: Responsive Game Board
linear-project-url: https://linear.app/optcg-sim/project/responsive-game-board-e42dfec537cc
last-updated: 2026-04-27 (OPT-308 + OPT-309 + OPT-313 + OPT-316 + OPT-317 + OPT-319 merged; OPT-310 in review; OPT-314 / OPT-315 ready now in parallel)
---

# Responsive Game Board — Handoff Doc

Make the game board fully responsive on desktop (1280×720+) by authoring it once at a fixed design resolution (1920×1080) and applying a uniform CSS `transform: scale()` to fit the viewport. Same pattern Hearthstone, Legends of Runeterra, TFT, and Master Duel use — translated from Unity's `CanvasScaler` to CSS/React. Full scope: [`docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md`](../RESPONSIVE-GAME-BOARD-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-308](https://linear.app/optcg-sim/issue/OPT-308) | Build `<ScaledBoard>` primitive: viewport measurement, transform-scale, initial-render handling | 3 | — | Done | [#153](https://github.com/corycunanan/optcg-sim/pull/153) | Gate ticket for PR 1. Establishes `BoardScaleContext`. Initial render: opacity-0 until first measure, fade-in respects reduced-motion. Resize re-scaling always snaps. |
| 2 | [OPT-309](https://linear.app/optcg-sim/issue/OPT-309) | Build `<PortalRoot>` for tooltip/modal/popover targets outside scaled subtree | 1 | — | Done | [#154](https://github.com/corycunanan/optcg-sim/pull/154) | Independent. Establishes the rule "always portal overlays" for the audit later. |
| 3 | [OPT-313](https://linear.app/optcg-sim/issue/OPT-313) | Audit zone CSS: remove responsive logic, port to design pixels at 1920×1080 | 5 | — | Done | [#155](https://github.com/corycunanan/optcg-sim/pull/155) | Audit found zones already pixel-based; only structural change was portaling `card-animation-layer` to `#overlay-root`. BoardLayout's self-scaling deferred to OPT-314/315 (replaced by `<ScaledBoard>` wrapper). |
| 4 | [OPT-319](https://linear.app/optcg-sim/issue/OPT-319) | Verify card image source resolution ≥ 2x design size | 2 | — | Done | [#158](https://github.com/corycunanan/optcg-sim/pull/158) | Confirmed 600×838 PNG source ≈ 5× design size — 2.5× headroom over the 2× crispness floor. No re-ingest needed. Headroom math + sample list in `docs/architecture/DATA-PIPELINE.md` §"Resolution Headroom (OPT-319 verification, 2026-04-27)". |
| 5 | [OPT-310](https://linear.app/optcg-sim/issue/OPT-310) | Build `useBoardScale()` hook | 1 | OPT-308 | In Review | _(this PR)_ | Reads from `BoardScaleContext` set up by `<ScaledBoard>`. Throws if used outside one. Barrel exports the hook + `BoardScaleContextValue` type only — context object stays private. |
| 6 | [OPT-311](https://linear.app/optcg-sim/issue/OPT-311) | Build `useScaledDrag()` hook | 2 | OPT-310 | Backlog | — | Wraps motion.dev drag with scale-aware delta math. Unit tests at scale 1.0 / 0.5 / 2.0. |
| 7 | [OPT-312](https://linear.app/optcg-sim/issue/OPT-312) | Storybook entries for scaled-board primitives | 1 | OPT-308, OPT-309, OPT-310, OPT-311 | Backlog | — | Validates primitives in isolation before they're consumed by shells. |
| 8 | [OPT-316](https://linear.app/optcg-sim/issue/OPT-316) | Apply inside-board design system updates: text floor + focus ring proportional | 2 | OPT-313 | Done | [#156](https://github.com/corycunanan/optcg-sim/pull/156) | Inside-board: `text-sm` (14px) labels, `text-base` (16px) body, `ring-3` focus. Chrome keeps `text-xs` (12px), `ring-2`. `GameButton` primitive stayed at chrome defaults; in-board call sites override via shared `IN_BOARD_BTN` const. |
| 9 | [OPT-317](https://linear.app/optcg-sim/issue/OPT-317) | Portal audit: tooltips, modals, popovers must render outside scaled subtree | 2 | OPT-309 | Done | [#157](https://github.com/corycunanan/optcg-sim/pull/157) | All 8 Radix `*Portal` wrappers (alert-dialog, dialog, dropdown-menu, hover-card, popover, select, sheet, tooltip) and `arrange-top-cards-modal`'s `createPortal` now default `container` to `getPortalContainer() ?? undefined` (or `?? document.body`). No runtime change today (no shell mounts `<PortalRoot>` yet); flips on automatically when OPT-314/315 land. |
| 10 | [OPT-314](https://linear.app/optcg-sim/issue/OPT-314) | Build `<SandboxShell>` consuming scaled-board primitives | 2 | OPT-308, OPT-309, OPT-313 | Backlog | — | Hosts sandbox-only chrome (scenario picker, playback controls, debug overlays). Shell contract: state/dispatch only into `<Board>`. |
| 11 | [OPT-315](https://linear.app/optcg-sim/issue/OPT-315) | Build `<LiveGameShell>` consuming scaled-board primitives | 3 | OPT-308, OPT-309, OPT-313 | Backlog | — | Hosts live-only chrome (chat sidebar, opponent info, connection status). Same shell contract. |
| 12 | [OPT-318](https://linear.app/optcg-sim/issue/OPT-318) | Migrate hand-to-board (and other) drag interactions to `useScaledDrag` | 3 | OPT-311, OPT-314, OPT-315 | Backlog | — | Manual QA at 1280×720, 1920×1080, 2560×1440 to confirm pointer tracking. |
| 13 | [OPT-320](https://linear.app/optcg-sim/issue/OPT-320) | Min-viewport gate UI: "use a larger screen" below 1280×720 | 1 | OPT-314, OPT-315 | Backlog | — | Game routes only (live + sandbox). Re-evaluates on resize. |
| 14 | [OPT-321](https://linear.app/optcg-sim/issue/OPT-321) | ESLint rule: enforce shell-injects-state-only contract | 2 | OPT-314, OPT-315 | Backlog | — | Sequence after PR 2 so the new file structure exists. Otherwise the rule has nothing to constrain. |

**Total estimate:** 30 points.

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-311 — `useScaledDrag()` hook (blocked on this PR merging, then ready). OPT-314 / OPT-315 (the two shells consuming the primitives) are ready now in parallel — both depend on OPT-308/OPT-309/OPT-313, all merged. OPT-312's Storybook entries unblock once OPT-310/311 both land.

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

### OPT-316 → OPT-317
**From:** session on 2026-04-27 · **Commit:** `87149d5` · **PR:** [#156](https://github.com/corycunanan/optcg-sim/pull/156)

- **Primer:** Inside-board floor lifted: labels/counters/badges → `text-sm`, body → `text-base`, focus rings → `ring-3`. Chrome (navbar, all `*-modal.tsx`, Radix-portaled menus/tooltips, `event-log` `position: fixed`, `game-error-boundary`, `game-board-visual` chrome states) explicitly stayed at the `text-xs`/`ring-2` floor. The `GameButton` primitive is shared between in-board (mid-zone, redistribute overlay) and chrome (modals) consumers, so primitive defaults stayed at chrome values; in-board call sites apply a local `IN_BOARD_BTN = "text-sm focus-visible:ring-3"` constant. Documented as CLAUDE.md styling rule 8 and a new §13 sub-section + table in BRANDING-GUIDELINES.md.
- **Read first:** `docs/design/BRANDING-GUIDELINES.md` §13 "Inside-Board Floor Overrides" for the full chrome/in-board boundary table — OPT-317's portal audit will use the same boundary rules. `src/components/game/scaled-board/README.md` §"The portal rule" + the file `src/components/game/scaled-board/portal-root.tsx`. Then sweep `src/components/game/` for any custom `position: fixed` overlays or `createPortal(..., document.body)` calls that bypass `<PortalRoot>`.
- **Gotchas / do NOT touch:** Most overlays in this repo already portal correctly — `Dialog`/`DropdownMenu`/`Tooltip`/`Popover` all flow through Radix's `Portal` primitive which targets `document.body` by default. The audit's job is to (a) catch any *non*-Radix overlays that use `position: fixed` directly, and (b) migrate the Radix portals to use `container={getPortalContainer()}` so they land in the explicit `#overlay-root` instead of `document.body`. Do NOT widen this audit into the `card-animation-layer.tsx` work OPT-313 already did — that one is settled. `<PortalRoot>` mount order still matters: shells must mount `<PortalRoot />` **before** `<ScaledBoard>` (see OPT-313 handoff item 3) so `#overlay-root` exists when the first scaled overlay renders.
- **Unresolved:** (1) No live two-player session was run this session — type-check + lint clean, 199/199 tests pass, but visual smoke at 1280×720 / 1920×1080 / 2560×1440 is deferred to OPT-312 (Storybook entries) and the OPT-318 manual QA pass. (2) The `GameButton` primitive split (board vs chrome) is intentionally avoided here to keep the PR scoped — if mid-zone/redistribute grow more in-board buttons, consider promoting `IN_BOARD_BTN` into a `gameButtonVariants` `inBoard` boolean. Not a blocker for OPT-317. (3) `event-log` lives at `position: fixed` *outside* any scaled subtree today and stayed at chrome typography — when `<LiveGameShell>` (OPT-315) consumes it, confirm the chrome classification is still right (it might move into the shell layout flow).
- **Why this matters for OPT-317:** OPT-317's portal audit needs a clear boundary between "inside the scaled subtree" and "chrome" to know what to portal vs. leave alone. OPT-316 just made that boundary explicit in BRANDING-GUIDELINES.md §13 — the audit can use that table directly as the spec for which overlays must land in `#overlay-root`. The `GameButton` chrome/in-board split note above is also relevant: if OPT-317 finds custom popovers/tooltips that are *triggered from* in-board surfaces but rendered as chrome (the typical Radix pattern), the trigger styling lifts to in-board floor while the portaled content stays at chrome floor.

### OPT-317 → OPT-319
**From:** session on 2026-04-27 · **Commit:** `ce27eb9` · **PR:** [#157](https://github.com/corycunanan/optcg-sim/pull/157)

- **Primer:** All 8 Radix `*Portal` wrappers in `src/components/ui/` (alert-dialog, dialog, dropdown-menu, hover-card, popover, select, sheet, tooltip) and the one custom `createPortal` in `arrange-top-cards-modal.tsx` now default their portal container to `getPortalContainer() ?? undefined` (Radix sites) or `getPortalContainer() ?? document.body` (custom). Behavior is unchanged today — `getPortalContainer()` returns `null` until a shell mounts `<PortalRoot>` (OPT-314/315), so all overlays still land in `document.body`. The wiring flips automatically once the shells exist. `card-animation-layer.tsx` is unchanged (already portaled in OPT-313). The `scaled-board/README.md` now contains the audited overlay table, the chrome boundary list, and the corrected `<PortalRoot>`-before-`<ScaledBoard>` mount order.
- **Read first:** None for OPT-319 specifically — image asset verification is its own domain. If you do touch overlay code in another ticket: `src/components/game/scaled-board/README.md` §"Audited overlays" is the spec, and any new overlay primitive (Toast variants, custom popovers, etc.) should default `container` the same way.
- **Gotchas / do NOT touch:** (1) Don't drop the `?? undefined` fallback on Radix Portals — without it, when `getPortalContainer()` returns `null` (no shell mounted), the Portal renders nothing because Radix's `container || mounted && body` short-circuits on a falsy explicit `container` only if it's explicitly omitted, not if it's explicitly `null`. Verified against `@radix-ui/react-portal@1.1.9`. The `?? undefined` keeps Radix's body fallback alive. (2) Chrome `position: fixed` sites (Sonner Toaster in `app/layout.tsx`, `app/game/layout.tsx`, `event-log.tsx`, `game-board-visual.tsx` opponent banner + dev panel, `sidebar.tsx`) deliberately stayed un-portaled — they sit at the page-layout level, not inside any scaled subtree. Future shell authors must keep them outside `<ScaledBoard>` or move them through the portal. (3) UI primitives now import `getPortalContainer` from `@/components/game/scaled-board` — that's a small cross-layer dependency (UI → game). If non-game contexts (admin, deck builder) ever need a different portal target, lift the helper to `src/lib/portal.ts` then.
- **Unresolved:** (1) Acceptance smoke tests ("open each overlay type while inside `<ScaledBoard>` at non-1.0 scale, confirm fixed real-pixel size") cannot be exercised yet because no shell mounts `<ScaledBoard>` + `<PortalRoot>` together at runtime. Coverage lands with OPT-312 (Storybook entries for primitives) and the OPT-318 manual QA pass. Type-check + lint clean, 199/199 tests pass. (2) `command.tsx` (cmdk wrapper around `Dialog`) inherits the new portal default automatically — not separately tested.
- **Why this matters for OPT-319:** It doesn't, directly. OPT-319 verifies card image source resolution (≥ 2× design size) and is fully independent of overlay/portal work. Pick OPT-319 because it's the next ready-now Backlog ticket in the action plan (PR 5, fully independent). If sources are < 2×, file a follow-up but don't block migration — the project scope says slightly soft 4K cards is acceptable for v1.

### OPT-319 → OPT-310
**From:** session on 2026-04-27 · **Commit:** `7ec62bc` · **PR:** [#158](https://github.com/corycunanan/optcg-sim/pull/158)

- **Primer:** Verified card image source resolution. R2 serves 600×838 PNG (sampled 9 base cards across ST/OP/EB/P sets — uniform format and dimensions). Variant images sampled directly from the official source (`en.onepiece-cardgame.com/images/cardlist/card/<id>_p1.png`) are also 600×838 PNG; the migration script copies bytes verbatim, so variants in R2 (when migrated) will match. Source is ~5× the design size (120×168 board / 126×177 hand at the 1920×1080 floor) and ~2.5× the 2× crispness floor. No re-ingest required. Headroom math + sample list documented in `docs/architecture/DATA-PIPELINE.md` §"Resolution Headroom (OPT-319 verification, 2026-04-27)".
- **Read first:** None for OPT-310 specifically — `useBoardScale()` is a small hook on top of `BoardScaleContext` from OPT-308. Re-read `src/components/game/scaled-board/scaled-board.tsx` for the context shape and `src/components/game/scaled-board/index.ts` for the current barrel before touching it.
- **Gotchas / do NOT touch:** (1) `BoardScaleContext` is intentionally private to `src/components/game/scaled-board/` — `useBoardScale()` must import it from inside the folder, not re-export it. The OPT-308 handoff explicitly closed the barrel against widening. (2) Hook must throw a clear error if used outside `<ScaledBoard>` (per the action plan note); don't return a default `1.0` fallback — silent fallbacks make the scaled-vs-chrome boundary invisible. (3) Don't expand scope to also build `useScaledDrag` (OPT-311) — sequential per the plan, separate test surfaces.
- **Unresolved:** (1) Variant images appear to not be migrated to R2 yet — `https://optcg-images.corymcunanan.workers.dev/variants/<id>_p1.webp` returned 404 for every variant key tried (3 IDs, multiple key shapes). Base cards under `cards/*` all return 200. Doesn't affect OPT-319's verdict (source dimensions are confirmed identical to base cards), but worth running the migration script for variants before any UI surface starts rendering parallel art. Not filed as a Linear follow-up — surfaces the gap here in case the user wants to triage. (2) `pipeline/migrate-images.ts` uploads PNG bytes with `ContentType: "image/webp"` and a `.webp` key suffix — content-type mismatches the actual format. Browsers content-sniff so this works in practice, but it's a real correctness issue (e.g. ETag-aware image processors will be confused). Out of scope for OPT-319; mention in case anyone touches that script.
- **Why this matters for OPT-310:** It doesn't — image asset verification and the consumer hook are orthogonal. Pick OPT-310 because it's the next critical-path Backlog ticket in the action plan (Order 5), and `<ScaledBoard>` (its dependency) merged in PR #153. OPT-314 (`<SandboxShell>`) and OPT-315 (`<LiveGameShell>`) are also ready-now in parallel — both depend on OPT-308/OPT-309/OPT-313, all merged. If you'd rather start the shell work first, swap order; the action plan's order is a guideline, not a hard sequence past dependencies.

### OPT-310 → OPT-311
**From:** session on 2026-04-27 · **Commit:** `b1f7e42` · **PR:** _(opened from this branch)_

- **Primer:** `useBoardScale()` landed in `src/components/game/scaled-board/use-board-scale.ts` — a 12-line `useContext` reader that returns `{ scale, designWidth, designHeight }` and throws "useBoardScale must be used within a `<ScaledBoard>`" when no provider is mounted (matches the `useSidebar` / `useZonePosition` convention). Barrel now exports `useBoardScale` + the `BoardScaleContextValue` type; `BoardScaleContext` itself is still private to the folder.
- **Read first:** `src/components/game/scaled-board/use-board-scale.ts` (the consumer contract OPT-311 codes against — small enough to read in 30 seconds); `src/components/game/scaled-board/scaled-board.tsx` lines 51–54 (the `scale ?? 1` fallback during the pre-measurement frame — see gotcha 2 below); `docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md` §"Drag math" for the multiply-by-`1/scale` derivation.
- **Gotchas / do NOT touch:** (1) Consume the hook via the `@/components/game/scaled-board` barrel, not by importing `BoardScaleContext` directly — the context object stays private and `useBoardScale()` is the only public surface. (2) The context value is **always defined** when a `<ScaledBoard>` is mounted, including the brief frame before the first `ResizeObserver` measurement resolves: during that frame `scale === 1` (literal fallback in `scaled-board.tsx`). Children render at `opacity: 0` during this frame so a user can't pointer-down before measurement, so for `useScaledDrag` the fallback is harmless — but don't write OPT-311 logic that *assumes* the scale value reflects a real measurement. (3) Don't expand the barrel further — exporting the context object would let consumers bypass the throw-on-missing-provider contract. (4) No tests added for the hook; the codebase convention is pure-function-only tests (no `@testing-library/react` dep, no `renderHook` usage anywhere). OPT-311's pure delta math should follow the same convention — test the math, not the React wiring.
- **Unresolved:** None for OPT-311 specifically. The two carry-over notes from OPT-319's handoff (R2 variant migration gap; `migrate-images.ts` content-type mismatch) are still open and unrelated to OPT-310 / OPT-311.
- **Why this matters for OPT-311:** OPT-311's whole job is to wrap motion.dev's drag with scale-aware delta math, and `useBoardScale()` is the sole API for reading the current scale inside the scaled subtree. The hook ships with a clear throw, so OPT-311 doesn't need to defensively type-narrow or check for `null` — call it from any component that lives inside `<ScaledBoard>` and use `1 / scale` to convert viewport-pixel pointer deltas into design-pixel motion. The unit tests at scale 1.0 / 0.5 / 2.0 (per the action plan) can mock the hook by wrapping the test render in a `<BoardScaleContext.Provider>` — but since the context is private, OPT-311 will need to either (a) extend the barrel to export a test-only provider, (b) wrap the component under test in a real `<ScaledBoard>` with a sized `getBoundingClientRect`, or (c) factor the pure delta math into a separate helper and test that directly (recommended — matches the `computeBoardScale` pattern from OPT-308).
