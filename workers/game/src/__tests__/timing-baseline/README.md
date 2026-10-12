# Timing fixture baseline (OPT-939, PR 1 of the Game Engine Consolidation)

Rules version: **v1.2.0**, repository text `docs/rules/rule_comprehensive.md` (line numbers below are in that file). The official rules are v1.2.1 (2026-08-28); Rev 3 of the proposal checked the sections used here and found them substantively unchanged. No section used here was migrated; any divergence found during authoring is listed in §4.

FAQ sources are the files under `docs/FAQs/` with line numbers.

Every expected order in this file was written by the PR owner **before** the test code and is the oracle for the test. The engine is never the oracle. A fixture that passes today is a **regression guard**. A fixture that fails today is a **ratchet** only when the rule text and the FAQ line say the engine is wrong; it is written `it.fails(...)` with the Linear id in its name (the convention already used in `opt-865-mill-cost-reencodes.test.ts`, `opt-872-battle-ko-replacement-continuation.test.ts`, `opt-903-sabo-replaced-card-power.test.ts`), so the suite stays green and a later fix flips it to `it`. A fixture whose expectation rests on an assumed reading with no official ruling is **assumed** and says so in its name.

Status per fixture is recorded in §3 after the first run against base `03071b6914c36349d0e81930a6f80bb530c713d9`.

## 1. Conventions shared by every fixture

* Drive the real pipeline (`runPipeline`) and, where a prompt must be surfaced or answered, the real session boundary (`SessionCoordinator.executeAction` for actions and Trigger replies, `resumePromptLifecycle` for prompt responses). Helper-only tests do not count.
* Observe order through `state.eventLog` (event `type` and `playerIndex`), through `pendingPrompt` at the moment it must exist, and through final zones. Do not derive expectations from the executor under test.
* "Reload" means: `JSON.parse(JSON.stringify(...))` of the three persisted values through the real writer and reader (`SessionRepository.save` then `.load` on a `MemoryStorage`), or `parseStoredSession` on the serialized session, before the response is sent. The required order must not depend on whether execution crossed a prompt boundary or a reload.
* Synthetic card schemas are allowed and must be named `SYN-*` with a comment giving the real card they stand in for. The real authored schema is used where the ticket names the card (OP06-116 imports `OP06_116_REJECT` from `../../engine/schemas/op06.js`).
* Each `describe` header repeats the rule section and FAQ line from the table below.

## 2. Fixtures and expected values

### F1 — Turn player A, opponent X, A raises turn-player C: A → X → C

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 8-6-1 (line 858): both players' timings fulfilled at once → turn player first; "If, in so doing, the activation timing of another card effect of the turn player is fulfilled, the non-turn player will first resolve their card effect … After that, the turn player will resolve their card effect." | At the event that fulfils A and X together (here `ATTACK_DECLARED`). | none | A plays C from hand (turn player chooses); X and C have no choice. | A resolves; X resolves; only then C. Same across: continuous, a prompt inside A, a reload before the prompt reply. | Event log order: `CARD_PLAYED` (A, p0) → X's effect event (p1) → C's effect event (p0). | `nested-trigger-order.test.ts` F1a/F1b/F1c |
| FAQ qa_op07.md:206-210 OP07-019 Jewelry Bonney: Doflamingo's [When Attacking] plays Jinbe, then Bonney's [On Your Opponent's Attack], then Jinbe's [On Play]. | | | | | Concrete instance of the rule. | |

Stand-ins: `SYN-A-ATTACKER` (turn player's Character, [When Attacking]: play `SYN-C-ONPLAY` from hand; F1b uses `count: { up_to: 1 }` so a `SELECT_TARGET` prompt opens inside A), `SYN-X-WATCHER` (opponent's Character, [On Your Opponent's Attack]: draw 1 → `CARD_DRAWN` p1), `SYN-C-ONPLAY` ([On Play]: +1000 power to itself → `POWER_MODIFIED` p0).

Expected: `CARD_PLAYED`(p0, SYN-C-ONPLAY) precedes `CARD_DRAWN`(p1) precedes `POWER_MODIFIED`(p0). Variant F1a continuous; F1b prompt inside A answered immediately; F1c prompt inside A answered after a reload. Engine note (not the oracle): `pipeline.ts` `processTriggerQueuePipeline` front-inserts C into the turn player's queue before X runs, so F1a is expected to fail today. Owner: OPT-966 (PR 8, OPT-944/OPT-945 one trigger executor).

### F2 — Same-player A and B, A chosen first, A raises C: A → B → C

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 8-6-1-1 (line 860): "effect A is resolved first, thereby fulfilling the activation timing of effect C, effect C can be resolved following the resolution of effect B." | At the event that fulfils A and B together (here `CARD_KO` of the non-turn player's Character by the turn player's effect). | none | The non-turn player orders A and B (prompt) and picks A. | A; then B; then C. Same across continuous, prompt inside A, reload before reply. | Event log: A's `CARD_PLAYED`(p1) → B's `CARD_DRAWN`(p1) → C's `POWER_MODIFIED`(p1). | `nested-trigger-order.test.ts` F2a/F2b/F2c |
| FAQ qa_op10.md:279-281 OP10-042 Usopp: Franky's [On K.O.] plays Rebecca before the Leader's [Opponent's Turn] effect activates; the Leader's effect "will always activate before the [On Play] effect" of Rebecca. | | | | | Official ruling that makes the permissive "can" in 8-6-1-1 a required order. | |

Stand-ins: p1 `SYN-FRANKY` ([On K.O.]: play `SYN-REBECCA` from hand; F2b uses `up_to: 1` for a prompt), p1 Leader `SYN-USOPP-LEADER` (custom trigger `ANY_CHARACTER_KO` with `filter.controller: "SELF"`, `turn_restriction: "OPPONENT_TURN"`: draw 1), `SYN-REBECCA` ([On Play]: +1000 power to itself). Turn player p0 K.O.s SYN-FRANKY with an [Activate: Main] effect on a p0 Character (`KO` target by name). The ordering prompt is a `PLAYER_CHOICE` on p1; choose the Franky entry.

Expected: `CARD_PLAYED`(p1) → `CARD_DRAWN`(p1) → `POWER_MODIFIED`(p1). Owner if red: OPT-966.

### F3 — End Phase: two waves, then three expiry stages

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 6-6-1-1 (line 607), 6-6-1-1-2 (line 611): all [End of Your Turn] effects activate and resolve, then all [End of Your Opponent's Turn] effects. | At End Phase entry, while `turn.activePlayerIndex` is still the ending player. | none | Each wave's owner orders their own effects (6-6-1-1-3/4). | Wave 1 (ending player) completes before wave 2 (opponent); both before 6-6-1-2 expiry and before hand-off (6-6-1-4, line 624). | `CARD_DRAWN`(p0) → `CARD_DRAWN`(p1) → `TURN_ENDED`; while each draw resolves the active player is still p0. | `end-phase-order.test.ts` F3a |
| Rule 6-6-1-2 (line 617) step 1 and Decision 9 (rev4 §10): turn player's scheduled end-of-turn effects, then the turn player's "until end of turn" expiry; step 2 the same for the non-turn player. Rule 6-6-1-3 (line 622): then "during this turn" expiry, turn player first. | After both waves. | none | none | A scheduled `END_OF_THIS_TURN` action resolves **before** a `THIS_TURN` modifier it depends on expires. | p0's scheduled conditional draw happens (`CARD_DRAWN` p0 after the waves) and the `THIS_TURN` modifier is gone after hand-off. | `end-phase-order.test.ts` F3b |
| FAQ qa_op10.md OP10-003 Sugar (leg-7 R40): an [End of Your Turn] effect checks power **before** a "during this turn" +power expires. | | | | | Wave-time condition sees the live modifier. | F3a's p0 effect is conditional on power ≥ 5000 under a THIS_TURN +1000 on a 4000 base. |

Stand-ins: p0 `SYN-EOYT` ([End of Your Turn] (`keyword: "END_OF_YOUR_TURN"`), `conditions: POWER_MIN 5000 on SELF`, action draw 1) with a `THIS_TURN` +1000 `activeEffects` entry on it (base 4000); p1 `SYN-EOOT` ([End of Your Opponent's Turn] (`keyword: "END_OF_OPPONENT_TURN"`), draw 1). F3b: p0 `scheduledActions` entry `{ timing: "END_OF_THIS_TURN", action: DRAW 1 with conditions POWER_MIN 5000 on SYN-EOYT }` and the same THIS_TURN modifier.

Expected F3a: both draws occur; order p0 then p1; both before `TURN_ENDED`. Expected F3b: the scheduled draw occurs; after the turn the modifier is expired. Engine note: `phases.ts` `runEndPhase` has no wave (comment only) and calls `expireEndOfTurnEffects` before `processScheduledActions`, so both are expected red. Owner: OPT-962 (PR 4, OPT-924).

### F4 — Brook delayed deck-out resolves at the end-of-turn boundary, after the effect that emptied the deck finishes

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| OP15-022 text (`docs/cards/OP-15.md`): "You lose at the end of the turn in which your deck becomes 0 cards." Rule 1-3-1 (line 57): card text over rules. Rule 6-6-1-4 (line 624): hand-off is after all End Phase processing. | Deck reaches 0 during p0's Main Phase; loss evaluated at the end of that turn. | none | none | The deck-emptying effect's remaining instruction still resolves (FAQ faq_op15-eb04.md Brook, leg-7 R44). Loss is written at End Phase, before `TURN_STARTED` for p1. | After MILL 2 → +1000: `POWER_MODIFIED` present, `status === "IN_PROGRESS"`. After `ADVANCE_PHASE` from MAIN: `status === "FINISHED"`, `winner === 1`, `GAME_OVER` present and no `TURN_STARTED` for p1 after it. | `end-phase-order.test.ts` F4 |

Existing guard to keep: `opt-229-brook-delayed-deck-loss.test.ts`.

### F5 — Four-step order inside one damage point (Decision 2)

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 7-1-4-1-1-2 (line 670): Life check, top Life card to hand, the defender "may choose to reveal the card and activate its [Trigger] instead". Rule 8-6-2-1 (line 864): the Trigger suspends damage processing. Rule 8-6-2 (line 862): other effects fulfilled during damage processing activate after all damage processing. | Per damage point, at the Life check. | Trigger: defender; attacker effect: attacker. | Defender chooses the Trigger. | 1 Life check → 2 attacker's "when this attack deals damage to Life" effect → 3 defender's Trigger choice → 4 defender's "when you take damage" effect, after the last point. | `DAMAGE_DEALT` → attacker's `CARD_TRASHED` (mill) → `REVEAL_TRIGGER` prompt pending for p1 with no p1 `CARD_DRAWN` yet → (accept) `TRIGGER_ACTIVATED` + `CARD_ADDED_TO_LIFE` → p1 `CARD_DRAWN`. | `damage-window-order.test.ts` F5a (accept), F5b (decline: `CARD_ADDED_TO_HAND_FROM_LIFE` p1 replaces the Trigger events) |
| FAQ qa_op03.md:92-96 (OP03-040), :99-103 (OP03-041), :129-133 (OP03-051): "First, your opponent checks their Life … then this effect activates. After that, if the checked Life card has a [Trigger], your opponent can choose to activate it." | | | | | Attacker effect before Trigger choice. | |
| FAQ qa_op13.md:13-15 (OP13-002 Ace): "the [Trigger] effect will always be processed first … This Leader's 'when taking damage' effect activates after the [Trigger] effect is resolved." | | | | | Defender's own effect after the Trigger. | |

Stand-ins: p0 Leader `SYN-NAMI` (custom trigger `ATTACK_DEALS_DAMAGE`, `filter.attacker: "SELF"`, action MILL 1, not optional); p1 Leader `SYN-ACE` (custom trigger `DAMAGE_TAKEN`, `filter.controller: "SELF"`, action DRAW 1, no DON condition); p1 top Life `SYN-TRIGGER-LIFE` ([Trigger]: `ADD_TO_LIFE_FROM_DECK` 1, so the Trigger's own event is distinct). p0 Leader attacks p1 Leader; p1 passes Block and Counter; drive through `SessionCoordinator.executeAction` so the `REVEAL_TRIGGER` prompt surfaces.

Expected: as the Observable column. Engine note: `runPipeline` step 5 fires both `DAMAGE_DEALT` watchers while `battle.pendingTriggerLifeCard` is parked and before the coordinator surfaces the Trigger prompt, so step 4 is expected to run before step 3 today. Owner: OPT-963 (PR 5, OPT-941 damage frame) per Decision 2.

### F6 — OP13-002 Ace alone: Trigger before the defender's own taking-damage effect

Same clauses as F5 row 3 (qa_op13.md:13-15; rules 8-6-2, 8-6-2-1). No attacker effect. Expected: `REVEAL_TRIGGER` prompt pending for p1 with no p1 `CARD_DRAWN`; after accept, `TRIGGER_ACTIVATED` precedes `CARD_DRAWN`(p1). `damage-window-order.test.ts` F6. Owner if red: OPT-963.

### F7 — Enel OP05-098: the defender's effect resolves once, after both Double Attack points and the Damage Step end

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| OP05-098 text (`docs/cards/OP-05.md:709`): [Opponent's Turn] [Once Per Turn] When your number of Life cards becomes 0, add 1 card from the top of your deck to the top of your Life cards. Then, trash 1 card from your hand. Rule 8-6-2 (line 862). Rule 7-1-4-1-1-3 (line 672): repeat 7-1-4-1-1-2 per damage. | Life becomes 0 on point 1; effect activates after all damage processing. | none | none | After both points and `END_OF_BATTLE`. | `DAMAGE_DEALT` ×2 → `END_OF_BATTLE` → `CARD_ADDED_TO_LIFE`(p1) exactly once; final p1 Life = 1; `status === "IN_PROGRESS"`. | `damage-window-order.test.ts` F7 |
| FAQ qa_op05.md:237-239: "After you have taken 2 damage and the Damage Step has ended, you can then use this [Opponent's Turn] effect." | | | | | | |

Stand-ins: p0 `CHAR-DATK` (helpers) attacking p1 Leader; p1 Leader `SYN-ENEL` (custom trigger `LIFE_COUNT_BECOMES_ZERO`, `filter.controller: "SELF"`, `turn_restriction: "OPPONENT_TURN"`, `once_per_turn: true`, action `ADD_TO_LIFE_FROM_DECK` 1; omit the hand trash); p1 Life = one non-Trigger card.

### F8 — Double Attack: a Trigger on point 1 changes the Life count before point 2's Life check

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 7-1-4-1-1-3 (line 672) with 8-6-2-1 (line 864): point 1's Trigger resolves inside point 1; point 2 repeats the Life check on the Life area as it then is. Rule 7-1-4-1-1-1 (line 668): the 0-Life defeat check is at the point damage is determined, once per attack (qa_rules.md:156-158, OPT-886). | Point 1 Life check; Trigger; point 2 Life check. | none | Defender accepts the Trigger. | Trigger's `ADD_TO_LIFE_FROM_DECK` lands before point 2. | F8a (Life = [Trigger, Vanilla]): after accept, point 2 takes the newly added card; final Life = [Vanilla], hand +1, no defeat. F8b (Life = [Trigger] only): point 2 takes the added card; final Life = 0, `status === "IN_PROGRESS"`, no `GAME_OVER`. | `damage-window-order.test.ts` F8a/F8b |
| FAQ qa_op03.md OP03-118 Ikoku Sovereignty and qa_rules.md Keyword Effects (leg-7 R8): "The Trigger resolves first, the Life card is added, then hit 2 checks the next Life card." | | | | | | |

Existing regressions to keep unchanged: `pipeline.test.ts:669` and `opt-239-double-attack-damage-split.test.ts:353` (OPT-886).

### F9 — Sugar OP04-024: a pending auto effect whose source left the field before activation does not activate

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 8-1-3-1-3 (line 710): an auto effect "will not activate and cannot be resolved even if the activation timing is fulfilled if the card that fulfilled the activation timing of that auto effect moves to another area before that effect is activated." Rule 8-6-1 (line 858): turn player's effect (Marco's [On Play]) resolves first. | `CARD_PLAYED` fulfils both Marco's [On Play] (p0, turn player) and Sugar's [Opponent's Turn] (p1). | none | none | Marco's K.O. of Sugar resolves first; Sugar's effect must then not activate. | p1 gets no `CARD_DRAWN`; Sugar is in p1's trash. | `source-left-pair.test.ts` F9 |
| FAQ qa_op04.md:107-109: Sugar K.O.'d by Marco's [On Play] → "No, you cannot" activate Sugar's [Opponent's Turn] effect. | | | | | | |

Stand-ins: p1 `SYN-SUGAR` (custom trigger `CHARACTER_PLAYED`, `filter.controller: "OPPONENT"`, `turn_restriction: "OPPONENT_TURN"`, action DRAW 1); p0 plays `SYN-MARCO` ([On Play]: `KO` target opponent Character filtered by name "SYN-SUGAR"). Owner if red: OPT-964 (PR 6, OPT-937, Decision 1).

### F10 — Senor Pink OP04-026: an effect already activated still resolves after its source leaves

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 8-2-3 (line 774): effects already activated and resolved are not invalidated. OP04-026 text (`docs/cards/OP-04.md:176`): "… Then, set up to 1 of your DON!! cards as active at the end of this turn." | [When Attacking] resolved during the attack; the scheduled part runs at End Phase. | none in the stand-in | none | Scheduled action runs although the source was K.O.'d in that battle. | At End Phase one rested p0 DON!! becomes active (`DON_SET_ACTIVE` or the DON instance's state). | `source-left-pair.test.ts` F10 |
| FAQ qa_op04.md:113-115: "Yes, you can." | | | | | | |

Stand-in: p0 `SYN-SENOR-PINK` ([When Attacking]: `SCHEDULE_ACTION` timing `END_OF_THIS_TURN`, action `SET_DON_ACTIVE` amount 1, no `bound_to`), K.O.'d during the same battle by a p1 [On Your Opponent's Attack] effect (see §3.1 for why "loses the battle" cannot be used). One p0 cost-area DON!! is rested before the attack. Owner if red: OPT-964 (Decision 1).

### F11 — Step-end zone checks: the battle ends at the end of the step in which a combatant left

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 7-1-1-4 (line 640): at the end of the Attack Step, if the attacker or target has moved areas, proceed to End of Battle, not the Block Step. | After the Attack Step's effects (here p1's [On Your Opponent's Attack] K.O.s the attacker). | none | none | No Block Step. | After the K.O.: `turn.battleSubPhase === null`, `turn.battle === null`, no `SELECT_BLOCKER` prompt, no `DAMAGE_DEALT`; `END_OF_BATTLE` with `aborted: true`. | `battle-step-end.test.ts` F11a |
| Rule 7-1-2-3 (line 648): same at the end of the Block Step, including when the leave happens inside a prompt in that step (OPT-951). | p1 blocks; the blocker's [On Block] opens a `SELECT_TARGET` prompt; p1 picks the attacker; the attacker is K.O.'d. | none | p1 | After the prompt resolves: End of Battle, not Counter Step. | After the reply: `turn.battleSubPhase === null`, no Counter Step reached (no `PHASE_CHANGED` BLOCK_STEP → COUNTER_STEP), no `DAMAGE_DEALT`. | `battle-step-end.test.ts` F11b |
| Rule 7-1-3-3 (line 660): same at the end of the Counter Step. | | | | | Existing guard: `opt-243-battle-termination.test.ts:51` and `:91`. | reference only |
| FAQ qa_rules.md Basic Rules (leg-7 R20): "Yes. The battle ends without the next step." | | | | | | |

Stand-ins: p1 `SYN-ON-OPP-ATTACK-KO` ([On Your Opponent's Attack]: `KO` target opponent Character filtered by name of the attacker), p0 attacker `CHAR-VANILLA`; F11b: p1 `SYN-BLOCKER-ONBLOCK` ([Blocker]; [On Block]: `KO` up to 1 opponent Character, prompt). Owner if red: OPT-967 (PR 9, OPT-951, Decision 6).

### F12 — OP06-116 Reject: the defender's Trigger window completes before the activator's "Then" adds from the activator's Life

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| OP06-116 text (`docs/cards/OP-06.md`): "[Main] Choose one: … If your opponent has 1 Life card, deal 1 damage to your opponent. Then, add 1 card from the top of your Life cards to your hand." Rule 8-6-2-1 (line 864): the Trigger suspends damage processing; Decision 2 (rev4 §10): the Trigger choice is inside the damage point, before the next instruction. | Condition "opponent has 1 Life" evaluated when the damage instruction resolves. | none | p1 chooses the Trigger; p0's add has no choice. | Damage → p1's Trigger window (accept or decline) → only then `LIFE_TO_HAND` from **p0's** Life. The two Life areas stay distinct. | While the `REVEAL_TRIGGER` prompt is pending for p1: p0 Life still 2, p1 Life 0. Accept: `TRIGGER_ACTIVATED`(p1) → p0 Life 1 and p0 hand +1 (the p0 Life card's instance). Decline: `CARD_ADDED_TO_HAND_FROM_LIFE`(p1) → p0 Life 1. In both: p1 hand/trash hold p1's card, p0 hand holds p0's. | `op06-116-reject.test.ts` F12a (accept), F12b (decline), F12c (accept after a reload between the choice and the Trigger reply) |
| FAQ qa_op06.md:367-371: option 2 chosen while the opponent did **not** have 1 Life → "No, you cannot" add from your Life. | Condition false → neither damage nor add. | | | | p1 Life 2 → unchanged; p0 Life unchanged; no `CARD_ADDED_TO_HAND_FROM_LIFE`. | `op06-116-reject.test.ts` F12d (hypothesis check; see §3 for its status) |

Use the real `OP06_116_REJECT` schema in cardDb. p0 hand holds one OP06-116 instance; p0 Life = two vanilla cards; p1 Life = one `SYN-TRIGGER-LIFE`. Play the Event (`PLAY_CARD` → `PLAYER_CHOICE` prompt, choose option index 1), drive through `SessionCoordinator.executeAction` and `resumePromptLifecycle` so the Trigger prompt surfaces. Engine note: `battle-actions.ts` `executeDealDamage` parks the Trigger in `turn.pendingTriggerFromEffect` and the resolver continues the chain; `coordinator.ts` `surfaceRevealTrigger` only acts on an empty stack, so F12a-c are expected red. Owner: OPT-963 (PR 5, OPT-941/OPT-926, Decision 2 Phase 1 acceptance).

## 3. Status after the first run (base `03071b6914c36349d0e81930a6f80bb530c713d9`)

| Fixture | Status | What the engine did (event order, first occurrence) |
|---|---|---|
| F1a | ratchet (OPT-966) | `CARD_PLAYED` p0 → `POWER_MODIFIED` p0 → `CARD_DRAWN` p1: A → C → X. `pipeline.ts` `processTriggerQueuePipeline` front-inserts C before X. |
| F1b | ratchet (OPT-966) | Same as F1a with the prompt inside A answered immediately. |
| F1c | ratchet (OPT-966) | Same as F1a after a reload before the reply. |
| F2a | ratchet (OPT-966) | `CARD_KO` p1 → `CARD_PLAYED` p1 → `POWER_MODIFIED` p1 → `CARD_DRAWN` p1: A → C → B. |
| F2b | ratchet (OPT-966) | Same as F2a with the prompt inside A. |
| F2c | ratchet (OPT-966) | Same as F2a after a reload. |
| F3a | ratchet (OPT-962) | `TURN_ENDED` p0 → `TURN_STARTED` p1 → one `CARD_DRAWN` p1 during p1's turn; no p0 draw (the [End of Your Turn] watcher fires after hand-off). |
| F3b | ratchet (OPT-962) | No draw: `expireEndOfTurnEffects` ran before `processScheduledActions`, so the conditional scheduled draw saw 4000 power. |
| F4 | guard | `POWER_MODIFIED` present and `IN_PROGRESS` after MILL 2 → +1000; `ADVANCE_PHASE` gives `FINISHED`, winner 1, `GAME_OVER` with no `TURN_STARTED` p1 after it. |
| F5a | ratchet (OPT-963) | `DAMAGE_DEALT` → `TRIGGER_ACTIVATED` (offer) → `CARD_TRASHED` p0 (attacker effect, correct) → `CARD_DRAWN` p1 (defender effect, wrong) → `REVEAL_TRIGGER` prompt. Step 4 runs before step 3. |
| F5b | ratchet (OPT-963) | Same early p1 draw before the decline. |
| F6 | ratchet (OPT-963) | p1 `CARD_DRAWN` before the `REVEAL_TRIGGER` prompt exists. |
| F7 | guard | `DAMAGE_DEALT` ×2 → `END_OF_BATTLE` → one p1 draw marker; final Life 1, `IN_PROGRESS`. |
| F8a | guard | After the accepted Trigger, point 2 takes the card the Trigger added; final Life `[Vanilla]`, hand +1, no defeat. |
| F8b | guard | Final Life 0, `IN_PROGRESS`, no `GAME_OVER`. |
| F9 | ratchet (OPT-964) | `CARD_PLAYED` p0 → `CARD_KO` p1 → `CARD_DRAWN` p1: Sugar's effect activated after Sugar left the field. |
| F10 | guard | Scheduled `SET_DON_ACTIVE` ran at End Phase after Pink was K.O.'d; the rested DON!! became active. |
| F11a | ratchet (OPT-967) | `ATTACK_DECLARED` → `PHASE_CHANGED` (to BLOCK_STEP) → `CARD_KO`; battle stays in `BLOCK_STEP`, no `END_OF_BATTLE`. |
| F11b | ratchet (OPT-967) | `BLOCK_DECLARED` → … → `CARD_KO`; battle enters `COUNTER_STEP`. |
| F12a | ratchet (OPT-963) | The `REVEAL_TRIGGER` prompt surfaces, but p0 Life is already 1: `LIFE_TO_HAND` ran before the Trigger window. |
| F12b | ratchet (OPT-963) | Same as F12a, decline path. |
| F12c | ratchet (OPT-963) | Same as F12a across a reload. |
| F12d | ratchet (confirmed FAQ failure, no ticket yet; see the PR's Follow-ups) | With p1 at 2 Life the `DEAL_DAMAGE` condition is false, yet the `THEN`-chained `LIFE_TO_HAND` still moved p0's top Life to hand. FAQ qa_op06.md:367-371 says it cannot. |

No fixture carries an "assumed" status. Decision 7's replacement-precedence fixture (rule 8-1-3-4-2, assumed literal reading) belongs to OPT-968 and is not in this baseline.

### 3.1 Deviations from §2 recorded during authoring

* **F10 stand-in.** An attacking Character is not K.O.'d by a stronger defender (rule 7-1-4-2), so "Pink loses the battle" cannot remove it. The fixture uses a p1 [On Your Opponent's Attack] K.O. of Pink inside the same battle, after Pink's [When Attacking] scheduled its action. Rule 8-2-3's point (source gone before the scheduled action runs) is preserved.
* **F5/F6 defender filter.** `DAMAGE_DEALT` is stamped with the attacker's `playerIndex` (`battle.ts` `dealOneLeaderDamage`), and `triggers.ts:955-958` compares `filter.controller: "SELF"` against that index. A defender-side `DAMAGE_TAKEN` watcher with `filter.controller: "SELF"` therefore never matches on battle damage. The stand-in omits the filter so the fixture tests ordering only. The real OP13-002 encoding has this filter; the PR's Follow-ups record it as a confirmed dead effect (rung 4 probe: real schema with a DON!! attached, no draw; same schema without the filter, draw).
* **`ADD_TO_LIFE_FROM_DECK` emits no event.** The Trigger's effect is observed through `TRIGGER_ACTIVATED` with `payload.activated === true` and Life counts; F7 adds a marker `DRAW 1` after the add to date Enel's effect.
* **`TRIGGER_ACTIVATED` is logged twice**: once when the offer is parked (no `activated` field) and once on accept (`activated: true`). The fixtures key on `activated === true`.
* **F1a duplicate events.** On the continuous path the log holds `CARD_PLAYED` p0 and `POWER_MODIFIED` p0 twice; F1b/F1c log them once. The fixtures compare first occurrences so the duplicate cannot mask an ordering failure. Recorded in the PR's Follow-ups.
* **F3a active-player check.** The active player at resolution time is not observable without instrumentation; F3a asserts draw order and the `TURN_ENDED` position only.

## 4. Rules-version notes

None found during authoring. Any v1.2.1 divergence noticed later is to be recorded here, not migrated.
