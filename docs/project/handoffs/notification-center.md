---
linear-project: Notification Center
linear-project-url: https://linear.app/optcg-sim/project/notification-center-a5b5b2e9dc99
last-updated: 2026-07-26
---

# Notification Center — Handoff Doc

Durable navbar notifications with inline actions, backed by the existing per-user realtime channel and a focused social-sidebar boundary.

---

## Action Plan

Tickets are ordered by dependencies; OPT-535 was a parallel visual track.

| Order | Ticket  | Title                                                                                    | Estimate | Depends on                | Status    | PR                                                        | Notes                                                  |
| ----- | ------- | ---------------------------------------------------------------------------------------- | -------- | ------------------------- | --------- | --------------------------------------------------------- | ------------------------------------------------------ |
| 1     | OPT-534 | Navbar refresh: link reorganization + Erode treatment + active states                    | —        | —                         | Done      | [#399](https://github.com/corycunanan/optcg-sim/pull/399) | Establishes the navbar base and right-side mount point |
| 2     | OPT-525 | Notification model + API (list, mark-read, action proxy)                                 | —        | —                         | Done      | [#445](https://github.com/corycunanan/optcg-sim/pull/445) | Durable data/API foundation                            |
| 3     | OPT-526 | Realtime notification events over UserChannel                                            | —        | OPT-525                   | Done      | [#447](https://github.com/corycunanan/optcg-sim/pull/447) | Live badge and cross-tab reconciliation                |
| 4     | OPT-527 | Navbar: account/avatar element + notification bell with unread badge                     | —        | OPT-534, OPT-525, OPT-526 | In Review | [#448](https://github.com/corycunanan/optcg-sim/pull/448) | Mounts into the OPT-534 right slot                     |
| 5     | OPT-528 | Notification panel UI with inline accept/decline                                         | —        | OPT-525, OPT-526, OPT-527 | Backlog   | —                                                         | Action menu opened by the bell                         |
| 6     | OPT-529 | Migrate friend requests out of the social sidebar; sidebar keeps presence + live invites | —        | OPT-528                   | Backlog   | —                                                         | Coordinate final social-file changes with OPT-535      |
| 7     | OPT-535 | Social sidebar + docked chat widget visual refresh per artifact                          | —        | —                         | Done      | [#400](https://github.com/corycunanan/optcg-sim/pull/400) | Parallel sibling; no navbar ownership                  |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-528.

---

## Handoffs

### OPT-534 → OPT-525

**From:** session on 2026-07-24 · **Commit:** `77ddfcb` · **PR:** [#399](https://github.com/corycunanan/optcg-sim/pull/399)

- **Primer:** The global navbar now has its final left-side link structure, route-derived active states, Erode treatment, overlay menus, and an empty right-side slot reserved for downstream notification/account chrome.
- **Read first:** `src/components/nav/navbar.tsx`, `src/app/globals.css`, `src/components/deck-builder/deck-navigation-guard.test.tsx`
- **Gotchas / do NOT touch:** Keep OPT-525 scoped to the notification model/API; OPT-527 owns the navbar bell/avatar mount, and OPT-535 owns social visuals.
- **Unresolved:** The navbar logo remains deferred to a future design pass; `/sandbox` remains URL-reachable but absent from global navigation.
- **Why this matters for OPT-525:** The UI mount contract is ready, so the data/API can define a stable unread/action payload without also reshaping navbar structure.

### OPT-527 → OPT-528

**From:** session on 2026-07-26 · **Commit:** `0a65558` · **PR:** [#448](https://github.com/corycunanan/optcg-sim/pull/448)

- **Primer:** The authenticated navbar now consumes the shared realtime unread count and owns a controlled bell trigger plus account menu; notification rows and actions remain untouched.
- **Read first:** `src/components/nav/navbar-notification-bell.tsx`, `src/components/nav/navbar.tsx`, `src/components/realtime/user-channel-provider.tsx`, `src/hooks/use-notification-state.ts`
- **Gotchas / do NOT touch:** Attach the panel through the bell's `open` / `onOpenChange` seam; do not reimplement fetching, unread counting, subscriptions, or sidebar cleanup owned by OPT-529.
- **Unresolved:** Manual authenticated visual smoke testing remains; the execution environment could start the local app but could not initialize browser control.
- **Pointer:** Review commit `0a65558` or PR #448 for the component and test contracts.
