# `useGameSession` Seam Audit (OPT-265)

Date: 2026-07-15

## Decision

Do not extract another domain hook from `useGameSession` at this time.

The ticket premise is stale relative to `main`. OPT-192 already extracted card
database loading, remote game status, and navigation/finalization. OPT-351 then
extracted the authenticated WebSocket transport from `useGameWs`. The current
359-line file is long primarily because it includes 65 lines of public contract
types, a 20-line ownership comment, and the final grouped return object. Its
remaining executable logic is orchestration and small derivations that share
the same inputs.

Another hook split would not remove an actual dependency cycle, enable a
blocked test, or serve a second consumer. It would instead turn local
derivations into single-use interfaces and make the player-perspective,
opponent-presence, and terminal-state rules harder to inspect together.

This decision held after behavior-level verification. The added
`use-game-session.behavior.test.tsx` renders the real `useGameSession`,
`useGameWs`, `useAuthedWebSocket`, and `useGameFinalizer` chain while controlling
only external card/status sources, WebSocket events, API responses, and time.
All residual behavior was testable through the existing contracts; no new seam
was needed to observe or drive it.

## Current responsibility map

| Responsibility                           | Current owner         | Contract / dependencies                                                                                                               | Evidence                                                                                                                                                    |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated token acquisition          | `useGameSession`      | `gameId`, optional requested player index, remote-not-found state -> async token getter                                               | The getter is the shared credential dependency for the socket and card database. OPT-383 already migrated it to `apiGet` plus `GameTokenResponseSchema`.    |
| Socket transport and reconnect lifecycle | `useAuthedWebSocket`  | URL, token getter, typed message callback -> connection status, send, retry, close                                                    | Connection generations, retry backoff, stale socket handling, and terminal failure are outside `useGameSession`.                                            |
| Game message vocabulary and state        | `useGameWs`           | Live game ID, worker URL, token getter -> game state, prompt, game-over state, accepted/rejected actions, action/leave/retry commands | `game:state`, `game:update`, prompt, rejection, undo, and game-over messages are handled in one game-specific boundary.                                     |
| Duplicate action suppression             | `useGameSession`      | Raw action sender -> sender suppressing identical actions inside 250 ms                                                               | This is perspective-instance policy: Solitaire intentionally gives each mounted perspective an independent suppression window.                              |
| Card database lifecycle                  | `useCardDatabase`     | Live game ID, worker URL, token getter -> database/readiness/error/retry                                                              | Fetch retry state is already independently owned.                                                                                                           |
| Remote persisted status                  | `useRemoteGameStatus` | Game ID -> remote status/not-found state/setter                                                                                       | Initial API state and user-channel terminal updates are already independently owned.                                                                        |
| Connectivity composition                 | `useGameSession`      | Socket status/error/retry plus card database error/retry -> one UI error and retry command                                            | The live shell exposes one recovery action, so coordinating both subsystems is composer work rather than a new domain lifecycle.                            |
| Player perspective                       | `useGameSession`      | User ID, optional requested index, game state -> `myIndex`, `me`, `opp`, turn and battle values                                       | The optional index only wins for same-user Solitaire games; ordinary PVP remains identity-derived. These values feed both opponent and terminal derivation. |
| Opponent presence                        | `useGameSession`      | Opponent, opponent index, turn/battle phase, current time -> away copy, pause state, deadline                                         | The only stateful part is a one-second ticker while a disconnected player has a rejoin deadline.                                                            |
| Terminal match state                     | `useGameSession`      | Socket game-over event, worker state, persisted status -> `matchClosed`, fallback availability, end copy                              | All three completion sources must be reconciled at the composition boundary.                                                                                |
| Leave, concede, finalize, and navigation | `useGameFinalizer`    | Game identity/state, terminal state, socket leave command, remote-status setter -> navigation state and handlers                      | Finalization side effects and submission state are already isolated. `useGameSession` only gates ownership so Solitaire player 1 cannot finalize twice.     |
| Public session surface                   | `useGameSession`      | The domains above -> `{ game, opponent, navigation, endState }`                                                                       | The return shape is already grouped by domain rather than the stale audit's flat 30-value shape.                                                            |

## Consumer map

There are two production call sites and no direct consumers of a plausible new
sub-hook:

| Consumer                                                      | Usage                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PvpGameSession` in `src/components/game/live-game-shell.tsx` | Mounts one session and passes the complete grouped contract to `GameSessionView`. The view uses socket/card/player values for the board, opponent presence for the away banner, navigation for failure/end flows, and end-state copy for the result dialog. |
| `useSolitaireSession`                                         | Mounts player 0 and player 1 sessions, selects the active perspective, and preserves per-perspective sockets/action senders. Player 0 owns finalization; player 1 receives inert navigation handlers.                                                       |

The tests call `useGameSession` directly only as a composition harness. They are
not additional runtime consumers.

## Seam assessment

### Seams already extracted

- Navigation/finalization is a focused hook with explicit dependencies in
  `useGameFinalizer`.
- Opponent-independent remote status is isolated in `useRemoteGameStatus`.
- Card loading and retry state are isolated in `useCardDatabase`.
- Message-to-state handling is isolated from session composition in
  `useGameWs`.
- Connect/reconnect/token refresh and close behavior is isolated in the
  controller-backed `useAuthedWebSocket`.

### Residual candidates considered

**Player and board-state derivation.** This is a small synchronous projection
over `gameState`, `userId`, and the optional Solitaire index. It has no second
consumer, and its outputs immediately feed both opponent and end-state rules.
Extracting a hook would create a wide pass-through return without isolating a
lifecycle or side effect.

**Opponent presence.** The away banner calculation is cohesive, but only one
consumer needs it and only the deadline ticker is stateful. A dedicated hook
would still depend on the derived player index, opponent record, turn, and
battle phase. No current test is blocked by keeping it local; fake time plus a
session render can verify the behavior directly.

**Terminal/end-state derivation.** `matchClosed`, fallback concession
availability, result title/color, and finalizer ownership intentionally combine
socket, persisted, player-perspective, and Solitaire inputs. Splitting them
would either duplicate terminal-state precedence or require a broad parameter
object for a single call site. The side effects are already in
`useGameFinalizer`.

**Message reducer.** `useGameWs` has repeated handling for `game:state` and
`game:update`, and its current shallow React mock indexes state setters. That is
a real test-maintenance weakness, but it is not coupling inside
`useGameSession`. A future change may introduce a pure game-message reducer if
message behavior grows or the setter-index tests start blocking changes. OPT-265
should not force that unrelated rewrite without a failing behavior case.

## Actual coupling and testability findings

- The token getter is intentionally shared by socket and card reads. Moving it
  into either domain would couple the other domain back to that hook; keeping
  it in the composer is the clean dependency direction.
- Player perspective is a true shared input for opponent state, board state,
  and end-state copy. Splitting those projections into hooks would increase
  cross-hook parameter coupling.
- Solitaire finalization ownership is the only unusual orchestration rule. It
  is covered by the dual-instance composition test and documented on the
  composer because that is where both requested perspective and finalizer
  output are visible.
- The legacy `useGameSession` tests use a shallow mocked-React harness for
  per-perspective identity, action routing, independent connection status, and
  single-owner finalization. The new behavior suite complements them with an
  actual React render and the real session -> game-message -> authenticated
  transport -> finalizer chain.
- Focused controller tests already cover initial connection, fresh-token
  reconnects, backoff, retry invalidation, failure, and manual close. Focused
  message tests cover prompt identity and accepted/rejected action streams.
- The new suite verifies facade-level connect/drop/reconnect and combined retry
  wiring; `game:state` and `game:update` projections; opponent disconnect/LEFT
  copy, deadline ticking, opponent-turn pauses, and all three response-step
  pauses; open-match socket leave; rendered leave and fallback-concede failure
  state; closed-match navigation; terminal-display precedence; and idempotent
  finalization across persisted, worker-state, and socket terminal signals.
- Those cases required controllable boundaries, not another domain hook. The
  tests mock neither `useGameWs`, `useAuthedWebSocket`, nor `useGameFinalizer`.
  This is direct evidence for keeping the current composer boundary.

## Verification added for OPT-265

`src/hooks/use-game-session.behavior.test.tsx` adds seven behavior tests:

1. Initial connection, server-drop reconnect, and the session retry command
   coordinating transport plus card-database recovery.
2. Real message-stream projection of worker state, accepted actions, turn
   ownership, and undo availability.
3. Opponent disconnect countdown, LEFT copy, opponent-turn pause, the
   BLOCK/COUNTER/DAMAGE response pauses, and the non-pausing attack step.
4. Open-match leave delivery and socket close before lobby navigation.
5. Leave failure state through the rendered finalizer contract.
6. Fallback-concede API failure without navigation.
7. Persisted terminal fallback, worker-state precedence, socket `game:over`
   precedence, closed-match navigation, and one finalization across duplicate
   terminal observations.

The transport uses a controllable `WebSocket` implementation and fake time;
the game message and finalizer hooks remain production implementations. This
keeps the assertions at behavior boundaries instead of hook internals.

## Follow-ups

The acceptance behavior is now covered. Remaining cleanup is non-blocking:

1. Migrate legacy shallow composition cases to the behavior harness when those
   cases next change, then remove the setter-oriented React mock.
2. If `useGameWs` message cases expand, replace its setter-index assertions
   with a pure message-state transition and stream tests. Do this when message
   changes provide concrete cases, not solely to reduce line count.

Revisit extraction only if one of those rules gains a second consumer, the
composer begins owning another independent lifecycle, or a behavior test cannot
be written through the current explicit contracts.
