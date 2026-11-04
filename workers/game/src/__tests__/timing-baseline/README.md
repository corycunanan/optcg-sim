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
| FAQ qa_op10.md:279-281 OP10-042 Usopp: Franky's [On K.O.] plays Rebecca before the Leader's [Opponent's Turn] effect activates; the Leader's effect "will always activate before the [On Play] effect" of Rebecca. | | | | | Official ruling that makes the permissive "can" in 8-6-1-1 a required order. Note: rule 8-6-1-1 is written for the turn player; this fixture uses the non-turn player because that is the FAQ's scenario, and the FAQ carries the expectation. | |

Stand-ins: p1 `SYN-FRANKY` ([On K.O.]: play `SYN-REBECCA` from hand; F2b uses `up_to: 1` for a prompt), p1 Leader `SYN-USOPP-LEADER` (custom trigger `ANY_CHARACTER_KO` with `filter.controller: "SELF"`, `turn_restriction: "OPPONENT_TURN"`: draw 1), `SYN-REBECCA` ([On Play]: +1000 power to itself). Turn player p0 K.O.s SYN-FRANKY with an [Activate: Main] effect on a p0 Character (`KO` target by name). The ordering prompt is a `PLAYER_CHOICE` on p1; choose the Franky entry.

Expected: `CARD_PLAYED`(p1) → `CARD_DRAWN`(p1) → `POWER_MODIFIED`(p1). Owner if red: OPT-966.

### F3 — End Phase: two waves, then three expiry stages

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 6-6-1-1 (line 607), 6-6-1-1-2 (line 611): all [End of Your Turn] effects activate and resolve, then all [End of Your Opponent's Turn] effects. | At End Phase entry, while `turn.activePlayerIndex` is still the ending player. | none | Each wave's owner orders their own effects (6-6-1-1-3/4). | Wave 1 (ending player) completes before wave 2 (opponent); both before 6-6-1-2 expiry and before hand-off (6-6-1-4, line 624). | `CARD_DRAWN`(p0) → `CARD_DRAWN`(p1) → `TURN_ENDED`; while each draw resolves the active player is still p0. | `end-phase-order.test.ts` F3a |
| Rule 6-6-1-2 (line 617) step 1 and Decision 9 (rev4 §10): turn player's scheduled end-of-turn effects, then the turn player's "until end of turn" expiry; step 2 the same for the non-turn player. Rule 6-6-1-3 (line 622): then "during this turn" expiry, turn player first. | After both waves. | none | none | A scheduled `END_OF_THIS_TURN` action resolves **before** a `THIS_TURN` modifier it depends on expires. | p0's scheduled conditional draw happens (`CARD_DRAWN` p0 after the waves) and the `THIS_TURN` modifier is gone after hand-off. | `end-phase-order.test.ts` F3b |
| FAQ qa_op10.md:14-16 (OP10-003 Sugar; leg-7 R40): the [End of Your Turn] effect "activates before the power returns to normal". | | | | | Wave-time condition sees the live modifier. | F3a's p0 effect is conditional on power ≥ 5000 under a THIS_TURN +1000 on a 4000 base. |

Stand-ins: p0 `SYN-EOYT` ([End of Your Turn] (`keyword: "END_OF_YOUR_TURN"`), `conditions: POWER_MIN 5000 on SELF`, action draw 1) with a `THIS_TURN` +1000 `activeEffects` entry on it (base 4000); p1 `SYN-EOOT` ([End of Your Opponent's Turn] (`keyword: "END_OF_OPPONENT_TURN"`), draw 1). F3b: p0 `scheduledActions` entry `{ timing: "END_OF_THIS_TURN", action: DRAW 1 with conditions POWER_MIN 5000 on SYN-EOYT }` and the same THIS_TURN modifier.

Expected F3a: both draws occur; order p0 then p1; both before `TURN_ENDED`. Expected F3b: the scheduled draw occurs; after the turn the modifier is expired. Engine note: `phases.ts` `runEndPhase` has no wave (comment only) and calls `expireEndOfTurnEffects` before `processScheduledActions`, so both are expected red. Owner: OPT-962 (PR 4, OPT-924).

### F4 — Brook delayed deck-out resolves at the end-of-turn boundary, after the effect that emptied the deck finishes

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| OP15-022 text (`docs/cards/OP-15.md:158`): "You lose at the end of the turn in which your deck becomes 0 cards." Rule 1-3-1 (line 57): card text over rules. Rule 6-6-1-4 (line 624): the turn ends only after all End Phase processing. | Deck reaches 0 during p0's Main Phase; loss evaluated at the end of that turn, inside p0's End Phase. | none | none | The deck-emptying effect's remaining instruction still resolves (FAQ faq_op15-eb04.md:146-148, leg-7 R44). The loss is written **before** the turn ends: `GAME_OVER` precedes `TURN_ENDED` p0, and no `TURN_STARTED` p1 ever appears. | After MILL 2 → +1000: `POWER_MODIFIED` present, `status === "IN_PROGRESS"`. After `ADVANCE_PHASE` from MAIN: `status === "FINISHED"`, `winner === 1`, `GAME_OVER` present and **before** `TURN_ENDED:p0`; no `TURN_STARTED:p1`. | `end-phase-order.test.ts` F4 |

Existing guard to keep: `opt-229-brook-delayed-deck-loss.test.ts`.

### F5 — Four-step order inside one damage point (Decision 2)

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 7-1-4-1-1-2 (line 670): Life check, top Life card to hand, the defender "may choose to reveal the card and activate its [Trigger] instead". Rule 8-6-2-1 (line 864): the Trigger suspends damage processing. Rule 8-6-2 (line 862): other effects fulfilled during damage processing activate after all damage processing. | Per damage point, at the Life check. | Trigger: defender; attacker effect: attacker. | Defender chooses the Trigger. | 1 Life check → 2 attacker's "when this attack deals damage to Life" effect → 3 defender's Trigger choice → 4 defender's "when you take damage" effect, after the last point. | `DAMAGE_DEALT` → attacker's `CARD_TRASHED` (mill) → `REVEAL_TRIGGER` prompt pending for p1 with no p1 `CARD_DRAWN` yet → (accept) `TRIGGER_ACTIVATED` + `CARD_ADDED_TO_LIFE` → p1 `CARD_DRAWN`. | `damage-window-order.test.ts` F5a (accept), F5b (decline: `CARD_ADDED_TO_HAND_FROM_LIFE` p1 replaces the Trigger events) |
| FAQ qa_op03.md:92-96 (OP03-040), :99-103 (OP03-041), :134-136 (OP03-051 Bell-mère; :129-133 is Zeff's identical answer): "First, your opponent checks their Life … then this effect activates. After that, if the checked Life card has a [Trigger], your opponent can choose to activate it." | | | | | Attacker effect before Trigger choice. | |
| FAQ qa_op13.md:13-15 (OP13-002 Ace): "the [Trigger] effect will always be processed first … This Leader's 'when taking damage' effect activates after the [Trigger] effect is resolved." | | | | | Defender's own effect after the Trigger. | |

Stand-ins: p0 Leader `SYN-NAMI` (custom trigger `ATTACK_DEALS_DAMAGE`, `filter.attacker: "SELF"`, action MILL 1, not optional); p1 Leader `SYN-ACE` (custom trigger `DAMAGE_TAKEN`, `filter.controller: "SELF"`, action DRAW 1, no DON condition); p1 top Life `SYN-TRIGGER-LIFE` ([Trigger]: `ADD_TO_LIFE_FROM_DECK` 1, so the Trigger's own event is distinct). p0 Leader attacks p1 Leader; p1 passes Block and Counter; drive through `SessionCoordinator.executeAction` so the `REVEAL_TRIGGER` prompt surfaces.

Expected: as the Observable column. Engine note: `runPipeline` step 5 fires both `DAMAGE_DEALT` watchers while `battle.pendingTriggerLifeCard` is parked and before the coordinator surfaces the Trigger prompt, so step 4 is expected to run before step 3 today. Owner: OPT-963 (PR 5, OPT-941 damage frame) per Decision 2.

### F6 — OP13-002 Ace alone: Trigger before the defender's own taking-damage effect

Same clauses as F5 row 3 (qa_op13.md:13-15; rules 8-6-2, 8-6-2-1). No attacker effect. Expected: `REVEAL_TRIGGER` prompt pending for p1 with no p1 `CARD_DRAWN`; after accept, `TRIGGER_ACTIVATED` precedes `CARD_DRAWN`(p1). `damage-window-order.test.ts` F6. Owner if red: OPT-963.

### F7 — Enel OP05-098: the defender's effect resolves once, after both Double Attack points and the Damage Step end

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| OP05-098 text (`docs/cards/OP-05.md:709`): [Opponent's Turn] [Once Per Turn] When your number of Life cards becomes 0, add 1 card from the top of your deck to the top of your Life cards. Then, trash 1 card from your hand. Rule 8-6-2 (line 862). Rule 7-1-4-1-1-3 (line 672): repeat 7-1-4-1-1-2 per damage. | Life becomes 0 on point 1; effect activates after all damage processing. | none | none | After both points and `END_OF_BATTLE`. | `DAMAGE_DEALT` ×2, then Enel's effect exactly once after the second `DAMAGE_DEALT` and after the Damage Step ended (`turn.battle` null when it resolves; observed through the marker draw after the last `DAMAGE_DEALT`); final p1 Life = 1; `status === "IN_PROGRESS"`. The relative position of `END_OF_BATTLE` is engine-derived and is not asserted. | `damage-window-order.test.ts` F7 |
| FAQ qa_op05.md:237-239: "After you have taken 2 damage and the Damage Step has ended, you can then use this [Opponent's Turn] effect." | | | | | | |

Stand-ins: p0 `CHAR-DATK` (helpers) attacking p1 Leader; p1 Leader `SYN-ENEL` (custom trigger `LIFE_COUNT_BECOMES_ZERO`, `filter.controller: "SELF"`, `turn_restriction: "OPPONENT_TURN"`, `once_per_turn: true`, action `ADD_TO_LIFE_FROM_DECK` 1; omit the hand trash); p1 Life = one non-Trigger card.

### F8 — Double Attack: a Trigger on point 1 changes the Life count before point 2's Life check

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 7-1-4-1-1-3 (line 672) with 8-6-2-1 (line 864): point 1's Trigger resolves inside point 1; point 2 repeats the Life check on the Life area as it then is. Rule 7-1-4-1-1-1 (line 668): the 0-Life defeat check is at the point damage is determined, once per attack (qa_rules.md:156-158, OPT-886). | Point 1 Life check; Trigger; point 2 Life check. | none | Defender accepts the Trigger. | Trigger's `ADD_TO_LIFE_FROM_DECK` lands before point 2. | F8a (Life = [Trigger, Vanilla]): after accept, point 2 takes the newly added card; final Life = [Vanilla], hand +1, no defeat. F8b (Life = [Trigger] only): point 2 takes the added card; final Life = 0, `status === "IN_PROGRESS"`, no `GAME_OVER`. | `damage-window-order.test.ts` F8a/F8b |
| FAQ qa_op03.md:283-285 (OP03-118 Ikoku Sovereignty): "You will activate the [Trigger] before the second damage, add a card to your Life cards, and then process the second damage." Also qa_rules.md Keyword Effects (leg-7 R8). | | | | | | |

Existing regressions to keep unchanged: `pipeline.test.ts:669` and `opt-239-double-attack-damage-split.test.ts:353` (OPT-886).

### F9 — Sugar OP04-024: a pending auto effect whose source left the field before activation does not activate

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 8-1-3-1-3 (line 710): an auto effect "will not activate and cannot be resolved even if the activation timing is fulfilled if the card that fulfilled the activation timing of that auto effect moves to another area before that effect is activated." Rule 8-6-1 (line 858): turn player's effect (Marco's [On Play]) resolves first. | `CARD_PLAYED` fulfils both Marco's [On Play] (p0, turn player) and Sugar's [Opponent's Turn] (p1). | none | none | Marco's K.O. of Sugar resolves first; Sugar's effect must then not activate. | p1 gets no `CARD_DRAWN`; Sugar is in p1's trash. | `source-left-pair.test.ts` F9 |
| FAQ qa_op04.md:107-109: Sugar K.O.'d by Marco's [On Play] → "No, you cannot" activate Sugar's [Opponent's Turn] effect. | | | | | | |

Stand-ins: p1 `SYN-SUGAR` (custom trigger `CHARACTER_PLAYED`, `filter.controller: "OPPONENT"`, `turn_restriction: "OPPONENT_TURN"`, action DRAW 1); p0 plays `SYN-MARCO` ([On Play]: `KO` target opponent Character filtered by name "SYN-SUGAR"). Positive control (same file, plain `it`): p0 plays a vanilla Character instead of Marco; Sugar stays on the field and its effect resolves (`CARD_DRAWN` p1), proving the absence in F9 is caused by the K.O. and not by a dead trigger. Owner if red: OPT-964 (PR 6, OPT-937, Decision 1).

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
| FAQ qa_rules.md:59-61 (Basic Rules; leg-7 R20): "At the end of each step, if the Character that is attacking or is the target of an attack has moved to another area, the battle ends without proceeding to the next step." | | | | | | |

Stand-ins: p1 `SYN-ON-OPP-ATTACK-KO` ([On Your Opponent's Attack]: `KO` target opponent Character filtered by name of the attacker), p0 attacker `CHAR-VANILLA`; F11b: p1 `SYN-BLOCKER-ONBLOCK` ([Blocker]; [On Block]: `KO` up to 1 opponent Character, prompt). Owner if red: OPT-967 (PR 9, OPT-951, Decision 6).

### F12 — OP06-116 Reject: the defender's Trigger window completes before the activator's "Then" adds from the activator's Life

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| OP06-116 text (`docs/cards/OP-06.md`): "[Main] Choose one: … If your opponent has 1 Life card, deal 1 damage to your opponent. Then, add 1 card from the top of your Life cards to your hand." Rule 8-6-2-1 (line 864): the Trigger suspends damage processing; Decision 2 (rev4 §10): the Trigger choice is inside the damage point, before the next instruction. | Condition "opponent has 1 Life" evaluated when the damage instruction resolves. | none | p1 chooses the Trigger; p0's add has no choice. | Damage → p1's Trigger window (accept or decline) → only then `LIFE_TO_HAND` from **p0's** Life. The two Life areas stay distinct. | While the `REVEAL_TRIGGER` prompt is pending for p1: p0 Life still 2, p1 Life 0. Accept: `TRIGGER_ACTIVATED`(p1) → p0 Life 1 and p0 hand +1 (the p0 Life card's instance). Decline: `CARD_ADDED_TO_HAND_FROM_LIFE`(p1) → p0 Life 1. In both: p1 hand/trash hold p1's card, p0 hand holds p0's. | `op06-116-reject.test.ts` F12a (accept), F12b (decline), F12c (accept after a reload between the choice and the Trigger reply) |
| FAQ qa_op06.md:367-371: option 2 chosen while the opponent did **not** have 1 Life → "No, you cannot" add from your Life. | Condition false → neither damage nor add. | | | | p1 Life 2 → unchanged; p0 Life unchanged; no `CARD_ADDED_TO_HAND_FROM_LIFE`. | `op06-116-reject.test.ts` F12d (ticket OPT-970) |

Use the real `OP06_116_REJECT` schema in cardDb. F12d carries a positive control in the same test: with p1 at exactly 1 Life (non-Trigger card) the damage and the add both happen (p1 Life 0, p0 Life 1), so the absence asserted for 2 Life is caused by the condition. p0 hand holds one OP06-116 instance; p0 Life = two vanilla cards; p1 Life = one `SYN-TRIGGER-LIFE`. Play the Event (`PLAY_CARD` → `PLAYER_CHOICE` prompt, choose option index 1), drive through `SessionCoordinator.executeAction` and `resumePromptLifecycle` so the Trigger prompt surfaces. Engine note: `battle-actions.ts` `executeDealDamage` parks the Trigger in `turn.pendingTriggerFromEffect` and the resolver continues the chain; `coordinator.ts` `surfaceRevealTrigger` only acts on an empty stack, so F12a-c are expected red. Owner: OPT-963 (PR 5, OPT-941/OPT-926, Decision 2 Phase 1 acceptance).


### F13 — ST13-002 with Kalgara: an effect newly fulfilled inside the End of Your Turn wave resolves in that wave

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| ST13-002 text (`docs/cards/ST-13.md:14`): "[End of Your Turn] Trash all your face-up Life cards." Rule 6-6-1-1 (line 607), 6-6-1-1-2 (line 611), 6-6-1-1-3 (turn player orders their own wave). Rule 8-6-1 (line 858): a timing fulfilled while the turn player resolves an effect is the turn player's to resolve next. Decision 9 (rev4 §10): "Newly fulfilled End of Your Turn effects stay in their wave, bounded by the engine budget." | Ace's wave effect trashes a face-up Life card; that removal fulfils Kalgara's [Your Turn] "when a card is removed from your Life cards, draw 1" while it is still p0's turn. | none | none | Kalgara's draw resolves inside p0's wave, before the opponent's wave and before hand-off; Kalgara's own "cannot draw" prohibition bounds the loop (no second draw). | `CARD_REMOVED_FROM_LIFE`/`CARD_TRASHED` p0 → `CARD_DRAWN` p0, both before `TURN_ENDED:p0`; exactly one p0 draw; the face-up Life card is in p0's trash. | `end-phase-order.test.ts` F13 |
| OP12-099 Kalgara text (`docs/cards/OP-12.md:606`); FAQ qa_st-13.md:13-15 (face-up cards placed by any effect are trashed). | | | | | | |

Use the real `ST13_002_PORTGAS_D_ACE` (`schemas/st13.ts`) as p0's Leader and the real OP12-099 schema from `schemas/op12.ts` as a p0 Character; p0 Life holds one face-up card. Owner if red: OPT-962 (PR 4, OPT-924).

### F14 — Three expiry stages per player after the two waves

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 6-6-1-2 (line 617) step 1: the turn player's "at the end of this turn" processing, then the turn player's "until end of turn / End Phase" effects become invalid; step 2: the same for the non-turn player. Rule 6-6-1-3 (line 622): then "during this turn" expiry, turn player first. Decision 9 (rev4 §10): scheduled end-of-turn effects are the "at the end of this turn" processing of their controller. | After both waves. | none | none | Stage 1: p0's scheduled action, then p0's until-end expiry. Stage 2: p1's scheduled action, then p1's until-end expiry. Stage 3: "during this turn" expiry for both. | **Observation 1 (stage 1 before stage 2):** p0's scheduled draw is conditioned on p1's Character `c1a` being at 5000+, which holds only while p1's "until end of your opponent's turn" +1000 is still live. **Observation 2 (stage 1 expiry before stage 2, stage 2 before stage 3):** p1's scheduled draw is conditioned on p0's `c0` being back at 4000 (p0's "until end of turn" +1000 already gone) **and** on `c1b` specifically (card name `SYN-DURING-THIS-TURN`) still being at 5000+ (its "during this turn" +1000 still live); the name filter keeps `c1a` and the Leader from satisfying the clause. Expected: `CARD_DRAWN` p0 then `CARD_DRAWN` p1, both before `TURN_ENDED:p0`; all three modifiers gone after the turn. A mutant that runs all expiry after both scheduled actions fails observation 2; a mutant that runs all expiry before any scheduled action fails observation 1; a mutant that expires every `THIS_TURN` modifier right after p0's action (stage 3 collapsed into stage 1) fails observation 2 (all three proven, PR body M8a/M8b/M8c). | `end-phase-order.test.ts` F14 |
| FAQ qa_op10.md:14-16 (OP10-003 Sugar): an [End of Your Turn] effect checks power before "during this turn" power returns to normal. | | | | | | |

Stand-in: p0 `c0` (base 4000) with a `THIS_TURN` +1000 standing in for "until end of turn"; p1 `c1a` with a `UNTIL_END_OF_OPPONENT_NEXT_END_PHASE` +1000 standing in for "until end of your opponent's turn"; p1 `c1b` with a `THIS_TURN` +1000 standing in for "during this turn". `SELF_POWER` reads the scheduled entry's source card, so p0's entry names `c1a` and p1's entry names `c0`; p1's second leg uses `CARD_ON_FIELD` filtered by `c1b`'s name and `power_min: 5000`. Modelling gap: see §3.1. Owner if red: OPT-962.

### F13b — Loop budget: an End of Your Turn wave that re-fulfils itself

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rev4 §7 (ST13-002 row): "An End of Your Turn effect newly fulfilled within a wave resolves in that wave before advancing; use ST13-002 … and the loop budget." Decision 5 (rev4 §10): "Budget exhaustion is an engine-limit outcome, distinct from a rule 11-1-1-1 draw." Rule 11-1-1-1 (`rule_comprehensive.md`, §11-1): a draw applies only when neither player can stop the loop. | Ace's wave trashes the face-up Life card; `SYN-LIFE-LOOPER` ("when a card is removed from your Life: add 1 from deck to Life face-up, then trash 1 Life card") re-fulfils itself on every removal. | none | none | The engine budget ends the wave. Constants: `MAX_RESOLUTION_ACTIONS = 1_000` (`engine-limits.ts:9`), `DEFAULT_ACTION_BUDGET = 1_000` (`execution-context.ts:3`), `MAX_EFFECT_STACK_DEPTH = 100` (`engine-limits.ts:8`). | **Guard (F13b-guard):** terminal state, `pendingPrompt` null, empty stack, `engineOutcome.diagnostic.kind` is `ACTION_BUDGET` or `STACK_DEPTH`, `actionBudget.consumed ≤ limit + 1`, exactly one `GAME_OVER`. **Ratchet (F13b-ratchet, OPT-960, Decision 5):** `engineOutcome.type` is an engine-limit outcome, not `INFINITE_LOOP_DRAW`, and `winReason` is not a draw. | `end-phase-order.test.ts` "F13 loop guard" / "F13 loop ratchet" |

Deck of 1,200 cards so the deck never ends the loop. Owner of the ratchet: OPT-960 (PR 2, OPT-949, Decision 5); flipped to a guard there.

### F15 — OP06-116 with a nested prompt inside the accepted Trigger, then a reload before the nested reply

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 8-6-2-1 (line 864); Decision 2 (rev4 §10): the Trigger choice completes, including the Trigger effect's own prompts, before the next instruction. OP06-116 text. | p1's accepted Trigger effect opens its own `SELECT_TARGET` (K.O. up to 1 opposing Character). | none | p1 chooses the K.O. target after a reload. | Damage → Trigger window → accept → nested prompt → reload → reply → only then p0's `LIFE_TO_HAND`. | While the nested `SELECT_TARGET` is pending (before and after reload): p0 Life still 2. After the reply: the chosen p0 Character is in p0's trash, then p0 Life 1 and p0 hand holds the p0 Life card. Life areas distinct. | `op06-116-reject.test.ts` F15 |

Stand-in Trigger Life card: `SYN-TRIGGER-KO` ([Trigger]: `KO` target opponent Character `count: { up_to: 1 }`). Owner if red: OPT-963.

### F16 — Simultaneous defeat at one checkpoint is a draw; sequential defeat stops at the first terminal checkpoint

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 9-2-1 (line 880): "if any player fulfills any of the defeat conditions below, all of those players lose the game" (→ draw when both). Rule 9-2-1-2 (line 884): 0 cards in deck. Rule 9-1-2 (line 876): rule processing is immediate. Rule 1-2-1 (line 35): when the opponent loses, the player who has not lost wins. Decision 3 (rev4 §10): evaluate both players at the same checkpoint; never run later instructions to manufacture simultaneous defeat. | F16a (synthetic checkpoint, labelled synthetic): both decks already empty when rule processing runs. F16b: instruction 1 empties p1's deck; instruction 2 would empty p0's. | none | none | F16a: one joint evaluation → draw. F16b: play stops after instruction 1; instruction 2 never runs. | F16a: `status === "FINISHED"`, `winner === null`. F16b: `status === "FINISHED"`, `winner === 0`, p0's deck still holds its card (instruction 2 did not run). | `defeat-checkpoint.test.ts` F16a (guard or ratchet per engine), F16b |

F16b stand-in: p0 Character with [Activate: Main]: `OPPONENT_ACTION { MILL 1 }` then `THEN` `MILL 1`; p1 deck = 1 card, p0 deck = 1 card. Owner if red: OPT-960 (PR 2, OPT-949/OPT-862, Decision 3).

### F17 — Double Attack: the defender's "when you take damage" effect resolves once, after the last damage point

| Card/rule clause | Condition and evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test/evidence |
|---|---|---|---|---|---|---|
| Rule 8-6-2 (line 862): an effect fulfilled during damage processing activates after all damage processing. Rule 7-1-4-1-1-3 (line 672): the damage points are one damage processing. Decision 2 (rev4 §10): defender's "when you take damage" effect "queued once per attack after the last damage point (rule 8-6-2; OP05-098 Enel)". FAQ qa_op05.md:237-239 (Enel, after both hits); qa_op03.md:111-113 (Gaimon: one activation for a 2-damage Double Attack, attacker side). | Fulfilled once by the attack; resolves after all points. | none | none | After both points. | Exactly one p1 `CARD_DRAWN`, after the second `DAMAGE_DEALT`; p1 Life 0 (from 2); `IN_PROGRESS`. | `damage-window-order.test.ts` F17 |

Stand-in: p1 Leader `SYN-TAKE-DAMAGE` (custom trigger `DAMAGE_TAKEN`, no filter, see §3.1; action DRAW 1); p0 `CHAR-DATK`; p1 Life = two non-Trigger cards. Owner: OPT-973.

## 3. Status after the first run (base `03071b6914c36349d0e81930a6f80bb530c713d9`)

| Fixture | Status | What the engine did (event order, first occurrence) |
|---|---|---|
| F1a | ratchet (OPT-966) | `CARD_PLAYED` p0 → `POWER_MODIFIED` p0 → `CARD_DRAWN` p1: A → C → X. `pipeline.ts` `processTriggerQueuePipeline` front-inserts C before X. |
| F1b | ratchet (OPT-966) | Same as F1a with the prompt inside A answered immediately. |
| F1c | ratchet (OPT-966) | Same as F1a after a reload before the reply. |
| F2a | ratchet (OPT-966) | `CARD_KO` p1 → `CARD_PLAYED` p1 → `POWER_MODIFIED` p1 → `CARD_DRAWN` p1: A → C → B. |
| F2b | ratchet (OPT-966) | Same as F2a with the prompt inside A. |
| F2c | ratchet (OPT-966) | Same as F2a after a reload. |
| F3a | guard (flipped by OPT-962) | Base: `TURN_ENDED` p0 → `TURN_STARTED` p1 → one `CARD_DRAWN` p1 during p1's turn; no p0 draw. OPT-924 runs both waves inside the End Phase: `CARD_DRAWN` p0 → `CARD_DRAWN` p1 → `TURN_ENDED` p0. |
| F3b | guard (flipped by OPT-962) | Base: no draw (expiry before obligations). OPT-924: step 1 draws, then 6-6-1-3 expires the `THIS_TURN` modifier. |
| F4 | guard (flipped by OPT-962) | Base: the loss was written after hand-off. OPT-924 writes it at the 6-6-1-4 boundary inside p0's End Phase; the turn never ends, so no `TURN_ENDED:p0` and no `TURN_STARTED:p1`. The base assertion `GAME_OVER` before `TURN_ENDED:p0` required a `TURN_ENDED` logged after `GAME_OVER`; OPT-962 asserts its absence instead (rule 6-6-1-4 line 624 is not reached once the game is over; `terminal.ts` logs nothing after `GAME_OVER`). |
| F5a | guard (flipped by OPT-963) | Base: `DAMAGE_DEALT` → `TRIGGER_ACTIVATED` (offer) → `CARD_TRASHED` p0 → `CARD_DRAWN` p1 (wrong) → `REVEAL_TRIGGER` prompt. OPT-963: the BATTLE_DAMAGE frame resolves the attacker's `ATTACK_DEALS_DAMAGE` class before the `REVEAL_TRIGGER` prompt and defers the defender's `DAMAGE_TAKEN` watcher until the sequence completes (rule 8-6-2): `DAMAGE_DEALT` → `CARD_TRASHED` p0 → prompt → `TRIGGER_ACTIVATED` → `CARD_DRAWN` p1. |
| F5b | guard (flipped by OPT-963) | Base: same early p1 draw before the decline. OPT-963: decline → `CARD_ADDED_TO_HAND_FROM_LIFE` p1 → `CARD_DRAWN` p1. |
| F6 | guard (flipped by OPT-963) | Base: p1 `CARD_DRAWN` before the `REVEAL_TRIGGER` prompt exists. OPT-963: the prompt first, Ace's draw after the Trigger. |
| F7 | guard | `DAMAGE_DEALT` ×2 → `END_OF_BATTLE` → one p1 draw marker; final Life 1, `IN_PROGRESS`. |
| F8a | guard | After the accepted Trigger, point 2 takes the card the Trigger added; final Life `[Vanilla]`, hand +1, no defeat. |
| F8b | guard | Final Life 0, `IN_PROGRESS`, no `GAME_OVER`. |
| F9 | ratchet (OPT-964) | `CARD_PLAYED` p0 → `CARD_KO` p1 → `CARD_DRAWN` p1: Sugar's effect activated after Sugar left the field. |
| F10 | guard | Scheduled `SET_DON_ACTIVE` ran at End Phase after Pink was K.O.'d; the rested DON!! became active. |
| F11a | ratchet (OPT-967) | `ATTACK_DECLARED` → `PHASE_CHANGED` (to BLOCK_STEP) → `CARD_KO`; battle stays in `BLOCK_STEP`, no `END_OF_BATTLE`. |
| F11b | ratchet (OPT-967) | `BLOCK_DECLARED` → … → `CARD_KO`; battle enters `COUNTER_STEP`. |
| F12a | guard (flipped by OPT-963) | Base: the `REVEAL_TRIGGER` prompt surfaces with p0 Life already 1. OPT-963: `DEAL_DAMAGE` pauses on its EFFECT_DAMAGE frame with the chain parked below; p0 Life stays 2 until the window closes, then `LIFE_TO_HAND`. |
| F12b | guard (flipped by OPT-963) | Base: same as F12a, decline path. OPT-963: as F12a. |
| F12c | guard (flipped by OPT-963) | Base: same as F12a across a reload. OPT-963: the EFFECT_DAMAGE frame and its parent chain reload through the version 3 reader; as F12a. |
| F12d | ratchet (OPT-970) | With p1 at 2 Life the `DEAL_DAMAGE` condition is false, yet the `THEN`-chained `LIFE_TO_HAND` still moved p0's top Life to hand. FAQ qa_op06.md:367-371 says it cannot. |

| F12d control | guard | p1 at exactly 1 Life: damage and add both happen (p1 Life 0, p0 Life 1, p0 hand +1). |
| F9 control | guard | p0 plays a vanilla Character: Sugar stays and its effect resolves (`CARD_DRAWN` p1). |
| F13 | guard (flipped by OPT-962) | Base: Ace's wave effect ran after hand-off, so Kalgara declined. OPT-924: removal → Kalgara's single draw → `TURN_ENDED` p0. |
| F14 | guard (flipped by OPT-962) | Base: no draw for either player. OPT-924: p0 draws (step 1), then p1 draws (step 2), both before `TURN_ENDED`. Stand-in change: `c0`'s modifier is now `UNTIL_END_OF_YOUR_NEXT_TURN` (see §3.1); assertions unchanged. |
| F13b guard | guard | Loop terminated in 48 ms at `ACTION_BUDGET` limit 1000 / observed 1001 (`TRASH_FROM_LIFE` from `looper`), 500 Life removals, 700 deck cards left, `FINISHED`, no prompt, empty stack, one `GAME_OVER`. |
| F13b ratchet | guard (flipped by OPT-960) | Base: outcome was `INFINITE_LOOP_DRAW` with winReason "Unstoppable loop detected — game ends in a draw", a rules draw. OPT-960 writes `engineOutcome.type: "ENGINE_LIMIT"` with winReason "Engine resolution limit reached — the game ended with no winner". |
| F15 | guard (flipped by OPT-963) | Base: p0 Life already 1 while the nested prompt is pending. OPT-963: the frame moves to `TRIGGER_EFFECT` below the Trigger's `SELECT_TARGET` frame; p0 Life stays 2 across the reload and the reply, then the K.O. and the Life-to-hand. |
| F16a | guard (synthetic checkpoint) | Both decks empty at rule processing → `FINISHED`, winner `null`. |
| F16b | guard (flipped by OPT-960) | Base: `CARD_TRASHED` p1 → `CARD_TRASHED` p0 → `GAME_OVER` with winner `null`; the second MILL ran after p1 had already met the defeat condition, manufacturing a draw. OPT-960: the checkpoint after the `OPPONENT_ACTION` MILL ends play; winner 0, p0's deck keeps its card. |
| F17 | guard (flipped by OPT-973) | OPT-963 measured duplicate `DAMAGE_TAKEN` matches, which parked the defender behind an ordering prompt. OPT-973 matches the first damage point only; existing damage deferral releases one activation after the final point. Single damage, one-Life Double Attack, and restored first-/second-point Trigger accept/decline cases guard the boundary. |

No fixture carries an "assumed" status. Decision 7's replacement-precedence fixture (rule 8-1-3-4-2, assumed literal reading) belongs to OPT-968 and is not in this baseline.

### 3.1 Deviations from §2 recorded during authoring

* **F10 stand-in.** An attacking Character is not K.O.'d by a stronger defender (rule 7-1-4-2), so "Pink loses the battle" cannot remove it. The fixture uses a p1 [On Your Opponent's Attack] K.O. of Pink inside the same battle, after Pink's [When Attacking] scheduled its action. Rule 8-2-3's point (source gone before the scheduled action runs) is preserved.
* **F5/F6 defender filter.** `DAMAGE_DEALT` is stamped with the attacker's `playerIndex` (`battle.ts` `dealOneLeaderDamage`), and `triggers.ts:955-958` compares `filter.controller: "SELF"` against that index. A defender-side `DAMAGE_TAKEN` watcher with `filter.controller: "SELF"` therefore never matches on battle damage. The stand-in omits the filter so the fixture tests ordering only. The real OP13-002 encoding has this filter; the PR's Follow-ups record it as a confirmed dead effect (rung 4 probe: real schema with a DON!! attached, no draw; same schema without the filter, draw).
* **`ADD_TO_LIFE_FROM_DECK` emits no event.** The Trigger's effect is observed through `TRIGGER_ACTIVATED` with `payload.activated === true` and Life counts; F7 adds a marker `DRAW 1` after the add to date Enel's effect.
* **`TRIGGER_ACTIVATED` is logged twice**: once when the offer is parked (no `activated` field) and once on accept (`activated: true`). The fixtures key on `activated === true`.
* **F1a duplicate events.** On the continuous path the log holds `CARD_PLAYED` p0 and `POWER_MODIFIED` p0 twice; F1b/F1c log them once. The fixtures compare first occurrences so the duplicate cannot mask an ordering failure. Recorded in the PR's Follow-ups.
* **`THIS_TURN` single-duration modelling gap (F14), closed by OPT-962.** OPT-924 maps durations to clauses (`duration-tracker.ts` `endPhaseExpiryClause`): `THIS_TURN` is "during this turn" (6-6-1-3, line 622); the "until the end of … turn / End Phase" durations are 6-6-1-2 (line 617), expiring in their controller's step. F14's `c0` stand-in for "until the end of the turn" therefore changed from `THIS_TURN` to `UNTIL_END_OF_YOUR_NEXT_TURN` with the same `expiresAt`; its assertions did not change. The original note follows.
* **(Historical) `THIS_TURN` single-duration modelling gap (F14).** The engine has one duration, `THIS_TURN` (wave `END_OF_TURN`), for both rule phrases "until the end of the turn" (6-6-1-2) and "during this turn" (6-6-1-3), and `UNTIL_END_OF_OPPONENT_NEXT_END_PHASE` (wave `END_OF_END_PHASE`) for the non-turn player's turn-bound effects; `expireEndOfTurnEffects` (`duration-tracker.ts`) runs both waves for both players in one call. F14 uses those three durations as stand-ins for the three stages. Tagging each obligation and modifier with its rules stage is OPT-924 / OPT-962's work; until then the stand-ins are the only way to make the stages observable, and the fixture's expectation is rules-derived, not engine-derived.
* **F17 fixed by OPT-973.** `DAMAGE_TAKEN` ignores explicitly non-first battle damage points. The first-point match stays deferred until the complete damage sequence ends; controller filtering remains the separate F5/F6 limitation above.
* **F4 was a false guard in round 1.** It asserted only that no `TURN_STARTED` p1 followed `GAME_OVER`; the engine writes the loss after hand-off. It is now a ratchet asserting `GAME_OVER` before `TURN_ENDED` p0.
* **F3a active-player check.** The active player at resolution time is not observable without instrumentation; F3a asserts draw order and the `TURN_ENDED` position only.

## 4. Rules-version notes

None found during authoring. Any v1.2.1 divergence noticed later is to be recorded here, not migrated.


## OPT-1003 writer ordering renewal

The existing F1–F14 gameplay guards and event-order assertions remain intact;
round-trip expectations explicitly add8.mode 6 to ordinary runtime metadata.
End Phase stage bytes and trigger Decision 3 ordering do not change. New
`opt-1003-rules-step-expiry` tests independently fail on deployed-reader base `864bee2b`:
OP02-118 must survive through ST08-013's optional EOB KO, and Refresh conditions
must not see an expired until-next-turn power effect. The first archived Refresh
draft used an invalid array condition; only its corrected object-condition red
run is valid evidence. Prompted Refresh memory/live/undo paths retain the OP11-040
before-DON-return/set-active guard.

Frozen OPT-966/968 writer payloads and outputs are unchanged. Separately named
`opt-1003-battle-expectations.ts` specifies the new production outputs: committed
EOB prefix, then children, then BATTLE_RESOLVED/MAIN. One new completion ef ID
precedes child allocations, shifting only the named newly drawn card identities
and final counter. A terminal child cancels completion notifications and their
remaining clock ticks. Exact schedules and new identities are fixed expectations;
actual IDs, counters and events are never normalized. Late historical EOB pauses
retain their original outputs because promotion invents no completion debt.
