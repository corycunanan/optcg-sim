# Zone-transition and card-identity contract

`workers/game/src/engine/zone-transition.ts` is the only production service
that moves a card between game zones. Action, resume, cost, battle, draw, and
play paths must call `transitionCard`, `transitionCards`, or
`transitionDetachedCard`; they must not rebuild destination-zone cards.

## Identity boundary

Every cross-zone move creates a fresh `instanceId`, including moves between
non-field zones such as Trash → Deck, Deck → Hand, and Life → Trash. The old
identity is absent from every zone after the transition and cannot be targeted.
Same-zone ordering changes are not transitions and retain identity.

The fresh instance keeps only durable card identity and ownership. It resets
to `ACTIVE`, has no attached DON!!, has `turnPlayed: null` unless the caller is
playing it, and is controlled by its owner. A field exit returns attached DON!!
to the owner's cost area rested.

## Lifecycle cleanup and facts

The service removes active effects, prohibitions, and trigger registrations
that reference the old identity. Callers that emit a leave-zone event may set
`preserveSourceTriggers` so the event scanner can first match an `[On K.O.]` or
other leave trigger; the event must carry both `cardInstanceId` (old identity)
and `newCardInstanceId` (destination identity). Trigger staging is remapped to
the new identity when a staged Life card moves.

Each successful transition returns a `ZoneTransitionFact` containing source,
destination, owner/controller, old/new IDs, card ID, and detached DON!! IDs.
Callers use these facts for result references and movement events instead of
rediscovering cards by array position or card ID.

## Atomicity and ordering

A transition validates destination capacity before removing the source. A move
to a full Character area or occupied Stage therefore fails without losing the
card. Batch transitions preserve the caller's order at the top or bottom of
Deck/Life/Trash while returning facts in input order.

Game setup is the sole construction-time exception because no complete
`GameState` exists yet. Its opening-hand, Life, and mulligan boundaries apply
the same fresh-identity and transient-state reset rules directly.

The exhaustive zone-pair matrix and static construction guard live in
`workers/game/src/__tests__/opt-474-zone-transition-contract.test.ts`.

## Instance-id uniqueness

Every engine id is `${namespace}_${counter}` with the counter in base 36,
zero-padded to eight digits, drawn from the single
`GameState.executionContext.idCounter` shared by cards, DON!!, frames, prompts,
battles and runtime effects (`allocateContextId` in
`workers/game/src/engine/execution-context.ts`). The invariant is:

> `idCounter` is greater than or equal to the counter of every engine id in the
> state, so an allocation never re-issues a live id.

A context whose counter is lower (a freshly constructed context over an
existing state) would hand a transition an id another card already holds. The
two cards then share an identity, and the next id-keyed removal from a zone
drops both while moving one (OPT-891: a 40-card deck silently became 39).

The one production path found to break it was the rule 3-7-6-1 mid-batch
resume in `effect-resolver/resume/target.ts`, which grafted the pre-trash
execution context back after scanning the rule-trash event; the played card then
received the trashed victim's fresh id. Code that scans or evaluates an older
state snapshot must carry the newer `executionContext` into that snapshot, never
copy the older context forward.

Enforcement:

- **Construct/restore derives the counter.** `reconcileExecutionContextIdCounter`
  raises `idCounter` to the highest structural id in the state (card and DON!!
  ids in every zone including attached DON!!, runtime registry ids, effect-stack
  frame ids, the prompt id and the battle id). It runs once, never per
  allocation: when `ensureExecutionContext` hydrates a context-less legacy state,
  when `SessionRepository.load` restores the state and each undo snapshot
  (logging `session.id_counter_repaired` if it had to raise the counter), and
  when the sandbox playground hydrates a scenario. For any state the engine
  produced it is the identity, so normal-game ids are unchanged.
- **Transitions fail loudly.** `commitTransition` throws
  `[zone-transition] instance id collision` if the allocated id is already held
  in any card zone of either player (Leader, Character, Stage, Hand, Deck,
  Trash, Life, removed from game) or equals the moving card's old id, and the
  zone removal throws if more than one card in the source zone shares the moving
  card's id. The throw aborts the whole action before the session persists it;
  a rejected action is recoverable, silent inventory loss is not.
- **Tests.** A fixture that needs a specific RNG seed uses
  `reseedExecutionContext(state, seed)` from `workers/game/src/__tests__/helpers.ts`,
  which keeps the counter, rather than assigning a bare
  `createDeterministicExecutionContext(...)`.

Setup and mulligan allocate from the context directly (they predate a complete
state); setup starts from a fresh context before any id exists, and mulligan
uses the persisted, reconciled context. Coverage lives in
`workers/game/src/__tests__/opt-891-instance-id-collision.test.ts`.
