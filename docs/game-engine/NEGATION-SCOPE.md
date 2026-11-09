# Negation scope contract

What "negate the effect of" removes, what it keeps, when it ends, and how it meets [On K.O.] and granted keywords. Owner tickets: OPT-954 (scope) and OPT-1012 (bounds on conditional durations). Earlier pieces: OPT-253 (flag model), OPT-260 (trigger-type negation), OPT-261 (hand-zone cost auras), OPT-910 (resolved prohibitions), OPT-1008 (conditional permanent auras).

Rules: 8-1-4 (one-shot and continuous effects), 8-2-2 (invalid is not "no base effect"), 8-2-3 (resolved auto/activate effects are not invalidated), 8-2-4 (an effect gained after invalidation is not invalidated).

## 1. Model

A negation is a `NEGATE_EFFECTS_FLAG` active effect whose `appliesTo` lists the negated cards (`executeNegateEffects`), or a permanent `NEGATE_EFFECTS` aura (OP13-064). `isCardNegated` (`workers/game/src/engine/modifiers.ts`) is the only reader. A negated card keeps its schema; every query site asks `isCardNegated` and skips the card's own contributions.

Every effect record falls into one origin class. The class decides what negation does to it.

| Origin class | How the engine recognizes it | Under negation of the card |
|---|---|---|
| Printed, continuous | Permanent block or keyword flag in the card's own schema; registered active effects and prohibitions carry the authored `sourceEffectBlockId` | Removed while the negation applies |
| Printed, triggered | Trigger registration for the card's own auto/activate blocks | Does not activate while the negation applies (§3 for [On K.O.]) |
| Granted by another card | Active effect whose source is a different card | Kept (8-2-4) |
| Resolved result | Active effect with `category: "auto"` and `sourceEffectBlockId: ""`; prohibition with `sourceEffectBlockId: ""` | Kept (8-2-3), even when the negated card is its source |

"Resolved result" covers a keyword the card gained from its own already-resolved effect. OP09-068 Chopper and OP09-084 Catarina Devon keep the [Blocker] they gave themselves (qa_op09.md:290, qa_op09.md:297).

## 2. What negation removes and keeps

- Removes: the card's printed keywords (`hasEffectiveKeyword`), its printed permanent modifiers and auras on itself and others (OPT-253, OPT-261), its printed triggered effects, and its printed rule modifications that check negation (for example deck-out replacement, `defeat.ts`).
- Keeps: modifiers, keywords, and prohibitions other cards apply to it, and lasting results of effects that already resolved, including its own. OP06-074 Zephyr: Edward.Newgate's resolved +2000 on its Leader stays (qa_op06.md:218). OP12-099 Kalgara's resolved CANNOT_DRAW stays (OPT-910).
- Does not change card identity: a negated card is not "a card with no base effect" (8-2-2; qa_op09.md:137) and its power is not reset.

## 3. [On K.O.] after negation

A Character negated at the moment it is K.O.'d does not activate its own [On K.O.] (qa_op09.md:166, qa_op09.md:189, qa_op09.md:208, qa_op10.md:211, qa_op06.md:206). This covers "negate, then K.O." in one effect (OP06-074, OP09-098) and a K.O. later in the turn.

The K.O. writer reads negation before the zone move and stamps `CARD_KO.preKO_negated: true` (`koCharacter`, and the `KO_OWN_CHARACTER` cost path). The trigger matcher skips the K.O.'d card's own ON_KO block when the stamp is set. The field is written only when true, so other K.O. events stay byte-identical. Watchers on other cards (for example `ANY_CHARACTER_KO`) are not affected; they read `preKO_keywords` for the K.O.'d card's last-known keywords.

## 4. Duration

A negation lasts for its own duration, not its source's lifetime.

- A resolved flag is source-independent: it survives its source leaving the field or being negated.
- A permanent aura pauses while its source is negated (OPT-1008).
- Trigger-type negation (`NEGATE_TRIGGER_TYPE`, OP09-081) applies to cards that enter later in its window: [On Play] stays off for a Character played on the opponent's next turn, while [When Attacking] still works (qa_op09.md:125, qa_op09.md:129).
- Zone change ends everything: a card that leaves the field and returns is a new card with no negation.

## 5. Conditional durations of resolved negation (OPT-1012)

A `WHILE_CONDITION` on a resolved flag decides whether that flag still applies. Its condition is read against the game with that one flag set aside, because a duration cannot depend on its own result. Other flags, auras, and grants stay in view.

- Example: "negated while your opponent has a [Rush] Character" on the opponent's only [Rush] Character. The condition sees the Character with [Rush], so the negation applies, and the Character then has no [Rush].
- Only the flag being decided is set aside. A second, unconditional negation of the same card stays in view, so the first flag's condition is false and step 6 retires it.
- This is not the OPT-1008 apply-once rule. That rule guards a card whose aura negation is in progress. This rule guards one flag.
- Every reader of a flag's duration uses `evaluateNegationFlagGate`: `isCardNegated`, `isEffectConditionMet` and `isModifierConditionMet`, `evaluateWhileConditions` (step 6), and the visibility view. They agree on one answer.
- Each nested read sets one more flag aside, so recursion is bounded by the number of flags. The guard lives in the per-query scope and is released on exceptions.

No authored card produces a conditional resolved negation today: 20 authored `NEGATE_EFFECTS` producers use `THIS_TURN`, and OP13-064 is a permanent aura. Re-check this inventory when encoding one.

## 6. Fixtures

| Ruling | FAQ | Test |
|---|---|---|
| OP09-093 Teach | qa_op09.md:166, qa_op09.md:170 | `opt-954-negation-scope.test.ts` |
| OP09-097 Black Vortex | qa_op09.md:189, qa_op09.md:193 | `opt-954-negation-scope.test.ts` |
| OP09-098 Black Hole | qa_op09.md:208, qa_op09.md:212 | `opt-954-negation-scope.test.ts` |
| OP10-098 Liberation | qa_op10.md:211, qa_op10.md:215 | `opt-954-negation-scope.test.ts` |
| OP09-068 Chopper | qa_op09.md:290 | `opt-954-negation-scope.test.ts` |
| OP09-084 Catarina Devon | qa_op09.md:297 | `opt-954-negation-scope.test.ts` |
| OP09-081 Teach (Leader) | qa_op09.md:125, qa_op09.md:129 | `opt-954-negation-scope.test.ts`, `opt-260-trigger-type-negation.test.ts` |
| OP06-074 Zephyr | qa_op06.md:206, qa_op06.md:218 | `opt-954-negation-scope.test.ts` |
| Negated Nami Leader deck-out | qa_op09.md:162, qa_op09.md:204 | `opt-949-win-instead.test.ts` |
| OP12-099 Kalgara CANNOT_DRAW | OPT-910 | `opt-910-resolved-prohibitions.test.ts` |
| Conditional flag bounds | OPT-1012 | `opt-1012-flag-duration-bound.test.ts` |
