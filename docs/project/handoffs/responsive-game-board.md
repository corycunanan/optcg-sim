---
linear-project: Responsive Game Board
linear-project-url: https://linear.app/optcg-sim/project/responsive-game-board-e42dfec537cc
last-updated: 2026-04-27 (OPT-308 in review; OPT-309 / OPT-313 / OPT-319 ready in parallel)
---

# Responsive Game Board — Handoff Doc

Make the game board fully responsive on desktop (1280×720+) by authoring it once at a fixed design resolution (1920×1080) and applying a uniform CSS `transform: scale()` to fit the viewport. Same pattern Hearthstone, Legends of Runeterra, TFT, and Master Duel use — translated from Unity's `CanvasScaler` to CSS/React. Full scope: [`docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md`](../RESPONSIVE-GAME-BOARD-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-308](https://linear.app/optcg-sim/issue/OPT-308) | Build `<ScaledBoard>` primitive: viewport measurement, transform-scale, initial-render handling | 3 | — | In Review | [#153](https://github.com/corycunanan/optcg-sim/pull/153) | Gate ticket for PR 1. Establishes `BoardScaleContext`. Initial render: opacity-0 until first measure, fade-in respects reduced-motion. Resize re-scaling always snaps. |
| 2 | [OPT-309](https://linear.app/optcg-sim/issue/OPT-309) | Build `<PortalRoot>` for tooltip/modal/popover targets outside scaled subtree | 1 | — | Backlog | — | Independent. Can run in parallel with OPT-308. Establishes the rule "always portal overlays" for the audit later. |
| 3 | [OPT-313](https://linear.app/optcg-sim/issue/OPT-313) | Audit zone CSS: remove responsive logic, port to design pixels at 1920×1080 | 5 | — | Backlog | — | The migration heavyweight. Independent of primitives — can start in parallel. **Will touch M5d-modified files** (transform-based motion survives intact; only `vh`/`vw`/`%`/`clamp`/`position: fixed` need rework). |
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

**Next up:** OPT-309 — `<PortalRoot>` (independent, ready now). OPT-313 (zone CSS audit) and OPT-319 (image asset verification) are also ready now and can run in parallel with OPT-309. OPT-310 / OPT-311 / OPT-312 unblock once PR #153 merges.

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
