---
linear-project: Persistent Party Lobby
linear-project-url: https://linear.app/optcg-sim/project/persistent-party-lobby-6cf7fc95b90c
last-updated: 2026-07-24
---

# Persistent Party Lobby — Handoff Doc

Users resolve to one persistent party, explicitly switch parties, return to that party after games, and lazily receive a personal lobby when no active membership remains.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket  | Title                                                                                    | Estimate | Depends on                         | Status      | PR                                                        | Notes                                                   |
| ----- | ------- | ---------------------------------------------------------------------------------------- | -------- | ---------------------------------- | ----------- | --------------------------------------------------------- | ------------------------------------------------------- |
| 1     | OPT-518 | Schema: multi-game lobbies + one-active-lobby-per-user invariant                         | —        | —                                  | Done        | —                                                         | Membership and historical-game foundation               |
| 2     | OPT-519 | /lobbies canonical resolver: active game → membership → lazy personal lobby              | —        | OPT-518                            | Done        | —                                                         | Canonical Play navigation and personal-lobby creation   |
| 3     | OPT-520 | Post-game return to party: finalize resets lobby to WAITING with readiness cleared       | —        | OPT-518, OPT-519                   | Done        | —                                                         | Restores the persistent party after a match             |
| 4     | OPT-522 | Join-by-code party switching with disband confirmation                                   | —        | OPT-519                            | Done        | [#403](https://github.com/corycunanan/optcg-sim/pull/403) | Transactional switch and host-disband semantics shipped |
| 5     | OPT-523 | Kick player: host removes guest from party                                               | —        | OPT-518, OPT-519                   | Done        | [#401](https://github.com/corycunanan/optcg-sim/pull/401) | PR merged; guest-removal capability is on main          |
| 6     | OPT-524 | Invite lifecycle: expiry countdown + cancel invite                                       | —        | OPT-519                            | Done        | [#402](https://github.com/corycunanan/optcg-sim/pull/402) | Invite lifecycle surface shipped                        |
| 7     | OPT-521 | Party room UI per redesign artifact (seats, deck panels, empty/invited/solitaire states) | —        | OPT-519, OPT-522, OPT-523, OPT-524 | In Progress | —                                                         | Parallel workstream owns `src/components/lobbies/**`    |
| 8     | OPT-567 | Real-database concurrency test harness for lobby transactional flows                     | —        | OPT-522, OPT-523, OPT-524          | In Review   | [#404](https://github.com/corycunanan/optcg-sim/pull/404) | Manual DEV database concurrency and rollback proof      |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-521 is in progress; its behavior dependencies are merged.

---

## Handoffs

Append new entries at the bottom. Each entry is written _by_ the agent who just finished a ticket, _for_ the agent who picks up the next ticket.

### OPT-522 → OPT-521

**From:** Codex session on 2026-07-24 · **Commit:** `287a5fb` · **PR:** [#403](https://github.com/corycunanan/optcg-sim/pull/403)

- **Primer:** Code joins and invite accepts now share one transactional switch path; hosted parties require explicit disband confirmation, while guests and empty personal lobbies switch silently.
- **Read first:** `src/lib/lobbies/join.ts`, `src/components/lobbies/join-party-dialog.tsx`, `src/components/lobbies/party-switch-confirmation.tsx`, `src/components/lobbies/lobby-room-shell.tsx`, and `src/components/lobbies/lobby-invite-toast.tsx`.
- **Gotchas / do NOT touch:** Preserve the exact disband language and the lobby-bound `confirmDisbandLobbyId` retry contract. OPT-523 owns the guest-seat kick menu/endpoint, and OPT-524 owns invite countdown/cancel UI; integrate their shipped surfaces instead of recreating them.
- **Unresolved:** Multi-browser visual timing VQA for the ex-guest realtime toast remains useful; automated event, copy, navigation, and resolver coverage is in #403.
- **Why this matters for OPT-521:** The redesign can compose the existing Join lobby action and confirmation components, and should keep their behavior intact while relocating them into the artifact's header/seat layout.

### OPT-567 → OPT-521

**From:** Codex session on 2026-07-24 · **Commit:** `27f95c0` · **PR:** [#404](https://github.com/corycunanan/optcg-sim/pull/404)

- **Primer:** Lobby switch, kick, and invite race guarantees now have a reusable real-PostgreSQL harness with observed lock waits and tag-scoped cleanup.
- **Read first:** `scripts/test-lobby-transaction-concurrency.ts` and `scripts/lib/lobby-concurrency-harness.ts` before changing the covered transactional contracts.
- **Gotchas / do NOT touch:** Keep `pnpm test:db-concurrency` manual and DEV-only; it refuses non-DEV hosts and must not enter CI or `pnpm verify`. OPT-521 owns the lobby UI and does not need to modify this harness.
- **Unresolved:** Route handlers expose no deterministic transaction hook, so the harness mirrors their Prisma mutations and CAS predicates without modifying product code.
- **Pointer:** Run `git show 27f95c0` for the implementation diff; the DEV run output is recorded in PR #404.
