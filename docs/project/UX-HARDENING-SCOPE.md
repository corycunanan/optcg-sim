---
status: In progress
created: 2026-07-06
owner: Cory Cunanan
linear-project: UX Hardening
linear-project-url: https://linear.app/optcg-sim/project/ux-hardening-10f1af9ff4a5
handoff-doc: docs/project/handoffs/ux-hardening.md
---

# UX Hardening - Scope & Plan

> This doc is the project source of truth for the UX Hardening Linear project. Ticket-by-ticket execution notes live in the [handoff doc](./handoffs/ux-hardening.md).

---

## Summary

The 2026-07-02 UX audit found that the app's happy paths are polished, but failure paths are too quiet. This project makes dangerous actions explicit, makes failed async work visible, and adds loading/empty/error states where users currently have to infer what happened.

This is a wiring project, not an architecture rewrite. The AlertDialog, toast, Skeleton, route loading, and deck-builder dirty-state primitives already exist; the work is to apply them consistently across the highest-risk surfaces.

---

## Goals

- Confirm destructive actions before they fire: in-game Concede, deck Clear, Unfriend, Leave/Close Lobby.
- Show loud feedback for failed saves, loads, sends, searches, and social mutations.
- Prevent avoidable work loss in the deck builder.
- Separate loading, empty, and error states on core routes and social surfaces.
- Keep each PR scoped to one Linear ticket so CodeRabbit reviews can focus on a single behavior change.

## Non-goals

- Redesigning page layouts or the game board.
- Replacing the existing UI primitives.
- Introducing a new global error handling framework.
- Changing game rules, lobby matchmaking semantics, or deck legality rules beyond the targeted UX guards.

---

## Execution Plan

Tickets are ordered by user harm first, then blast radius. All tickets are currently independent, so later work can be reordered if review feedback or product priorities change.

| Order | Ticket                                                                                                                       | Title                                         | Priority | Status    | Primary Surfaces                                                                     | Notes                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------- | --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1     | [OPT-385](https://linear.app/optcg-sim/issue/OPT-385/confirm-in-game-concede-a-misclick-currently-loses-the-match-instantly) | Confirm in-game Concede                       | High     | In Review | `src/components/game/board-layout/nav-menu.tsx`                                      | PR #230: confirms before match loss dispatch.                                   |
| 2     | [OPT-386](https://linear.app/optcg-sim/issue/OPT-386/deck-builder-loud-failures-work-loss-guards)                            | Deck builder loud failures + work-loss guards | High     | Backlog   | `src/components/deck-builder/`, `src/lib/deck-builder/`                              | Broader surface; includes save/load/search errors, Clear confirm, dirty guards. |
| 3     | [OPT-387](https://linear.app/optcg-sim/issue/OPT-387/first-session-traps-onboarding-lands-in-admin-decks-may-not-scroll)     | First-session traps                           | High     | Backlog   | `src/app/(auth)/onboarding/`, `src/app/decks/`                                       | Small fixes, but runtime scroll verification matters.                           |
| 4     | [OPT-388](https://linear.app/optcg-sim/issue/OPT-388/silent-failure-sweep-social-sidebar-chat-and-route-loading-skeletons)   | Social failures + route skeletons             | Medium   | Backlog   | `src/components/social/`, `src/app/decks/`, `src/app/lobbies/`, `src/app/game/[id]/` | Apply toast/error-state convention and loading skeletons.                       |
| 5     | [OPT-391](https://linear.app/optcg-sim/issue/OPT-391/add-a-leave-lobby-action-for-guests-and-explicit-close-for-host)        | Leave Lobby / Close Lobby actions             | Medium   | Backlog   | `src/components/lobbies/lobby-room-shell.tsx`, `src/hooks/use-lobby-room.ts`         | Clarify seat release and host close semantics.                                  |

---

## Verification Standard

Each ticket PR should include:

- Focused code inspection for the touched surface.
- `pnpm verify` as the final gate unless the change is docs-only.
- Manual verification notes for UI behavior that TypeScript cannot prove, especially destructive action dialogs and route loading/scroll states.
- Linear moved to `In Review` and the PR linked before handing off.

---

## Design Rules

- Use existing UI primitives from `src/components/ui`.
- Use `toast.error` for recoverable failed async actions where the user should continue in context.
- Use AlertDialog for irreversible or destructive actions.
- Preserve the project's tokenized Tailwind styling rules: no inline design styles, no hardcoded colors, no custom text sizes, no off-scale spacing.
- Keep game-board modal chrome portaled outside scaled board internals.
