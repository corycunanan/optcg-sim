# Game Engine Consolidation — Rules, FAQ, and Scalability Audit

**Date:** 2026-10-08 (audit); 2026-10-09 (decisions resolved, §5)
**Subject:** [Game Engine Consolidation](https://linear.app/optcg-sim/project/game-engine-consolidation-34e20fb682af), Final Proposal Revision 3 (2026-09-29)
**Baseline verified against:** `origin/main` at `4fe26c6a`, which is the proposal's own inspected baseline. Zero engine commits have landed since. The local branch `feat/shared-effect-prompt-frame` is 104 commits behind main, so every source claim below was re-checked on `origin/main`.
**Method:** Eight Haiku 5.5 audit legs, each read-only, each writing a findings table. Fable verified every High finding against the rule text, the FAQ text, and `origin/main` before accepting it. Leg reports and the proposal snapshot live in [`audits/consolidation-2026-10/`](./audits/consolidation-2026-10/).
**Sources:** `docs/rules/rule_comprehensive.md` (v1.2.0), `docs/FAQs/` (39 files, 1,257 official Q&A rulings), `docs/cards/`, `docs/game-engine/*`, engine source under `workers/game/src`.
**Supersession (2026-10-11):** the Linear proposal is now Revision 4 ([link](https://linear.app/optcg-sim/document/game-engine-consolidation-final-proposal-revision-4-0405d57abd84); snapshot at [`audits/consolidation-2026-10/proposal-rev4-snapshot.md`](./audits/consolidation-2026-10/proposal-rev4-snapshot.md)). It folds the eleven decisions below into its §§3–8 and keeps a decision register in §10. Where this report and Revision 4 differ in wording, Revision 4 is the implementation contract; this report remains the evidence. Revision 4 also adds OPT-958 (retained mid-payment rollback tracked as rules debt, reassessed at OPT-948 acceptance) and sharpens Decision 3: zero Life alone is not defeat, the checkpoint needs qualifying damage context, and conditions met at different checkpoints never accumulate into a draw.
**Corrections (2026-10-09):** two "reachable bug" claims in the 2026-10-08 text were wrong and are withdrawn. Double Attack into 1 Life was fixed by OPT-886 (PR #721, commit `bfb9d8d7`) on the baseline, and both cited tests assert the FAQ behavior. Koby OP11-001 substitute feasibility was fixed by OPT-873 (PR #728, commit `92abae6d`) with two regression tests. Every other High code claim was re-verified on `origin/main` on 2026-10-09 and holds. The withdrawn text is struck in place below, not deleted.

---

## 1. Verdict

The proposal is compatible with the core rules. Its five headline timing claims are correct, its phase order is sound, and its terminal-path, sequential-cost, and replacement-recheck directions match the rule text. The architecture decision (consolidate in place, one owner of pending work, one scheduler) does not need to be reopened.

The proposal is not yet ready to implement as written. The audit found **four High-severity gaps the rules and FAQs force into scope**, all of which fit inside the existing milestones without adding a phase. The eleven decisions those gaps raise were resolved by the project owner on 2026-10-09 and are recorded in §5. The proposal becomes implementable once its §10 carries them.

1. **Source-left rule.** §8-1-3-1-3 and seven FAQ rulings say a pending auto effect cannot activate once its source has left the field. The OPT-937 snapshot plan, read literally, lets it. The snapshot must carry identity only, and activation must re-check the source's zone.
2. **Damage-window ordering is more specific than §7 states.** The FAQs fix a four-step order inside one damage point: Life check, attacker's "deals damage" effect, defender's Trigger choice, defender's "when you take damage" effect. The §7 fixture language ("ordinary triggers wait for completion") does not say this. The OP06-116 gate the proposal calls "unreproduced" is a confirmed rule-versus-code disagreement in `coordinator.ts`.
3. **Terminal path needs a joint checkpoint, not a first-writer-wins stop.** §9-2-1 makes simultaneous defeat a draw. "Stop when status is not IN_PROGRESS" plus per-writer `terminateGame` lets whichever writer runs first win. One reachable bug sits here: effect damage drops the damaged-player flag (OPT-925 confirmed in source). ~~A second, Double Attack into 1 Life winning against the FAQ, was claimed on 2026-10-08~~ and withdrawn on 2026-10-09: OPT-886 fixed it on the baseline, and the two tests the audit cited assert no win.
4. **Battle-step windows are missing from the frame inventory.** §7-1-1-4, §7-1-2-3, and §7-1-3-3 require a zone check at the end of the Attack, Block, and Counter steps. Only Damage Step entry has one. Eleven FAQ rulings depend on Block-step closure, Counter-step legality, and attack-target lock, none of which is a named pending-work kind.

Everything else is Medium or Low and is listed in §4 with an owner milestone.

On **scalability**: the consolidation improves execution scalability. A new mechanic will inherit sequencing, choice, and persistence from one scheduler, which is exactly what a five-ability card like OP18-046 needs. It does nothing for **expressive** scalability, and three semantic contracts that power creep leans on hardest are currently unowned: a layered value model (base-power set vs modifiers), a negation-scope contract (printed vs granted vs resolved), and batch-replacement semantics (one payment per simultaneous event). Details in §6.

---

## 2. What the proposal gets right

Verified by Fable against the rule text, not taken from leg reports.

| Proposal claim | Rule | Status |
|---|---|---|
| A → X → C (turn player, then non-turn, then the newly raised turn-player effect) | §8-6-1 | Correct. Exact text: "the non-turn player will first resolve their card effect for which the activation timing has been fulfilled. After that, the turn player will resolve their card effect." |
| A → B → C (same-player pending B before newly raised C) | §8-6-1-1 | Correct in intent. The rule says C "can be resolved following the resolution of effect B." It is permissive, so confirm with a ruling before making B-before-C a hard assertion. Current `pipeline.ts:356` does `queue.unshift`, giving A → C → B. |
| End Phase: ending player's wave, then opponent's wave, then scheduled obligations and expiry, then handoff | §6-6-1-1-2, §6-6-1-2, §6-6-1-3, §6-6-1-4 | Correct order. One refinement in §4.G: the rules have three expiry steps, not one. |
| Life Trigger interrupts damage; ordinary triggers wait | §8-6-2, §8-6-2-1 | Correct, with the four-step refinement in §4.B. |
| Rule processing is immediate, even mid-action | §9-1-2 | Correct. The proposal's checkpoint idea is right; it needs placement (§4.C). |
| Replacement applies mid-text and the remainder continues | §8-1-3-4-4-1 | Correct. This is the rule basis for a replacement frame nested inside an effect frame. |
| A substitute is not a paid printed cost | §8-3-1-7 | Correct. Exact text: "If the activation cost is not paid as described in the text, the effect following the : colon will not be processed." |
| Costs are checked in printed order and earlier payments enable later ones | §8-3-1-1, §8-4-1-3 | Correct. `validation.ts:361` still uses the independent per-cost check; `isCostSequencePayable` exists at `feasibility.ts:74` and is already used by the orchestrator. |
| Existing green tests can encode wrong assumptions | §8 of proposal | Confirmed once (pipeline prepend order). The Double Attack example was withdrawn on 2026-10-09; those tests are correct. |

The project's own infrastructure already covers several things the legs first flagged as missing. These are **inventory omissions, not missing capabilities**:

- Battle-end and instance-bound obligations: `SCHEDULE_ACTION` with `timing: "END_OF_THIS_BATTLE"`, `bound_to`, and `target_ref` (OP02-064 at `op02.ts:1714`, OP11-092 at `op11.ts:2942`).
- Win-instead-of-lose: `LOSS_CONDITION_MOD: WIN_INSTEAD` (OP03-040 at `op03.ts:1436`).
- Attack redirect: `REDIRECT_ATTACK` (OP16-080 at `op16.ts:1724`).
- Simultaneous defeat already draws (`defeat.ts:5`), and unstoppable loops already draw (`engine-limits.ts:11`).

---

## 3. Audit coverage

| Leg | Scope | Rows | Result |
|---|---|---|---|
| 1 | Rules: timing, triggers, battle, End Phase, damage | 32 findings | 5 CONFLICT (code), 1 CONFLICT (proposal as written), 14 GAP, 12 COVERED |
| 2 | Rules: costs, replacements, prohibitions, DON!! | 35 findings | 1 High reachable bug (Koby), 4 CONFLICT, 14 GAP, 16 COVERED |
| 3 | Rules: game end, zones, visibility, setup | 33 findings | 5 CONFLICT, 15 GAP, 13 COVERED; 12 zone-contract clauses affected |
| 4 | Documented card edge cases | 31 cards | 19 HANDLED, 4 NEEDS-FRAME (downgraded to inventory), 4 UNCLEAR, 4 EXCLUDED |
| 5 | Rules-to-engine map, 2026-07 audit, Doc 08, baseline drift | — | 7 in-scope rules unowned; 4 closed High findings unnamed; 14+ Doc 08 claims to correct |
| 6 | OP18-046 encodability and schema extension mechanics | 5 clauses | 2 YES, 2 PARTIAL, 1 NO |
| 7 | FAQ rulings: timing and triggers | 63 rulings | 10 FIXTURE-COVERED, 31 FIXTURE-NEEDED, 21 MODEL-GAP, 1 CONFLICT |
| 8 | FAQ rulings: costs, replacements, negation, DON!!, base power | 93 rulings | 8 COVERED, 67 FIXTURE-NEEDED, 17 MODEL-GAP, 1 CONFLICT (downgraded, see §4.F) |

Two corrections to leg output after verification:

- Leg 5's CANNOT_DRAW gap is stale. `prohibitions.ts:860` on main enforces it (OPT-876, the baseline commit itself).
- Leg 8's CONFLICT on §4B ("not all-or-nothing") misreads the proposal. The proposal distinguishes initial feasibility (§8-3-1-3, all-or-nothing) from mid-payment inability (§8-3-1-3-1, pay as much as possible). That is the rule. The sentence should cite both rule numbers so future readers do not misread it.

---

## 4. Findings that should change the proposal

Ranked by severity, then by the phase that owns the fix. Each row names the rule or FAQ, the evidence, and the concrete change.

### A. Source-left rule constrains OPT-937 (High, Phase 1)

**Rule.** §8-1-3-1-3: "An auto effect will not activate and cannot be resolved even if the activation timing is fulfilled if the card that fulfilled the activation timing of that auto effect moves to another area before that effect is activated." Exception: §10-2-17-2 ([On K.O.] resolves from trash). Distinct case: §8-2-3, an effect already activated and resolved is not undone by its source leaving.

**FAQ.** Seven rulings agree: OP04-024 Sugar (`qa_op04.md:106`), OP06-086 Moria, OP10-058 Rebecca, ST22-002 Izo, ST24-002, PRB02-004, OP11-049 Carrot. All say a pending auto effect whose source was removed first cannot activate. OP08-105 Bonney adds a resolution-time check. OP04-026 Senor Pink and OP06-006 Saga confirm the other half: an effect already activated still resolves after its source leaves.

**Proposal text at risk.** §4A "Preserving source information needed after a card changes zones" and Phase 1 "Queued-trigger source snapshots needed by OPT-937."

**Change.** Add to §4A and to OPT-937's acceptance: the snapshot carries identity, card ID, controller, and the effect reference only. It never carries live power, cost, modifiers, or attached DON!! (§3-1-6). Activation eligibility re-checks the source's zone at activation time, with the [On K.O.] exception. Resolution of an already-activated effect does not re-check. Add the Sugar and Senor Pink fixtures as the pair that pins both halves.

### B. The damage-window order is four steps, and the OP06-116 gate is a confirmed disagreement (High, Phase 1 and §7 fixtures)

**FAQ.** OP03-040, OP03-041, OP03-047, OP03-051 (`qa_op03.md:90-136`): "First, your opponent checks their Life in accordance with the damage dealt, and then this 'When this Leader's attack deals damage to your opponent's Life' effect activates. After that, if the checked Life card has a [Trigger], your opponent can choose to activate it." OP13-002 Ace (`qa_op13.md`): the defender's own taking-damage effect cannot be ordered before the Trigger; "the Trigger always processes first." OP05-098 Enel: the defender's effect runs after both Double Attack damage points end.

**Resulting order per damage point.** Life check → attacker's "deals damage to Life" auto effect → defender's Trigger choice (§8-6-2-1) → defender's "when you take damage" effect, after all damage processing (§8-6-2).

**Code.** `coordinator.ts:312` (`surfaceRevealTrigger`) returns early when `effectStack.length > 0`. OP06-116's "add 1 card from the top of your Life cards" stays on the stack after its 1 damage, so the Trigger window waits for that instruction. §8-6-2-1 requires the window during damage processing. The proposal calls this "source-supported but not reproduced." The rule text and the gate already disagree; what remains is a fixture, not a reproduction.

**Change.** Rewrite the §7 rows for §8-6-2 and §8-6-2-1 to state the four-step order and define "completion of damage processing" as the end of the per-point Life check. Move the OP06-116 case from "investigate" to a Phase 1 acceptance fixture with accept and decline paths. Keep both players' Life areas distinct in the fixture (OP06-116 adds from the activator's Life, not the damaged player's).

### C. Terminal path: joint checkpoint, placement, and two reachable bugs (High, Phase 0B)

**Rule.** §9-2-1: "At the point when rule processing begins, if any player fulfills any of the defeat conditions below, all of those players lose the game." §9-1-2: immediate, even mid-action. §7-1-4-1-1-1: "If the opponent has 0 Life at the point when it is determined that damage will be dealt, the attacking player wins the game."

**Proposal text at risk.** Phase 0 item 2: "Stop resolution whenever status is no longer `IN_PROGRESS`" and "common `terminateGame(outcome)` used by all terminal writers."

**Findings.**
1. **Joint evaluation.** `defeat.ts:48-86` draws only when both conditions appear in one `checkDefeat` call. Per-writer termination that stops at the first condition lets that player's opponent win when both should lose. The checkpoint must evaluate both players, then write once.
2. **Placement.** The only `checkDefeat` call is `pipeline.ts:554` in `finishPipeline`. The proposal names "checkpoints" without saying where. Name them: after each move that changes deck or Life count, after each damage determination, before each prompt, and at end of action. §3-2-3 says multi-card moves happen one by one, so a deck-empty check belongs between moves.
3. **OPT-925 confirmed in source.** `executeDealDamage` in `battle-actions.ts` returns no `damagedPlayerIndex`; `pipeline.ts:560` reads only that field. `qa_eb03.md:131-133` confirms the On K.O. damage win at 0 Life. The proposal's Phase 0 scenario covers it; the mechanism is now known.
4. **Double Attack into 1 Life. Withdrawn 2026-10-09.** ~~`battle.ts:837-854` marks the second point lethal; `pipeline.test.ts:669` and `opt-239-double-attack-damage-split.test.ts:350` assert the win.~~ Wrong. OPT-886 (PR #721) landed before the baseline. `pipeline.test.ts:669` is titled "Double Attack with 1 life: both damages resolve and the defender does not lose (qa_rules.md:156-158, OPT-886)" and `opt-239-double-attack-damage-split.test.ts:353` asserts the same for the Trigger-decline path. The engine matches `qa_rules.md:156-158`. Decision 4 is moot; the two tests are the regression fixture and must survive the terminal-path rewrite.
5. **`WIN_GAME` is a terminal writer the proposal does not name.** `effects.ts:206-222` sets status and winner but clears no `effectStack` or `pendingPrompt`. §1-2-5 fixture: a win mid-chain runs no later instruction.
6. **Infinite loops.** §11-1-1-1 draws only "if neither player can stop an infinite loop." §11-1-1-2 and §11-1-1-3 require declared counts. `engine-limits.ts:14-25` labels any budget overflow `INFINITE_LOOP_DRAW`. Keep the budget as a safety valve with its own outcome label. **Resolved (Decision 5):** the declared-count protocol is a recorded non-goal with a backlog ticket; the budget outcome is labeled as an engine limit, not a rules draw.

### D. Battle-step windows are not pending-work kinds (High, Phase 1 inventory and Phase 2 fixtures)

**Rule.** §7-1-1-4, §7-1-2-3, §7-1-3-3: at the end of the Attack, Block, and Counter steps, if either combatant "has moved areas due to some method," skip to End of Battle. §10-2-16-1: [On Your Opponent's Attack] activates after the attacker's [When Attacking]. §10-2-15-1, §7-1-3-1: [On Block] and "when attacked" timing.

**Code.** The only combatant zone check is at Damage Step entry (`battle.ts:1231-1235`). An attacker removed during the Attack Step still reaches Block and Counter.

**FAQ.** Eleven rulings depend on these windows: Blocker cannot activate once the Block Step has closed (OP01-057, OP04-035, OP09-041, OP01-087); one Blocker per Block Step; Event [Counter] only in the Counter Step of the opponent's attack (OP15-046, OP11-012); OP03-001 Ace's "when attacked" sits after When Attacking and after Blocker; target lock after Blocker or Counter redirect (ST01-002, OP11-057, P-004, OP06-054, EB01-038); turn player's [Your Turn] effect in the Block Step resolves before non-turn [On Block] (OP06-048, ST03-003).

**Card cases.** OP16-080 Teach redirects the attack target after a cost prompt; WHEN_ATTACKED must re-match after the prompt and across a reload. OP02-045 and five others play a Character during the Counter step whose [On Play] fires inside the battle window.

**Change.** Add `turn.battle` sub-phase state (declaration, redirect window, Block, Counter, target lock) to the Phase 1 inventory as owned pending work. Add one step-end zone checkpoint to the Phase 2 drain loop, run after any frame suspended inside that step pops. Add the step-end fixtures to §7.

### E. Replacement semantics the shared helper must encode (Medium-High, Phase 0B and Phase 3)

| Rule or FAQ | Finding | Evidence | Owner |
|---|---|---|---|
| §8-1-3-4-5; OP11-001 Koby Q2 (`qa_op11.md:10-12`) | **Withdrawn 2026-10-09.** ~~Koby's substitute is offered and "succeeds" with 2 trash cards.~~ Wrong. OPT-873 (PR #728) added a `RETURN_TO_DECK` branch to `canExecuteReplacementSubstitute` (`replacements.ts:587-591`) that cites this FAQ, with tests at `opt-873-replacement-substitute-feasibility.test.ts:394` and `:404`. The structural point stands: `canPayReplacementCost` (`:497`) checks only `TRASH_FROM_HAND`, `isActionFeasible` (`feasibility.ts:30`) defaults to true, and substitute coverage is an enumerated list (`:560-604`) that a new substitute type silently falls outside of. | FAQ: "No, you cannot." | Phase 3: fold both checks into the shared feasibility contract so coverage is per-action, not per-list. No hotfix. |
| §8-1-3-4-2 | Precedence order (generating card first, then turn player's chosen order, then non-turn player) is not in the proposal. Code uses registration order (`replacements.ts:372`) and first match (`:298-330`). The first clause is ambiguous in translation. **Resolved (Decision 7):** code the literal reading and flag it as assumed in §10; a later ruling flips the fixture, not the helper. | — | Phase 3 helper |
| §8-1-3-4-6 | A substitute that makes another replacement eligible must offer it. Batch scan runs once (`replacements.ts:947-975`); no rescan after a substitute. | — | Phase 3 |
| OP11-001 Q1/Q3, OP15-009, OP05-001 Sabo, OP05-032 Pica | **Batch semantics.** One payment covers all simultaneous removals; a member cannot be trashed first to fund another's replacement; batch members stay on the field while the replacement cost is paid. Code already matches Q1 and Q3; the proposal never states the semantic, so the Phase 3 helper could lose it. **Resolved (Decision 8):** all three semantics become written acceptance for the Phase 3 helper. | `qa_op11.md`, `faq_op15-eb04.md`, `qa_op05.md` | Phase 3, written as acceptance |
| §8-1-3-4-7 | The replaced part is "treated as an effect that was activated by the owner of that replacement effect." Code uses `effect.controller` as chooser. State this in §4C and cite the rule. | — | Phase 1 frame field |
| §3-1-2; OPT-921 | "The field" includes the cost area, so attached DON!! is in the "from your field" pool. `executeReturnDonToDeck` filters `!d.attachedTo` (`don.ts:480`) and auto-picks rested first with no player choice (§8-4-4). | `qa_rules.md` DON!! −X ruling | Phase 3 acceptance |
| OP13-109, ST29-008 | A face-up top Life card blocks the Life replacement. | `qa_op13.md`, `qa_st-29.md` | Phase 3 feasibility |

### F. Cost availability gaps beyond OPT-864 (Medium, Phase 0B)

- **Life Trigger cost gate uses the unsound pattern.** `effect-damage.ts:136` does `block.costs.every(isCostPayable(...))`. Add it to Phase 0 item 3's scope. OP16-107 Burgess (`opt-413-op16-faq-fixes.test.ts`) is the anchor.
- **Prohibitions are not a feasibility input.** §1-3-3: "the prohibiting effect always takes precedence." `availability.ts` and `validation.ts:370-388` never consult prohibitions; `pipeline.ts:80` vetoes later. Availability can offer what execution rejects, which is the OPT-864 class. **Resolved (Decision 11):** prohibitions are an input to the shared feasibility contract (§4B). The contract must enumerate which prohibitions gate feasibility (activation-time) and which gate only execution (resolution-time, such as `CANNOT_DRAW` inside a draw-as-cost).
- **Mid-payment inability and once-per-turn.** §8-3-1-3-1: pay as much as possible, do not resolve. §10-2-13-5: the [Once Per Turn] use is consumed anyway. `orchestrator.ts:64-80` rolls the whole activation back to baseline; `resolver.ts:486` returns on `cannotPay` before the mark at `:520`. Reachability is low because feasibility runs first. **Resolved (Decision 10):** keep the rollback and record it in §10 as a deliberate deviation from §8-3-1-3-1 and §10-2-13-5. The consequence to state next to it: a failed payment leaves the [Once Per Turn] use unconsumed, so the player may retry, which the rule forbids. The one remaining path is a replaced cost (§8-3-1-7), so the fixture that pins the deviation must use one.
- **Activation costs are all-or-nothing** (§8-3-1-3; ST06-012 Garp, OP11-024 Aladine). Cite the rule in §4B so the "not a database transaction" sentence is read as intended.
- **Once-per-turn ledger** (`turn.oncePerTurnUsed`, keyed by `instanceId`) is turn state, not a frame. Phase 0A's strict schema must carry it. §10-2-13-4 (a returned card is a new card) is satisfied by fresh instance IDs; say so.

### G. End Phase stage list needs three expiry steps and one open ruling (Medium, Phase 0B)

- §6-6-1-2 step 1 (turn player's "at the end of this turn" processing, then "until end of turn" invalidation), §6-6-1-2 step 2 (same for non-turn player), then §6-6-1-3 ("during this turn" invalidation, turn player then non-turn). The proposal collapses these into "expire the remaining turn-duration effects." Current code reverses the rule: `phases.ts:186` expires before `:189` processes scheduled actions, and `duration-tracker.ts:52-65` expires both players together.
- Map each `remainingScheduledActions` entry onto a §6-6-1-2 step explicitly. The rule has no "scheduled action" concept.
- **Open ruling, resolved (Decision 9):** [End of Your Turn] effects newly fulfilled during the wave activate in the same step, consistent with §8-6-1-1. The wave loops until nothing new is fulfilled, bounded by the loop budget. Tag each `remainingScheduledActions` entry with its §6-6-1-2 step.
- OP11-040 Luffy (`qa_op11.md`): start-of-turn effects run before DON!! return and set-active in Refresh. The proposal specifies End Phase stages only; Refresh stage order needs the same treatment.

### H. Phase 1 inventory omissions (Medium)

The proposal lists effect/cost frames, phase continuations, batch markers, replacement contexts, `pendingEventActivationEvents`, legacy `ResumeContext`, and pregame contexts. Add:

| State | Where | Why it matters |
|---|---|---|
| `state.scheduledActions` with `END_OF_THIS_BATTLE` timing and `bound_to`/`target_ref` | `duration-tracker.ts:208`; `effect-types.ts:964` | Battle-end and instance-bound obligations (OP02-064, OP11-092) |
| `ruleTrashForPlay` overflow prompt with its batch continuation and `queuedTriggers` | `play.ts:79-82`; `types.ts:142-150`; `resume/target.ts:118-190` | A side-channel continuation; §3-7-6-1 |
| `turn.triggerStagingInstanceIds` | OPT-257 | §10-1-5-3: the Trigger card is in no area while activating |
| `turn.oncePerTurnUsed` | `types.ts:251` | See §4.F |
| `turn.battle` sub-phase state and target lock | `battle.ts` | See §4.D |
| `LOSS_CONDITION_MOD` evaluation inside `terminateGame` | `defeat.ts:18-46`; `op03.ts:1436` | Nami's win-instead and Brook's deferred loss must pass through the joint checkpoint |
| Pregame machine (`pregame.phase`, `mulliganDecisions`, `START_OF_GAME_FX`) with a nested effect frame | `pregame.ts:127-150`, `:264-310` | OP13-079 Imu; §5-2-1-5-1 order; §5-2-1-5-2 reshuffle after a start-of-game deck change (no shuffle step exists) |
| Event-activation debt source zone and class | OPT-236 three classes | OP12-041, OP15-014, OP15-046 activate from hand; EB03-031 from trash; a Trigger activation is not an Event activation (OP01-004, OP01-062) |

### I. Guard tests and contracts the proposal must carry forward (Medium, Phases 1–2)

The 2026-07 audit closed every finding, but four are unnamed in the proposal and will regress silently:

- GE-06 AND-group commit contract (OPT-472): depends on handler return contracts Phase 2 rewrites. The registry has zero `AND` connectors today, so the fail-closed path is dormant.
- GE-07 event immutability (OPT-468): Phase 1 frames carry events and snapshots.
- GE-11 and GE-12 architecture guard tests (`opt-478-resolver-architecture`, `opt-479-session-boundaries`, cast-count regression): will break in Phases 1–2 unless updated deliberately.
- GE-02 atomic clearing in `terminateForEngineLimit`: must survive generalization to `terminateGame`.
- GE-13: the 1.5 MB reject-before-mutate persistence budget is unnamed in Phase 0A.

### J. Separate workstreams: concrete evidence the proposal should cite (Low for this project, High for those workstreams)

- **RNG (OPT-888).** `execution-context.ts:5-11` folds the 128-bit seed to a 32-bit `rngState`. The shuffle space is at most 2^32 against roughly 2^214 orderings of a 50-card deck. This is a design limit, not a theoretical weakness.
- **Negation scope (OPT-910 and beyond).** Eight rulings (OP09-093/097/098, OP10-098, OP09-068/084, OP09-081, OP06-074): negation removes printed effects only, keeps keywords granted by other cards, keeps already-resolved results, suppresses [On K.O.] after a later K.O., and has its own duration scope. See §6.3.
- **Value layers.** OP13-084, OP14-001/017, OP15-070/071, ST26-005, OP06-009, OP02-121, OP10-042: base-power set is a layer below modifiers, persists after its source leaves, captures at resolution, takes the highest of two sets (§4-9-2-1), and cost layering keeps negative intermediates. See §6.3.
- **Visibility (§4E).** Looks are not zone transitions (§11-3-2); a look through `transitionCard` would mint new instance IDs. Face-up Life is public (§3-10-2-1) and restores after a look (§3-10-3). Reveal is event-scoped and ends after the effect (§11-2-2). `zone-transition.ts:201-215` strips permanent effects on any move, which breaks §8-1-3-3-3 for secret-to-secret moves.
- **Overflow.** `execute.ts` trashes the replaced Character with `preserveSourceTriggers: true`. §3-7-6-1-1 says "no effect can be applied" and `qa_rules.md:98-100` says the card is "not K.O.'d, but directly moved to your trash." Scope the flag.

### K. Documentation to correct in baseline work (Low)

- **Doc 08** has at least 14 stale guarantees beyond the four the proposal lists. Leg 5's table enumerates them with line numbers: "no backdoor" (lines 13, 269), step-3 interception (115, 321), zero-power K.O. (367, 899), `TURN_ENDED` (462), End Phase order (785–792), defeat after every action (109, 363, 881, 895), state-hash loop detection (371, 913), nested-trigger order (502, 508–540, 859), "events are the sole interface" (377), cost path "enters pipeline" (530, 544), "priority queue" (117), bound scheduled action discarded (832), rest-vs-activate (344). Preserve: copy-on-write (11), persisted context (21), undo checkpoint (104), cost façade (111).
- **RULES-TO-ENGINE-MAP.md** marks §6-6-1-1-2 through §6-6-1-4, §8-6-1, §8-6-1-1, §8-6-2, §7-1-4-1-1-1, §1-2-1-1-2 as IMPL. The proposal's own tickets say otherwise. Line 52 calls the effect stack "LIFO"; §4A says timing is not generic LIFO.
- **04-ACTIONS.md:1356-1380** documents `DISTRIBUTE_DON` params that do not match code (`don_per_target`/`max_targets` vs `amount`/`amount_per_target`/`don_state`); same for `GIVE_DON`.
- **CARD-ANALYSIS-FINDINGS.md §1.6** lists ST03-016 as a reuse card; `docs/cards/ST-03.md` shows a [Counter] Event.
- **Rules version.** The repo holds v1.2.0; official is v1.2.1 (2026-08-28). Diff §9, §3, and §10-2-17 first. **FAQ data:** `faq_op15-eb04.md` has OCR garbling in about a dozen entries; those rulings were excluded.

---

## 5. Required additions to §10 (decisions, resolved 2026-10-09)

The project owner resolved all eleven decisions on 2026-10-09. Ten follow the audit's direction. Decision 10 keeps current engine behavior as a deliberate deviation. Each row names the resolution, the consequence the §10 text must carry alongside it, and the milestone it blocks.

| # | Decision | Resolution | Consequence to carry in §10 | Blocks |
|---|---|---|---|---|
| 1 | Source-left eligibility (§8-1-3-1-3) | Snapshot carries identity only: instance ID, card ID, controller, effect reference. Activation re-checks the source's zone; [On K.O.] keeps the §10-2-17-2 exception. Resolution of an activated effect never re-checks. | The snapshot must not carry power, cost, modifiers, or attached DON!!, or a later clause reads stale values. Fixture pair: Sugar OP04-024 and Senor Pink OP04-026. | Phase 1, OPT-937 |
| 2 | Damage-point order (§8-6-2, §8-6-2-1) | Hard invariant: Life check → attacker's "deals damage to Life" effect → defender's Trigger choice → defender's "when you take damage" effect, queued once per attack after the last point (Enel OP05-098). OP06-116 becomes a Phase 1 acceptance fixture with accept and decline paths. | For Double Attack, a Trigger on point 1 can change the Life count before point 2's Life check. The fixture must cover that path. | §7 fixtures, Phase 1 |
| 3 | Joint defeat checkpoint (§9-2-1) | One evaluation of both players per checkpoint, then one write. Placement: after each move that changes a deck or Life count, after each damage determination, before each prompt, at end of action. `WIN_GAME` and `LOSS_CONDITION_MOD` route through it. Revision 4 adds: the checkpoint takes qualifying damage context, zero Life alone is not defeat (rule 7-1-4-1-1-1), and conditions met at different checkpoints never accumulate into a draw. | A multi-card draw must check between cards (§3-2-3), so `DRAW_CARDS` cannot remain one atomic handler. | Phase 0B, OPT-949 |
| 4 | Double Attack into 1 Life | **Moot.** Already implemented by OPT-886 (PR #721) on the baseline. The owner chose "adopt the FAQ now" on 2026-10-09 before the audit error was found; the engine already does. | Keep `pipeline.test.ts:669` and `opt-239-double-attack-damage-split.test.ts:353` green through the Phase 0B terminal-path rewrite. | None |
| 5 | Loop budget vs §11-1 | Split the labels. Budget overflow gets its own outcome (engine limit) distinct from a §11-1-1-1 rules draw. The declared-count protocol (§11-1-1-2, §11-1-1-3) is a recorded non-goal with a backlog ticket. | A player can lose a game to the budget that the rules say they could have stopped. Say so in §10. | Phase 0B |
| 6 | Battle step-end checkpoints (§7-1-1-4, §7-1-2-3, §7-1-3-3) | Three checkpoints as owned pending work. `turn.battle` gains step, redirect window, Blocker lock, and target lock in the Phase 1 inventory. Each checkpoint runs after any frame suspended in that step pops. | This is the first Phase 1 item that adds state rather than reshaping it, so the Phase 1 schema version bumps. | Phase 1 inventory, Phase 2 |
| 7 | Replacement precedence (§8-1-3-4-2) | Code the literal reading: generating card's own replacement first, then the turn player chooses among theirs, then the non-turn player among theirs. Mark it "assumed, no official ruling" in §10. | A later reading flips the fixture, not the helper. No registry card has two competing replacements on one event today. | Phase 3 |
| 8 | Batch replacement semantics and Koby OP11-001 | **Hotfix withdrawn.** Koby is already correct (OPT-873, PR #728). The three FAQ semantics (one payment per batch, members stay on the field during payment, no sequencing to fund a sibling) become written acceptance for the Phase 3 helper, as chosen. | Phase 3 must make substitute feasibility per-action rather than an enumerated list, so the next Koby-shaped card cannot regress silently. | Phase 3 |
| 9 | End Phase expiry split (§6-6-1-2, §6-6-1-3) | Three steps: turn player's end-of-turn effects then "until end of turn" expiry, same for the non-turn player, then "during this turn" expiry for both. An [End of Your Turn] effect newly fulfilled during the wave activates in the same step; the wave loops until nothing new is fulfilled, bounded by the loop budget. | Each `remainingScheduledActions` entry must be tagged with its §6-6-1-2 step. The rule has no "scheduled action" concept. Refresh stage order (OP11-040) gets the same treatment. | Phase 0B, OPT-924 |
| 10 | Mid-payment inability (§8-3-1-3-1, §10-2-13-5) | **Deliberate deviation.** Keep the rollback to baseline. The rule-literal outcome (keep the paid portion, do not resolve, consume the [Once Per Turn] use) is not adopted. Revision 4 tracks it as rules debt in OPT-958, outside the milestones, reassessed at OPT-948 acceptance or earlier if a new path or ruling changes reachability. | A failed payment leaves the once-per-turn use unconsumed, so the player may retry, which §10-2-13-5 forbids. The only reachable path after OPT-864 is a replaced cost (§8-3-1-7); pin the deviation with a fixture that uses one. Label the fixture as a rules deviation and link OPT-958. | Phase 0B (OPT-864), OPT-958 |
| 11 | Prohibitions in feasibility (§1-3-3) | Prohibitions are an input to the shared feasibility and availability contract. | The contract must enumerate which prohibitions gate feasibility (activation-time) and which gate only execution (resolution-time). Keep that list next to the prohibition type union so it cannot drift. | Phase 0B, Phase 3 |

---

## 6. Scalability review: power creep and OP18-046

### 6.1 What the proposal claims, and what it does not

The proposal says the benefit is that "a new card mechanic inherits correct sequencing, choices, and persistence from shared machinery," and explicitly disclaims that "every future card can be added without an engine change." That framing is honest and the audit supports it. The consolidation is about **execution** scalability. It does not touch **expressive** scalability, which lives in the schema type unions and their handlers. Power creep stresses both.

### 6.2 OP18-046, clause by clause

The revealed text carries five abilities with five distinct timing windows on one Character. Treat the text as given, but note that the mix of [Main] and [Trigger] on a Character has no precedent in 2,472 authored schemas, so encoders must defer rather than guess if the final printing differs.

| Clause | Encodable today | What is missing | FAQ guidance |
|---|---|---|---|
| **A** [On Play] Draw 2 and give up to 2 rested DON!! to your Leader and all of your Characters | PARTIAL | `GIVE_DON` loops `amount` per target (`don.ts:31-75`); `DISTRIBUTE_DON` caps per target, never per action. "Up to 2 total across all" cannot be expressed. "To your Leader and all of your Characters" has no precedent. | OP13-042, ST01-011, OP05-008, OP07-001: DON!! never splits freely across recipients unless the text says so. OP15-015: an unperformable DON!! step is skipped and the rest resolves. Inference: one slot per listed target. Needs a ruling. |
| **B** [On Opponent's Attack] trash 1: Baroque Works Leader becomes 7000 base power this turn | YES | `ON_OPPONENT_ATTACK` on Characters (47 precedents), `TRASH_FROM_HAND` cost, `SET_BASE_POWER` on `YOUR_LEADER` with trait filter and `THIS_TURN` (OP17-005, OP17-008, OP17-034). | OP13-084, OP14-001, ST26-005, OP06-009: base set is its own layer; a second set takes the higher value; the value captures at resolution. The engine has `SET_BASE_POWER` but no written layer contract. |
| **C** [Activate: Main] K.O. 1 of your Stages cost ≤5: gains Rush this turn | PARTIAL | `TRASH_OWN_STAGE` exists with a filter (`payability.ts:201`, `payment.ts:415`), but no `cost_max` precedent. No K.O.-typed Stage cost; `KO_OWN_CHARACTER` lists Characters only (`cost/targets.ts:84`). | §10-2-1-1 defines K.O. for Characters. OP13-098: "K.O. opponent's Stage" is refused. No Stage in the corpus has [On K.O.]. Encode as trash with no K.O. event, and flag for a ruling if a Stage ever gains [On K.O.]. |
| **D** [Main] trash 1: negate up to 1 opponent cost ≤6 Character, then return it to hand | NO | `MAIN_EVENT` dispatches only for Event cards (`execute.ts:119-145`); zero Character schemas use it. The negate-then-ref chain exists (OP09-093 at `op09.ts:3073-3119`); `RETURN_TO_HAND` with `target_ref` has a handler (`removal.ts:126`) but zero precedents. | §6-5-3-1 and `qa_rules.md:94-96`: nothing from hand except playing a Character or Stage or activating an Event. No ruling covers a Character [Main]. If the printing is [Activate: Main], it is encodable today. |
| **E** [Trigger] draw 2 then trash 1 | YES | Type-agnostic Trigger surfacing (`battle.ts:449`, `effect-damage.ts:82`); draw-then-trash chain has 66 precedents (EB01-060). | OP13-113, OP06-013, ST04-010: a Character's Trigger plays itself only if the text says so. |

### 6.3 Where power creep will hurt, and whether the proposal covers it

**1. Execution density: covered.** Five abilities on one card means five frames with different windows (On Play, opponent's attack declaration, main-phase activation, main-phase effect, Life Trigger). Today each window has its own continuation path. After Phase 2, all five go through one scheduler and one persistence shape. This is the proposal's strongest scalability argument, and the audit confirms it, with one caveat: the battle-window inventory gap in §4.D is exactly where clause B lives.

**2. Schema extension mechanics: partially enforced.** Adding a primitive today means editing a union, a hand-maintained `ALL_*` array, `ActionParamsMap`, `ACTION_HANDLERS`, and the execution-test list. Compile-time exhaustiveness, a boot-time throw, schema-registry rejection, and the OPT-473 coverage test enforce the handler and the execution test. **Not enforced:** per-action feasibility (`feasibility.ts:30-60` checks only `FULL_TARGET_COUNT` and the `OPPONENT_ACTION` wrapper, then defaults to true) and descriptions (`ACTION_LABELS` is a loose `Record<string, string>`). The Koby bug in §4.E is this gap in production: an action used as a replacement substitute silently inherits "feasible." Every new primitive that can appear as a cost or substitute will reproduce it. **Recommendation:** make the per-action contract a single registry entry (handler, feasibility, label, lint rule, execution test) so that adding a primitive is one unit and `action-coverage-contract.ts` fails when any part is missing. This belongs in the §4D schema-consumer workstream, but Phase 3's "replace hand-written substitute checks where drift is demonstrated" should cite it, because the drift is structural.

**3. Value layers: unowned.** Base-power set, base swap, copy, cost layering, DON!! bonus, and "base vs current" conditions are the single most common power-creep pattern in OP13 through OP17. Ten FAQ rulings in leg 8 define a consistent model: printed → base set (highest wins, captured at resolution, persists after source leaves) → modifiers (stack, negative intermediates kept) → DON!! bonus. The engine implements pieces (`SET_BASE_POWER`, `modifiers.ts`), Doc 08 describes a layer model the proposal calls "hypotheses," and no document states the contract. **Recommendation:** write the value-layer contract as a decision in §10 or a named workstream, with the ten rulings as its fixtures, before Phase 1 frames snapshot any live value.

**4. Negation scope: unowned.** OPT-910 is one symptom. The FAQ model: negation removes printed effects, not keywords granted by other sources, not already-resolved results; it suppresses [On K.O.] after a later K.O.; it has its own duration and can cover cards played later (OP09-081). Clause D of OP18-046 negates then bounces; "negate, then return" as one clause has no ruling, and a negated Character's K.O. replacement is unaddressed. **Recommendation:** a negation contract before Phase 1 persists any "negated" flag on a frame or snapshot.

**5. Batch and distribution semantics: unowned.** "Give DON!! to A and all of B," "one payment covers all simultaneous removals," and "turn player chooses first inside one instruction" (OP05-058) all need a per-target-slot or per-batch semantic that neither the action set nor the proposal names. Clause A is the first card to need a slot-per-target DON!! action.

**6. Card type × keyword matrix: brittle.** [Main] dispatch is keyed on card type (`execute.ts:119-145`), and [Trigger] surfacing reads card text. Clause D breaks the first. **Recommendation:** key dispatch on (keyword, source zone, activation class) rather than card type, which also serves the OPT-236 event-activation classes.

**7. Bundle capacity: fine.** Projected Worker gzip is about 336 KB, 32% of the 1 MiB repo budget, at roughly 51 gzip bytes per card and 0.5% per main set. Capacity is not a scalability constraint for the foreseeable set cadence.

### 6.4 Scalability verdict

The consolidation is the right investment for execution scalability and should proceed. It will not, by itself, let the engine absorb power creep. The three contracts above (value layers, negation scope, batch/distribution semantics) are where new sets will keep producing tickets, and none has an owner. They do not need to block Phase 0, but Phase 1 should not persist any value, negation flag, or batch state in a frame until each has a written contract and its FAQ fixtures.

---

## 7. Recommended fixture additions by milestone

The leg reports contain the full lists (leg 1: 32, leg 2: 21, leg 3: 22, leg 4: 20, leg 7: 16 ranked, leg 8: 20 ranked). The rows below are the ones that change a milestone's exit criteria.

**Baseline and §7 fixtures**
- Four-step damage-point order with OP03-040 or OP03-041 and a Trigger Life card (`qa_op03.md`).
- OP13-002 Ace: Trigger before the defender's own taking-damage effect (`qa_op13.md`).
- Double Attack ladder: Trigger on hit 1, fixed 2 damage, no win on hit 2 at 1 Life (`qa_rules.md:150-158`). The no-win leg is already green (OPT-886); the Trigger-on-hit-1 and fixed-count legs are new.
- Sugar (OP04-024) and Senor Pink (OP04-026): source-left pair.
- §8-6-1-1 B-before-C, marked pending a ruling.
- Step-end zone checks §7-1-1-4, §7-1-2-3, §7-1-3-3, including a leave inside a prompt in that step.
- Block-step closure (no Blocker after Counter-step play), one Blocker per step, Counter-only-in-Counter-step, target lock after redirect (OP16-080 with a reload between cost and target).

**0A**
- Strict schema round-trip for `oncePerTurnUsed`, `triggerStagingInstanceIds`, `scheduledActions` with `END_OF_THIS_BATTLE`, `ruleTrashForPlay` continuation, and `turn.battle` target lock.

**0B**
- Joint defeat: deck-out and Life-out in one resolution yields a draw.
- EB01-051 mid-cost deck-out: no further prompt; terminal state has no `pendingPrompt` or `effectStack`.
- `WIN_GAME` mid-chain stops later instructions.
- Koby (OP11-001) with 2 trash cards: no offer; with 3 and two targets: one payment. Already covered by `opt-873-replacement-substitute-feasibility.test.ts:394-404` and `replacement-scenarios.test.ts:326`; keep green.
- Mid-payment deviation pinned (Decision 10): a replaced cost (§8-3-1-7) that cannot complete rolls back to baseline and leaves the once-per-turn use unconsumed.
- Life Trigger with an unpayable cost (OP16-107) and with a sequentially enabled cost.
- End Phase three-step expiry with a "during this turn" modifier depending on an "until end of turn" modifier, and a Character played during the wave whose [End of Your Turn] effect activates in the same step (Decision 9).
- Prohibited `ACTIVATE_EFFECT` with a payable cost reads as unavailable.
- Budget overflow on a long legal chain is labeled an engine limit, not an infinite-loop draw (Decision 5).

**1**
- OP06-116 accept and decline paths with distinct Life areas.
- Synthetic two-damage effect with Trigger on hit 1, with and without reload.
- Overflow trash with an [On K.O.] registration: no trigger, no surviving registration.
- OP13-079 Imu with a reload before the Stage prompt; start-of-game deck change reshuffles.
- OP11-092 and OP02-064 instance-bound and battle-end obligations no-op when the instance is gone.

**2**
- A → X → C and A → B → C uninterrupted, prompted inside A, and reloaded, with constant choices.
- §8-6-3 activation chain: Event, Blocker, and Trigger activations; Trigger is not an Event activation (OP01-004).
- Turn player's [Your Turn] effect before non-turn [On Block] (OP06-048).
- Refresh order: start-of-turn effects, then DON!! return, then set-active (OP11-040).

**3**
- §8-1-3-4-2 precedence under the assumed literal reading (Decision 7), §8-1-3-4-6 rescan after a substitute, §8-1-3-4-3 no re-application.
- Pica (OP05-032): batch member pays a rest cost while still on the field.
- OP15-098 Luffy at 0 Life: Life replacement not offered.
- "From your field" DON!! return includes attached DON!! (OPT-921).

---

## 8. Linear changes

Created and applied on 2026-10-09. Tickets: OPT-949 (0B joint checkpoint), OPT-950 (Phase 1 inventory), OPT-951 (Phase 2 step-end checkpoints), OPT-952 (loop protocol non-goal), OPT-953 (value layers), OPT-954 (negation scope), OPT-955 (batch/distribution), OPT-956 (Doc 08 and rules map), OPT-957 (rules v1.2.1 and FAQ OCR). Amendments appended to OPT-937, OPT-924, OPT-864, OPT-939, OPT-883, OPT-923; evidence comment on OPT-888. Item 1 applied on 2026-10-11: the proposal document's §10 gained a resolved-decisions table and an amendment line in its header, and the project description gained a decisions summary.

1. **Done 2026-10-11.** Add the eleven resolved §10 decisions from §5 to the proposal document and the project description, including the Decision 10 deviation and the Decision 7 "assumed" flag verbatim.
2. New 0B ticket: joint defeat checkpoint and placement (covers OPT-862, OPT-925, `WIN_GAME`, `LOSS_CONDITION_MOD`, and the Decision 5 label split). **OPT-949.**
3. ~~New 0B ticket: Koby OP11-001 substitute feasibility hotfix.~~ Withdrawn 2026-10-09; already fixed by OPT-873. The per-action feasibility contract is appended to OPT-923 instead.
4. Amend OPT-937: identity-only snapshot plus activation-time zone check, with the seven FAQ rulings as acceptance. **Appended.**
5. Amend OPT-924: three expiry steps, scheduled actions tagged by step, and in-wave [End of Your Turn] triggers activating in the same step (Decision 9). **Appended.**
6. Amend OPT-864: include the Life Trigger cost gate and prohibitions as feasibility inputs, plus the Decision 10 deviation. **Appended.** Decision 2 fixtures and Decision 7 appended to OPT-939; Decision 7 also on OPT-883; Decision 8 on OPT-923.
7. New Phase 1 ticket: battle-window and overflow pending-work inventory. **OPT-950.**
8. New Phase 2 ticket: step-end zone checkpoints (§7-1-1-4, §7-1-2-3, §7-1-3-3). **OPT-951**, blocked by OPT-950.
9. New workstream tickets (outside this project): value-layer contract **OPT-953**, negation-scope contract **OPT-954**, batch/distribution semantics **OPT-955**, RNG seed width (**comment on OPT-888**, no new ticket), Doc 08 and rules-map corrections **OPT-956**, rules v1.2.1 reconciliation **OPT-957**.
10. Backlog ticket: §11-1-1-2 and §11-1-1-3 declared-count loop protocol, recorded as a non-goal of this project (Decision 5). **OPT-952.**

---

## 9. Evidence index

| File | Contents |
|---|---|
| [`audits/consolidation-2026-10/proposal-rev3-snapshot.md`](./audits/consolidation-2026-10/proposal-rev3-snapshot.md) | The audited proposal text, exported from Linear on 2026-10-08 |
| [`audits/consolidation-2026-10/proposal-rev4-snapshot.md`](./audits/consolidation-2026-10/proposal-rev4-snapshot.md) | Revision 4 (2026-10-11), the current implementation contract with the decisions folded in; exported 2026-10-12 |
| [`leg-1-timing-and-triggers.md`](./audits/consolidation-2026-10/leg-1-timing-and-triggers.md) | 32 rule findings, 6 FAQ-in-source rulings, 31 fixtures |
| [`leg-2-costs-and-replacements.md`](./audits/consolidation-2026-10/leg-2-costs-and-replacements.md) | 35 rule findings, FAQ table, 21 fixtures |
| [`leg-3-game-end-and-zones.md`](./audits/consolidation-2026-10/leg-3-game-end-and-zones.md) | 33 rule findings, 12 zone-contract clauses, 22 fixtures |
| [`leg-4-card-edge-cases.md`](./audits/consolidation-2026-10/leg-4-card-edge-cases.md) | 31 card cases, 11 unnamed patterns, 20 fixtures |
| [`leg-5-engine-docs-and-baseline.md`](./audits/consolidation-2026-10/leg-5-engine-docs-and-baseline.md) | Rules-map and 2026-07 audit mapping, Doc 08 claims, baseline verification |
| [`leg-6-op18-046-encodability.md`](./audits/consolidation-2026-10/leg-6-op18-046-encodability.md) | Clause table, precedents, union counts, enforcement, bundle headroom |
| [`leg-7-faq-timing.md`](./audits/consolidation-2026-10/leg-7-faq-timing.md) | 63 FAQ rulings classified, 16 ranked fixtures |
| [`leg-8-faq-costs-negation.md`](./audits/consolidation-2026-10/leg-8-faq-costs-negation.md) | 93 FAQ rulings classified, five-clause table, 20 ranked fixtures |
