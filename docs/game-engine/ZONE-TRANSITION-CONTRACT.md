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
