---
linear-project: Notification Center
linear-project-url: https://linear.app/optcg-sim/project/notification-center-a5b5b2e9dc99
last-updated: 2026-07-29
---

# Notification Center — Handoff Doc

Durable navbar notifications with inline actions, backed by the existing per-user realtime channel and a focused social-sidebar boundary.

---

## Action Plan

Tickets are ordered by dependencies; OPT-535 was a parallel visual track.

| Order | Ticket  | Title                                                                                    | Estimate | Depends on                | Status    | PR                                                        | Notes                                                  |
| ----- | ------- | ---------------------------------------------------------------------------------------- | -------- | ------------------------- | --------- | --------------------------------------------------------- | ------------------------------------------------------ |
| 1     | OPT-534 | Navbar refresh: link reorganization + Erode treatment + active states                    | —        | —                         | Done      | [#399](https://github.com/corycunanan/optcg-sim/pull/399) | Establishes the navbar base and right-side mount point |
| 2     | OPT-525 | Notification model + API (list, mark-read, action proxy)                                 | —        | —                         | Done      | [#445](https://github.com/corycunanan/optcg-sim/pull/445) | Durable data/API foundation; squash `b1d60ef`          |
| 3     | OPT-526 | Realtime notification events over UserChannel                                            | —        | OPT-525                   | Done      | [#447](https://github.com/corycunanan/optcg-sim/pull/447) | Live badge and cross-tab reconciliation; squash `3fb08d1` |
| 4     | OPT-527 | Navbar: account/avatar element + notification bell with unread badge                     | —        | OPT-534, OPT-525, OPT-526 | Done      | [#448](https://github.com/corycunanan/optcg-sim/pull/448) | Mounts into the OPT-534 right slot; squash `d143862`   |
| 5     | OPT-528 | Notification panel UI with inline accept/decline                                         | —        | OPT-525, OPT-526, OPT-527 | Done      | [#449](https://github.com/corycunanan/optcg-sim/pull/449) | Action menu opened by the bell; squash `cf39c67`       |
| 6     | OPT-529 | Migrate friend requests out of the social sidebar; sidebar keeps presence + live invites | —        | OPT-528                   | Done      | [#453](https://github.com/corycunanan/optcg-sim/pull/453) | Sole incoming-request surface is the notification center; squash `010eb40` |
| 7     | OPT-535 | Social sidebar + docked chat widget visual refresh per artifact                          | —        | —                         | Done      | [#400](https://github.com/corycunanan/optcg-sim/pull/400) | Parallel sibling; no navbar ownership                  |
| 8     | OPT-594 | Prioritize actionable notifications in the inbox                                        | —        | OPT-529                   | Done      | [#459](https://github.com/corycunanan/optcg-sim/pull/459) | Actionable rows lead the 20-row panel window; squash `249b3dd` |
| 9     | OPT-580 | Bound per-user notification retention                                                    | —        | OPT-529                   | Done      | [#460](https://github.com/corycunanan/optcg-sim/pull/460) | Retains 100 non-live rows plus live request notifications; squash `41fd709` |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Project complete:** all nine Action Plan tickets are Done and merged.

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

- **Primer:** The authenticated navbar now consumes the shared realtime unread count and owns a count-announcing bell plus account menu; notification rows and actions remain untouched.
- **Read first:** `src/components/nav/navbar-notification-bell.tsx`, `src/components/nav/navbar.tsx`, `src/components/realtime/user-channel-provider.tsx`, `src/hooks/use-notification-state.ts`
- **Gotchas / do NOT touch:** Attach the panel through the bell's optional `onActivate` seam, then add truthful popup ARIA with the real panel; do not reimplement fetching, unread counting, subscriptions, or sidebar cleanup owned by OPT-529.
- **Unresolved:** None; authenticated preview VQA was completed during OPT-527 review.
- **Pointer:** PR #448 is the canonical source for the component and test contracts.

### OPT-528 → OPT-529

**From:** session on 2026-07-27 · **Commit:** `37da558` · **PR:** [#449](https://github.com/corycunanan/optcg-sim/pull/449)

- **Primer:** Friend requests now resolve end-to-end from the navbar notification action menu, including optimistic outcomes, rollback, realtime convergence, and mark-read-on-open behavior.
- **Read first:** `src/components/social/social-sidebar.tsx`, `src/components/nav/navbar-notification-panel.tsx`, `src/components/social/apply-friend-event.ts`
- **Gotchas / do NOT touch:** Keep the notification panel as the sole friend-request action surface after migration; preserve the existing `friend:*` event-driven friend-list updates and OPT-525 API proxy contract.
- **Unresolved:** Full-page notification history remains deferred; no OPT-529 work is needed for it.
- **Pointer:** PR #449 and commit `37da558` contain the behavioral and accessibility contracts.

### OPT-594 follow-up closeout

**From:** merged follow-up · **Commit:** `249b3dd` · **PR:** [#459](https://github.com/corycunanan/optcg-sim/pull/459)

- **Primer:** `GET /api/notifications` now prioritizes actionable friend-request notifications ahead of resolved/read rows, so an available Accept/Decline action cannot fall outside the panel's 20-row window. Option 1 (prioritize actionable rows) was ratified; a separate actionable fetch, keyset pagination, and a full history view were explicitly not chosen.
- **Read first:** `src/lib/notification-order.ts`, `src/app/api/notifications/route.ts`, `src/hooks/use-notification-state.ts`, `src/components/nav/navbar-notification-panel.tsx`
- **Gotchas / do NOT touch:** Keep the actionable predicate in one place in `src/lib/notification-order.ts` and shared by client and server; do not let their orderings diverge. `READ` remains actionable when `type = FRIEND_REQUEST`, `referenceId` is present, and the status is `PENDING` or `READ`, because opening the panel marks visible rows read while actions remain available. Preserve the `RepeatableRead` snapshot shared by rows and counts.
- **Unresolved:** Keyset/cursor pagination and a full history view remain deferred. OPT-598 shipped database-backed raw SQL and migration coverage through the per-run PostgreSQL harness in `src/test/database/global-setup.ts`.
- **Pointer:** PR #459 and squash commit `249b3dd`.

### OPT-580 follow-up closeout

**From:** merged follow-up · **Commit:** `41fd709` · **PR:** [#460](https://github.com/corycunanan/optcg-sim/pull/460)

- **Primer:** Retention pruning now runs after every path that creates a notification or makes one terminal, retaining the newest 100 non-live rows plus any live rows whose referenced `FriendRequest` remains `PENDING`; duplicate pruning is suppressed by `NOTIFICATION_ACTION_RATE_LIMIT_CHARGED`.
- **Read first:** `src/lib/notifications.ts`, `src/app/api/friends/requests/route.ts`, `src/app/api/friends/requests/[id]/route.ts`, `src/app/api/notifications/[id]/route.ts`, `src/app/api/friends/requests/route.test.ts`
- **Gotchas / do NOT touch:** Do not move pruning inside a transaction, do not delete a notification whose `FriendRequest` is still `PENDING`, and do not replace the parameterized CTE/DELETE with application-side id arrays. Keep the `NOT EXISTS` liveness guard at both selection and deletion.
- **Unresolved:** None; OPT-598 shipped database-backed coverage for the retention SQL and backfill migration through the per-run PostgreSQL harness in `src/test/database/global-setup.ts`.
- **Pointer:** PR #460 and squash commit `41fd709`.

---

## Project Closeout

### Shipped

A durable notification inbox: a Prisma `Notification` model plus list, mark-read, and action-proxy APIs; realtime `notification:*` events over the existing per-user `UserChannel`; a navbar bell with a live unread badge and account menu; an inline accept/decline panel; and removal of the duplicate friend-request UI from the social sidebar. Friend requests now live solely in the notification center.

### Ratified Product Decisions (from Cory, during the run)

- All four navbar links remain. `PLAY` is promoted to the leftmost position with emphasized treatment. The final order is `PLAY`, `HOME`, `CARDS`, `DECKS`.
- Opening the notification panel marks the visible items read, so the badge clears on open. A separate **Mark all read** control also ships.

### Key Design Points

- Accept/decline proxies `PUT /api/friends/requests/[id]` rather than duplicating it, so notification state and friend-request state cannot drift.
- A `409` from that route is authoritative: `conflictOutcome()` derives the real terminal state rather than trusting the user's optimistic action.
- Notification fan-out is post-commit and best-effort via `after(...)`; a realtime failure can never roll back or fail the underlying mutation.
- Actionable friend-request rows (`PENDING` or `READ` with a `referenceId`) sort ahead of resolved/read rows. The shared predicate in `src/lib/notification-order.ts` keeps API, realtime, and panel ordering aligned; page 1 retrieval is O(actionable count + limit), and later pages are O(limit). The partial index `20260729043000_add_actionable_notification_inbox_index` supports the actionable scan.
- Retention pruning runs post-commit and best-effort via `after(...)` from every creation or terminal-state path. It retains the newest 100 non-live rows plus all rows backed by a still-`PENDING` friend request, using one parameterized CTE/DELETE with liveness guards at both selection and deletion.
- The sidebar still subscribes to `friend:request_accepted`, `friend:request_declined`, and `friend:removed` for friend-list mutations. Only incoming-request handling was removed; do not delete those subscriptions.
- `20260728233000_backfill_pending_friend_request_notifications` backfills notifications for friend requests that predate the notification table and is idempotent (`ON CONFLICT DO NOTHING`).

### Open Follow-ups (Linear)

- Add structured outcome codes to OPT-525's `409` responses so `conflictOutcome()` no longer depends on error-message prose.
- Replace offset `skip`/`take` in `GET /api/notifications` with keyset/cursor pagination.
- Outgoing “Request sent” state does not survive a page reload. This is pre-existing; the sidebar never consumed the fetch's `outgoing` data.
