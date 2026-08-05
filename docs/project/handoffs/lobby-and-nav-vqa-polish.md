---
linear-project: Lobby & Nav VQA Polish
linear-project-url: https://linear.app/optcg-sim/project/lobby-and-nav-vqa-polish-f71a9708ee4a
last-updated: 2026-08-04
---

# Lobby & Nav VQA Polish — Handoff Doc

Visual QA follow-ups aligning lobby, navigation, deck, and friends surfaces with the approved design direction.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → priority → risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-581 | Global nav: item order, active-tab styling, avatar identity | — | — | Done | — | Foundation for remaining nav polish. |
| 2 | OPT-582 | Lobby header: mode-toggle contrast, layout density, heading content | — | — | Done | — | Reclaims the vertical space used by seat work. |
| 3 | OPT-596 | Lobby fits the viewport as a fixed frame — no page scrolling (≥1280×800) | — | — | Done | — | Governs the lobby height budget. |
| 4 | OPT-607 | Navbar dropdowns are trapped inside the nav's overflow container — menu clips and the navbar scrolls | — | OPT-581 | Done | — | Clipping fix precedes dropdown alignment. |
| 5 | OPT-584 | Guest / open seat: content clipping + redundant invite affordances | — | OPT-582, OPT-596 | Done | [#480](https://github.com/corycunanan/optcg-sim/pull/480) | Verified with Computer Use and friends rail open. |
| 6 | OPT-608 | Normalize /decks page width to max-w-7xl to match the navbar and other routes | — | OPT-607 | Backlog | — | Ready; contained route-alignment sweep. |
| 7 | OPT-609 | Navbar dropdowns left-align to the nav edge instead of sitting under their trigger | — | OPT-607 | Backlog | — | Requires real-browser geometry verification. |
| 8 | OPT-583 | Host seat card: presence dot, header stacking, deck selector | — | OPT-596 | Backlog | — | Shared filled-seat redesign. |
| 9 | OPT-586 | Friends panel: presence dots, section naming, request actions | — | OPT-529 | In Review | [#481](https://github.com/corycunanan/optcg-sim/pull/481) | Re-scoped after PR #453; retained notification-center ownership. |
| 10 | OPT-585 | Footer bar: disabled Start Match affordance, Match settings, spectator defaults | — | OPT-595 | Backlog | — | Blocked until OPT-595 lands. |
| 11 | OPT-588 | Coverage: compare the remaining six mockup preview states against live | — | OPT-581–OPT-586 | Backlog | — | Final manual VQA sweep; requires two accounts. |

**Next up:** OPT-608.

---

## Handoffs

### OPT-584 → OPT-608
**From:** session on 2026-08-04 · **Commit:** `65811f4` · **PR:** #480

- **Primer:** The empty guest seat now has a dashed identity header and a single gold circular invite trigger while retaining the existing popover and expiry lifecycle.
- **Read first:** `src/app/decks/page.tsx`, `src/components/ui/page-header.tsx`, `src/components/nav/navbar.tsx`
- **Gotchas / do NOT touch:** Keep the navbar's `max-w-7xl` cap; OPT-607 settled that decision.
- **Unresolved:** OPT-585 remains blocked on OPT-595; the local OPT-584 screenshot is intentionally gitignored under `.artifacts/`.
- **Why this matters for OPT-608:** OPT-608 is independent of the seat implementation and is the next ready medium-priority alignment ticket; verify shared `PageHeader` consumers before changing the primitive.

### OPT-586 → OPT-585
**From:** session on 2026-08-04 · **Commit:** `eb4d653` · **PR:** #481

- **Primer:** The friends surface is now an explicitly fixed right rail below the navbar, with the duplicate account footer removed; OPT-529's notification-center split and richer presence rows remain intact.
- **Read first:** `src/components/lobbies/lobby-room-shell.tsx`, `src/components/lobbies/pregame-settings.tsx`, `src/components/social/social-shell.tsx`
- **Gotchas / do NOT touch:** Do not restore friend-request actions to the sidebar; the navbar notification center remains their sole action surface.
- **Unresolved:** The unrelated OPT-566 spectator watch-through exceeded its 15-second timeout both in the full suite and alone; focused social/layout tests pass.
- **Pointer:** PR #481 / commit `eb4d653`.
