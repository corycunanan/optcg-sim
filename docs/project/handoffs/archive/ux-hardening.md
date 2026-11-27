---
linear-project: UX Hardening
linear-project-url: https://linear.app/optcg-sim/project/ux-hardening-10f1af9ff4a5
last-updated: 2026-07-16
---

# UX Hardening Handoff - Project Complete

## Final status

The UX Hardening project is complete. All 13 Linear issues are Done: 11 implementation issues and the two tracking parents, OPT-388 and OPT-391. The first three implementation issues merged before the close-out pipeline; the remaining eight merged in one orchestrated run on 2026-07-15/16. No project issue remains blocked, in review, or awaiting implementation.

| Issue | Merged PR | Outcome |
| --- | --- | --- |
| OPT-385 | [#230](https://github.com/corycunanan/optcg-sim/pull/230) | Required destructive confirmation before dispatching an in-game concede. |
| OPT-386 | [#238](https://github.com/corycunanan/optcg-sim/pull/238) | Made deck-builder save, load, and search failures visible and guarded work-loss navigation and Clear. |
| OPT-387 | [#236](https://github.com/corycunanan/optcg-sim/pull/236) | Sent newly onboarded users to `/decks` and restored scrolling on the deck list. |
| OPT-388 | Tracking parent | Completed through the social failure-state and route-skeleton implementation issues below. |
| OPT-391 | Tracking parent | Completed through the guest-leave and host-close lobby lifecycle issues below. |
| OPT-492 | [#341](https://github.com/corycunanan/optcg-sim/pull/341) | Added distinct chat loading, empty, and failure states plus recoverable sends. |
| OPT-491 | [#342](https://github.com/corycunanan/optcg-sim/pull/342) | Made social-sidebar reads and mutations recoverable, including destructive Unfriend confirmation. |
| OPT-445 | [#343](https://github.com/corycunanan/optcg-sim/pull/343) | Keyed player-choice state by prompt identity across live, scripted, and sandbox game paths. |
| OPT-490 | [#344](https://github.com/corycunanan/optcg-sim/pull/344) | Extended dirty-deck confirmation to global navigation and lobby-invite acceptance. |
| OPT-495 | [#345](https://github.com/corycunanan/optcg-sim/pull/345) | Added an atomic, recoverable pre-game guest leave flow. |
| OPT-87 | [#346](https://github.com/corycunanan/optcg-sim/pull/346) | Allowed sleeve and DON art customization to reset to the persisted default. |
| OPT-494 | [#347](https://github.com/corycunanan/optcg-sim/pull/347) | Implemented the ratified host close-lobby lifecycle and protected it from concurrent writes. |
| OPT-493 | [#348](https://github.com/corycunanan/optcg-sim/pull/348) | Added accessible route loading skeletons, including destination-shaped child boundaries. |

## Review close-out

Every implementation PR in the orchestrated run went through adversarial review. Substantive fixes landed before merge:

- Deck-builder save revision tracking keeps edits made during an in-flight save dirty, and lobby-invite acceptance now consults the same navigation guard (OPT-490).
- Social-sidebar fetch epochs prevent stale reads from undoing successful mutations (OPT-491).
- Chat send state is isolated by conversation so a pending send cannot gate or mutate a newly selected conversation (OPT-492).
- Prompt identity propagates through scripted and engine-driven sandbox adapters, not only live sessions (OPT-445).
- Guest leave navigates away only after success or a terminally absent lobby/seat response (OPT-495).
- Join, lobby PATCH, and invite creation revalidate active lifecycle state in conditional transactions so stale preflights cannot mutate a closed lobby (OPT-494).
- `/decks/new`, `/decks/[id]`, and `/lobbies/[id]` have child loading boundaries shaped like their destination rather than inheriting parent list skeletons (OPT-493).

## Ratified close-lobby lifecycle

OPT-494 resolved the remaining product decision: a host may close a `READY` PVP lobby with a guest seated only after destructive confirmation that explicitly names the impact on the guest. The guest receives realtime `CLOSED` state and recovers to `/lobbies`; pending invites are canceled; and the lobby becomes non-joinable as part of the successful conditional transition. `SOLITAIRE` and in-game lobbies remain excluded.

## Residual follow-ups

The adversarial reviews identified four follow-ups and each is now filed in Linear:

- [OPT-500](https://linear.app/optcg-sim/issue/OPT-500) - extend dirty-deck protection to browser Back/Forward navigation when a supported blocker strategy is available.
- [OPT-501](https://linear.app/optcg-sim/issue/OPT-501) - add server-side chat send idempotency for ambiguous request outcomes.
- [OPT-502](https://linear.app/optcg-sim/issue/OPT-502) - harden lobby realtime reliability with reconnect refresh, bounded reconciliation, and monotonic versions.
- [OPT-503](https://linear.app/optcg-sim/issue/OPT-503) - stabilize the OPT-242 liveness test's timing assertion, which failed CI on PR #348 and required a rerun.

No residual item blocks project completion.
