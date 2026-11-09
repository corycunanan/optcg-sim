# Batch and distribution contract

Status: binding (OPT-955). Audit source: `CONSOLIDATION-PROPOSAL-AUDIT-2026-10.md` §4K, §6.2 (OP18-046 clause A), §6.3 item 5.

A **batch** is one action instruction that affects more than one card at once: "K.O. all of your opponent's Characters", "play up to 2", "return 3 cards to the bottom of the deck", "draw 3", "give up to 2 DON!! to your Leader and all of your Characters". This document fixes, for every batch, who orders the cards, when per-card triggers fire, when rule processing runs, and how one pool is split over many targets. Fixtures: `workers/game/src/__tests__/opt-955-batch-distribution.test.ts`, plus the suites named in each section.

## 1. One instruction, one batch

A batch is the set of cards one action resolves. It is not split across actions, and an action is not merged with its neighbours: in "K.O. up to 1, then draw 1" the K.O. and the draw are two batches, each finished before the next starts (rule 8-6-1-1 for the effects they set off, rule 4-10 for the `THEN` chain).

Inside a batch, the engine works in this order:

1. **Choose.** Targets are chosen (by prompt or automatically) once, for the whole batch. Prohibitions (`CANNOT_BE_KO`, `CANNOT_ATTACH_DON`, …) drop members before anything else (OPT-251, OPT-459, OPT-931, rule 1-3-3).
2. **Replace.** Replacement effects scan the batch once. One substitute payment covers every member it protects, members stay on the field while it is paid, and a payment never funds a sibling (OPT-219, OPT-873, audit Decision 8).
3. **Move.** The remaining members move one by one in batch order (rule 3-2-3). No trigger window opens between two members.
4. **Report.** The events of every member are scanned together, once, after the last move (OPT-757). Their auto effects therefore meet their timing at the same time.
5. **Check.** Rule processing runs on the finished batch (§4).
6. **Resolve triggers.** The collected effects resolve by rule 8-6-1: the turn player's first, then the non-turn player's. When a player has two or more different effects, that player chooses the order (`AWAITING_TRIGGER_ORDER_SELECTION`, OPT-743). Effects set off while these resolve go behind them (rule 8-6-1-1).

The only pauses inside step 3 are choices the rules require before a card can land: the rule 3-7-6-1 trash-for-room prompt when a sixth Character is played (OPT-114), the ACTIVE/RESTED choice of a `PLAYER_CHOICE` play (OPT-114), and the owner's order for an ordered destination (§2). None of them drains a trigger. Triggers collected before the pause are carried on the continuation and reported in step 4 (`opt-114-mid-batch-overflow.test.ts`, `opt-757-batch-trigger-pause-regressions.test.ts`).

## 2. Who orders the cards (rule 3-1-7)

> 3-1-7. When multiple cards are placed in an area simultaneously, unless otherwise specified, the owner of the cards decides the order in which they are placed in the new area.

| Destination | Is the order observable? | Who orders | Where |
|---|---|---|---|
| Deck (top or bottom) | Yes | Each owner orders their own cards | `RETURN_TO_DECK`, `returnToDeckArrangement` (`resume/deck.ts`, `opt-487-return-to-deck-source-zones.test.ts`) |
| Life | Yes | The owner | `ADD_TO_LIFE_FROM_FIELD` reuses the same arrangement (OPT-797) |
| Character area, Stage, cost area, hand, trash | No | — | No prompt. Members land in batch order. |

The engine asks only when the order can change a later outcome, and only an owner who moves two or more cards. When a batch moves both players' cards, each owner orders their own cards, one owner after the other, before any card enters the deck. "Unless otherwise specified": card text that fixes the order wins over this default and must be encoded on the action, not left to the prompt.

The move itself keeps the order it is given (`ZONE-TRANSITION-CONTRACT.md`, "Atomicity and ordering"); this section says who decides that order.

Effects that meet their timing together are a separate question, answered by rule 8-6-1 in §1 step 6, not by rule 3-1-7.

## 3. Per-card and per-batch events (rule 3-2-3)

> 3-2-3. When multiple cards in a deck are moved simultaneously, they should be moved one by one.

Every member that moves emits its own event: one `CARD_KO` per K.O.'d card, one `CARD_PLAYED` per played card, one `CARD_DRAWN` per drawn card, one `CARD_TRASHED` per trashed card. Because the batch's events are reported together (§1 step 4), a watcher sees all of them in one scan, never half a batch.

A few events describe the batch as a whole and fire once per batch with a `count`:

| Event | Fired by | Payload |
|---|---|---|
| `DON_GIVEN_TO_CARD` | `GIVE_DON`, `DISTRIBUTE_DON`, `REDISTRIBUTE_DON`, `GIVE_OPPONENT_DON_TO_OPPONENT` | `count`: DON!! given by the whole action |
| `DRAW_OUTSIDE_DRAW_PHASE` | `DRAW` | `count`: cards drawn |
| `DON_PLACED_ON_FIELD`, `DON_RESTED` | DON!! deck and cost-area actions | `count` |

A batch event fires only when the batch moved something. A give from an empty pool fires nothing (OP02-002 Garp must not trigger).

## 4. Rule-processing checkpoints inside a batch

Rule processing (rule 9-1-2) runs after every action that changed a deck or Life count, so it runs before the next action can prompt (OPT-949, OPT-862, `resolver.ts → ruleProcessingAfterAction`). Resume paths that move cards directly run the same check before the rest of the chain (OPT-960). For a batch this means:

- **A deck reaching 0 mid-batch.** A multi-card draw or mill moves one player's cards from one deck, so the deck can reach 0 only on its last card. Checking after the action is the between-cards check of rule 3-2-3: "draw 3" from a 2-card deck draws 2 and then the player loses (`opt-862-mid-resolution-deck-out.test.ts`).
- **A deck reaching 0 in a trigger the batch set off.** The batch itself finishes (every member moves, §1 step 3). The triggers then resolve one at a time, and the checkpoint after each one ends the game before the next. A batch K.O. of 3 Characters with "[On K.O.] Draw 1" against a 1-card deck puts all 3 in the trash, draws once, and ends the game. The other two [On K.O.] effects never resolve (`opt-955-batch-distribution.test.ts`, "batch K.O. of 3").
- **Both players at once.** One checkpoint evaluates both players and writes one result, so a batch that empties both decks is a draw, not two losses (audit Decision 3, `opt-949-rule-processing-checkpoint.test.ts`).
- **Delayed loss.** Card text that delays the loss (OP15-022 Brook) keeps the batch and its triggers resolving (rule 1-3-1).

## 5. Distribution: one pool over many targets

"Give DON!!" text comes in three shapes. The engine has one action per shape, and DON!! never split freely across recipients unless the text says so (FAQ OP13-042, ST01-011, OP05-008, OP07-001).

| Text | Action | Meaning |
|---|---|---|
| "Give up to N DON!! to 1 of your …" | `GIVE_DON` `{ amount: N }` | Each chosen target receives N, as many as the pool allows, target by target. |
| "Give N DON!! each to up to M of your …" | `DISTRIBUTE_DON` `{ amount_per_target: N }` | Each chosen target receives N. Fixed per target; no split choice. |
| "Give up to N DON!! to your Leader and all of your Characters" (OP18-046 clause A) | `DISTRIBUTE_DON` `{ max_per_target: N }` | **Split.** One pool; each target may receive 0 to N; the controller chooses the split. |

### The split form

```ts
{
  type: "DISTRIBUTE_DON",
  target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { all: true } },
  params: { max_per_target: 2, don_state: "RESTED" },
}
```

- **The pool** is the controller's unattached cost-area DON!! in `don_state` (default `ACTIVE`). Other DON!! are never used.
- **The budget** is the pool size, capped by `max_total` when it is set ("up to N in total").
- **The recipients** are the action's targets, chosen first as for any targeted action. A recipient under `CANNOT_ATTACH_DON` is never offered (rule 1-3-3).
- **The split is asked in rounds.** Round *k* offers the recipients that already hold *k*−1 DON!! from this split and asks for up to min(budget left, recipients offered) of them. Each pick gets one more DON!!. Every split with at most N per target and at most the budget in total can be reached. The rounds stop after round N, when the budget is spent, when nobody is offered, or when the controller picks nobody (an empty reply). With nothing in the pool, nothing is asked.
- **Nothing moves until the split ends.** The planned DON!! then attach in recipient order as one batch, with one `DON_GIVEN_TO_CARD` carrying the total. A prohibition that appeared while the split was being asked takes precedence for that recipient (rule 1-3-3). A `result_ref` records the recipients that received DON!! and the total.
- **Persistence.** Between rounds the plan lives on the frame as `donDistribution: { round, allocation }` (`types.ts → DonDistributionProgress`), so a reload resumes the same round.
- **Lint.** `max_per_target` replaces `amount` and `amount_per_target`, and `max_total` needs `max_per_target`. Both are positive integers (`schema-don-split-lint.ts`).

### OP18-046 clause A

"[On Play] Draw 2 cards and give up to 2 rested DON!! cards to your Leader and all of your Characters." The audit reads this as one slot per listed target: each of them may receive up to 2. That is the split form above with `max_per_target: 2`. If an official ruling reads "up to 2" as a total across all of them, add `max_total: 2`; no engine change is needed. The two readings agree whenever the pool holds 2 rested DON!! or fewer, which is the acceptance case (2 rested DON!! over a Leader and 3 Characters: the split is asked, each target is capped at 2, only rested DON!! attach).

OP18 card data is not in the repository yet. Encode the card when the set lands, and pin the ruling then.

## 6. Not covered

- **Battle damage.** Damage points are dealt one at a time with their own Trigger windows (audit Decision 2, `effect-damage.ts`). They are not a batch in this sense.
- **Splits of other resources.** Only DON!! has a split action. A future "distribute N power among" or "distribute N counters" should follow §5 rather than invent a new prompt shape.
