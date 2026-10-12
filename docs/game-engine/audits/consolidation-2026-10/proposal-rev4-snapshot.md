<!-- Snapshot of the Linear document "Game Engine Consolidation — Final Proposal (Revision 4)", exported 2026-10-12.
     Canonical copy: https://linear.app/optcg-sim/document/game-engine-consolidation-final-proposal-revision-4-0405d57abd84
     Revision 4 (2026-10-11) integrates the eleven resolved audit decisions into §§3–8 and the §10 decision register,
     adds OPT-958 for the retained mid-payment rollback, and is the current implementation contract.
     proposal-rev3-snapshot.md in this folder is the text the 2026-10-08 audit was run against; keep both. -->

# Game Engine Consolidation Proposal

**Status:** Final planning proposal after two Claude reviews; review loop closed. Implementation is not authorized by this document.
**Date:** September 29, 2026
**Revision:** 4 — integrates the October audit decisions into the implementation sections, clarifies terminal checkpoints, and tracks payment rollback rules debt
**Amended:** October 11, 2026 — the eleven decisions resolved on October 9 are incorporated into §§3–8 and the decision register in §10. The previous revision and audit remain historical evidence; this revision states the current implementation contract directly.
**Audience:** Project owner and future implementation agents
**Linear project:** [Game Engine Consolidation](<https://linear.app/optcg-sim/project/game-engine-consolidation-34e20fb682af>)
**Direction:** Consolidate in place, starting with saved-state compatibility. Resolve the implementation prerequisites in §10 within the relevant work; no further general architecture review is requested.

## 1. Recommendation in plain language

Consolidate the existing machinery that decides how a game action unfolds. Build on the engine's effect stack, prompt lifecycle, state transitions, and payment code. Give pending work one authoritative home and execution order one owner.

Think of the proposed engine as **one referee following card instructions, with a bookmark whenever a player needs to make a choice**.

Today, several parts of the engine act like separate referees. Battles, effects, costs, replacements, and prompt responses have their own ways to decide what happens next. A mechanic can work normally but behave differently after an interruption or a saved-game reload.

The proposed model has three parts:

1. **Card instructions:** Describe what should happen, using shared operations such as choose, draw, move, damage, and apply a restriction.
2. **One referee:** Controls execution order, applicable rules, interruptions, and requests for player input.
3. **An official game record:** Stores the board and the exact unfinished work, allowing the referee to resume after a choice or reconnect.

For example, a card that deals damage and then performs another instruction needs this sequence:

```text
An effect deals damage, then performs another instruction
  → Process the damage
  → A Life card offers a Trigger
  → Save a bookmark: finish damage, then continue the original effect
  → Ask the player and finish resolving their choice
  → Return to the bookmark
  → Finish the damage and proceed at the rules-defined timing
```

The engine already has much of this bookmarking machinery. The work is to bring the scattered bookmarks together and make existing mechanics follow the same process.

**This remains a substantial refactor across multiple milestones, but its scope is smaller than replacing the execution core.** Improve the existing referee system step by step. Keep the game board, deck builder, networking, and useful card definitions. No second runtime is proposed.

### What changed after review

Claude agreed that ownership of paused work and trigger processing is duplicated, but challenged the need for a replacement core. That correction is accepted. The effect stack and prompt lifecycle provide a foundation for consolidation. The final review further narrows the first phase to compatibility and reachable correctness problems.

Start with readers that can safely load the proposed saved-state shapes, then fix End Phase ordering, termination, and cost availability. Move effect and battle damage together in Phase 1; the specific multi-damage remainder bug is latent in the inspected authored corpus. Phase 3 is limited to shared replacement scanning, rechecking, and demonstrated feasibility drift. A general consequence service is deferred.

Schema lookup, effect provenance, visibility, and RNG are separate workstreams. <issue id="3a294b0e-5cfc-4831-bffa-846de8401a4c" href="https://linear.app/optcg-sim/issue/OPT-911/11-compound-maincounter-events-never-resolve-either-effect-consumers">OPT-911</issue>/913 do not depend on this consolidation and should receive priority independently when implementation is authorized. Coordinate persisted source snapshots from <issue id="96b16362-2ed7-499a-9489-794619b564ad" href="https://linear.app/optcg-sim/issue/OPT-937/snapshot-the-effect-source-at-trigger-enqueue-so-a-moved-source-keeps">OPT-937</issue> with Phase 1.

Two qualifications to the review are retained: typed handlers for different kinds of work are legitimate, and fewer function calls alone do not prove a better design. Success means fewer independent scheduling policies and authoritative storage locations, with correct behavior.

## 2. Evidence and limits of this assessment

The preceding assessment queried Linear live on September 29, 2026 and found **68 OPT issues in Backlog and Todo: 48 Backlog and 20 Todo**, with no further pagination. All returned titles and available description excerpts were reviewed; representative architectural issues were retrieved in full. This count is a dated snapshot, not a continuing claim about the queue.

The working checkout was older than many issues. The initial inspection used Git objects at `1dd5f5b9f42d262bb764ce0c3a3aab91b7939a06`, followed by inspection of `4fe26c6ae96a6798296da49217980b842fda91fb` (<issue id="bdc85b73-dfa4-406e-bfd3-e6a051504fe7" href="https://linear.app/optcg-sim/issue/OPT-876/cannot-draw-prohibition-is-authored-op12-099-but-never-enforced-at">OPT-876</issue>). Revisions 2 and 3 checked key review claims against local `origin/main` at `4fe26c6a`. Revision 3 checked strict persistence validation, undo parsing, End Phase execution, authored damage actions, Life Trigger routing, termination, and <issue id="ceed1560-cf66-4e0a-ab3b-be49ea71eb9a" href="https://linear.app/optcg-sim/issue/OPT-885/op15-002-lucy-gains-no-power-for-cards-trashed-cards-trashed-this-way">OPT-885</issue>. Verify current main before implementation.

Evidence categories in this proposal:

* **Source observations:** Structures and duplicated responsibilities read in the code.
* **Reported behavior:** Reproductions and findings recorded in Linear; not all were independently rerun during this assessment.
* **Review findings:** Claude's independent review supplied by the project owner. Some pasted passages are incomplete; omitted arguments and exact inventories have not been reconstructed.
* **Design hypotheses:** Proposed boundaries expected to reduce repeated errors. These need focused acceptance tests during implementation; the general architecture review is complete.

No engine changes or test runs were performed for the assessment or this document. No implementation schedule, migration percentage, or complete backlog-to-module mapping has been established. The rough PR estimate in §9 is attributed to Claude and has not been independently sized.

The backlog contains more than architecture defects. It includes card-authoring mistakes, missing sets, UI work, questions requiring rulings, and latent hardening concerns. Several findings were discovered while reviewing another fix and explicitly predate that fix. Ticket volume alone does not demonstrate architectural failure. Claude roughly classified 10–12 of about 45 engine tickets as continuation, scheduling, or rule-timing work; this is a review estimate, not a completed census. Audit intensity must not be mistaken for a regression rate.

## 3. What the recurring issues suggest

| Pattern | Representative issues | Proposed response |
| -- | -- | -- |
| Timing advances before unfinished work completes | [OPT-924](<https://linear.app/optcg-sim/issue/OPT-924>): end-turn effects resolve after the active player changes; expiry also occurs before the required effect windows. | Correct the full End Phase order in Phase 0, then consolidate execution. |
| Damage continuation has separate storage and routes | [OPT-926](<https://linear.app/optcg-sim/issue/OPT-926>): remaining effect damage can be lost after a nested prompt; latent for the inspected authored cards. | Move battle and effect damage together in Phase 1; retain synthetic multi-damage coverage. |
| Availability and actual execution disagree | [OPT-864](<https://linear.app/optcg-sim/issue/OPT-864>): costs checked independently rather than in order. [OPT-922](<https://linear.app/optcg-sim/issue/OPT-922>): replacement feasibility becomes stale between prompts. | Shared operation semantics and sequential feasibility. |
| Consumers interpret the same schema differently | [OPT-911](<https://linear.app/optcg-sim/issue/OPT-911>): compound Main/Counter triggers skipped. [OPT-913](<https://linear.app/optcg-sim/issue/OPT-913>): reused effects cannot be found. | Separate schema-consumer consistency work. |
| Rule processing occurs too late | [OPT-862](<https://linear.app/optcg-sim/issue/OPT-862>): emptying a deck can allow further effect resolution and prompts. | Explicit rule-processing checkpoints within execution. |
| Cause, source lifetime, or visibility is ambiguous | [OPT-910](<https://linear.app/optcg-sim/issue/OPT-910>): negation pauses an already-resolved prohibition. [OPT-933](<https://linear.app/optcg-sim/issue/OPT-933>): a Life-order event leaks information. | Separate provenance and visibility work, with explicit integration contracts. |

Keep evidence strength visible. For example, [OPT-880](<https://linear.app/optcg-sim/issue/OPT-880>) demonstrates stale target acceptance in a deliberately modified state but has no demonstrated normal gameplay path. [OPT-937](<https://linear.app/optcg-sim/issue/OPT-937>) concerns lost source identity with an unproven authored end-to-end path. These are useful design stress cases, not equivalent to confirmed player-facing failures.

The inspected schemas contain three `DEAL_DAMAGE`/`SELF_TAKE_DAMAGE` actions: OP06-116, an EB03 On K.O. effect, and OP14-115. Each deals one damage, explicitly or by default. <issue id="4f2816ff-8c39-4524-b3a5-1f33b3096955" href="https://linear.app/optcg-sim/issue/OPT-926/prompted-effect-damage-life-trigger-abandons-the-remaining-damage-of-a">OPT-926</issue> is therefore in the latent category, while the zero-Life damage gap in <issue id="e226c9c6-51fe-442c-9e83-2787312fa064" href="https://linear.app/optcg-sim/issue/OPT-925/effect-damage-deal-damage-to-a-leader-at-0-life-never-defeats">OPT-925</issue> has authored entry points. This classifies the plan only; no Linear priority was changed.

OP06-116 is a confirmed rule-versus-code timing gap and a Phase 1 acceptance case. Its damage is followed by `LIFE_TO_HAND`; `effect-damage.ts:181` parks the defender's Life Trigger, while `surfaceRevealTrigger` waits for an empty effect stack and the resolver continues the original chain. The October audit checked this path against rules 8-6-2/8-6-2-1 and the FAQ timing rulings. Capture actual-pipeline accept and decline fixtures: the defender's Trigger window completes before the subsequent instruction adds a card from the activator's Life. Keep the two players' Life areas distinct. This authored gap is separate from [OPT-926](<https://linear.app/optcg-sim/issue/OPT-926>)'s synthetic multi-damage coverage.

### Concrete architectural friction

At the inspected baseline:

* `pipeline.ts` has action execution and a separate continuation path, including trigger draining.
* `effect-resolver/resolver.ts` owns action-chain execution and nested prompts.
* `effect-resolver/resume/triggers.ts` owns another trigger continuation path.
* `session/prompt-lifecycle.ts` distinguishes replacements, replacement batches, battle damage, cost replacements, effect-stack frames, and legacy resume contexts.
* `EffectStackFrame` contains many optional fields for those different continuation families; `ResumeContext` duplicates some of them.
* `validation.ts` checks effect costs with `costs.every(isCostPayable(...))`, while a separate sequential feasibility implementation exists.
* Replacement feasibility has action-specific checks whose comments explicitly describe mirroring resolver handlers.

These observations support a concern about **duplicated ownership of game meaning**, beyond file size or module count.

The top-level replacement step currently returns no replacement; meaningful replacements occur at consequence sites such as K.O. and removal. This is not inherently a bug: replacing a consequence can be correct. It does mean the seven-step player-action pipeline does not, by itself, provide a universal rules boundary for all internal operations.

### Why this supports consolidation rather than replacement

`runEndPhase` still has a placeholder for end-of-turn effects and expires effects before processing scheduled actions. This needs an ordered end-phase correction, not just an extra trigger event. The latent remainder loss in `executeRevealEffectDamageTrigger` belongs with damage-state consolidation, rather than justifying a new runtime or an urgent Phase 0 rewrite.

Both trigger paths group by controller and offer ordering choices at the top level. Their important difference is nested handling: the pipeline queue immediately scans and prepends newly triggered work, while the resume path regroups pending work and defers some rescanning. An intervening prompt can therefore change the execution path. The rules specify the main ordering cases in §7; executor consolidation must enforce those cases rather than choose arbitrarily between current behaviors.

### Compatibility is the first dependency

Turn state, stack frames, and phase continuations use strict schemas. `parseStoredGameState` throws for unrecognized fields, and `parseStoredSession` applies it to live state and every undo snapshot. A build without updated readers cannot load a newly written frame field, even if that field was optional in the new build. The existing session `formatVersion` and execution-context `version` do not provide an explicit version for all game-state shape changes.

Prompt context validation has the opposite gap: a string is accepted without proving that it names an existing frame. Compatibility work must cover structural parsing and continuation-reference integrity. Accepting more arbitrary data is not a migration strategy.

## 4. Proposed responsibilities

These are conceptual boundaries, not final interfaces or a required folder structure. One referee can contain well-organized modules; it does not mean one giant function.

### A. Existing resolution machinery: one owner and shared bookmarks

Deepen the existing `effectStack` and prompt-lifecycle machinery into one owner of pending execution. Advance until the game needs a player decision, reaches a stable point awaiting a new command, or ends. Move rules scheduling into the engine boundary while retaining session transport and persistence responsibilities outside it.

Its responsibilities include:

* Tracking remaining instructions and their intermediate results.
* Suspending and resuming at choices, including nested choices.
* Preserving queued source identity (instance ID, card ID, controller, effect reference), with activation-time zone eligibility checks and the On K.O. exception; already-activated effects continue after their source leaves.
* Applying the correct timing windows for ordinary triggers, Life Triggers, damage, battle completion, and phase transitions.
* Running rule processing at the required points.
* Returning a complete serializable state to the session boundary.

Introduce explicit kinds of pending work alongside the current phase model, then narrow each kind to the fields it requires. Move battle damage, effect damage, and replacement continuations from turn fields and prompt payloads into this common model. Costs can remain a clearly owned sub-state when that is the natural boundary; consolidation need not flatten every detail into a separate frame.

Prompts should identify a decision owned by a frame, rather than carry another authoritative copy of the unfinished operation. Read old persisted shapes through explicit conversion until the compatibility policy permits their retirement. Specialized frame handlers are expected; independent recursive schedulers and side-channel continuation stores are the problem.

**Timing and source contracts:** OPTCG timing is not a generic last-in-first-out stack. During damage, process the per-point Life check, the applicable attacker's “deals damage to Life” effect, and the defender's Life Trigger choice in that order; the defender's “when you take damage” effect waits until the damage sequence finishes, once per attack for Enel. Other ordinary triggers follow the deferral rules in §7. Queued-trigger snapshots carry identity only, never live power, cost, modifiers, or attached DON!!. Re-check source-zone eligibility at activation (rule 8-1-3-1-3), retain the On K.O. exception (10-2-17-2), and do not repeat that eligibility check after activation (8-2-3). Sugar OP04-024 and Senor Pink OP04-026 pin the two cases.

### B. Shared operations: the meaning of an instruction

Build on `computeCostTargets`, `computeAllValidTargets`, and the existing sequential feasibility code. That code already executes real payment functions on copied state; preserve this approach and extend its coverage before inventing a new operation framework. Availability, prompts, and execution should share the same underlying semantics.

For multiple costs, checking a later cost must account for earlier payments. RNG and ID counters already live inside state, and their helpers return updated copies. Hypothetical execution can allocate IDs and advance RNG on its private branch without consuming the authoritative counters. This is an existing foundation to preserve and test, not a new capability the refactor must invent.

Review gaps include missing replacement processing in hypothetical payment and exceptions escaping a feasibility query, such as an identity assertion failure. Define expected infeasibility separately from a corrupt-state or engine error; do not turn every exception into “cannot pay.” Add boundary tests for state isolation, replacement semantics, and explicit failure outcomes. Existing copy-on-write helpers do not prove that every composed path is free of mutation.

Costs, replacement payments, and resolving effects have different completion rules. Preserve those differences explicitly. A resolving effect can do as much as possible where allowed; a replacement must satisfy its own payment requirements.

Initial feasibility is all-or-nothing under rule 8-3-1-3: determine whether the printed-order sequence can be paid before offering activation. Becoming unable to finish after payment begins is a distinct case: rules 8-3-1-3-1 and 10-2-13-5 call for retaining the paid portion, skipping the post-cost effect, and consuming the once-per-turn use.

**Retained deviation (decision 10):** this consolidation keeps the existing rollback to the activation baseline for mid-payment inability. Paid resources are restored and the once-per-turn use remains available for retry; this is a known departure from those rules. [OPT-864](<https://linear.app/optcg-sim/issue/OPT-864>) must pin a replaced-cost example with a test explicitly labeled as a rules deviation, linked to [OPT-958](<https://linear.app/optcg-sim/issue/OPT-958>), and state the rule-literal outcome beside it. [OPT-958](<https://linear.app/optcg-sim/issue/OPT-958>) stays outside the consolidation milestones. Reassess it during [OPT-948](<https://linear.app/optcg-sim/issue/OPT-948>) acceptance, before closing that ticket, or earlier if a new authored/replacement path exposes or expands the failure or an authoritative ruling changes the interpretation. Record a disposition and next review condition if retained. Payment rollback must not revive a terminal game.

Feasibility must also stay affordable. Prefer lazy search, safe shortcuts, and bounded analysis over eagerly enumerating every possible selection. Determine how uncertainty or an execution budget is handled without silently changing legality.

Retain `isCostPayable` as a documented fast check where it is sound. Do not put today's `costs.every(isCostPayable(initialState, ...))` rejection in front of the sequential evaluator: an earlier cost can make a later cost payable. A fast rejection must rule out every valid sequence or operate on the appropriate intermediate state; otherwise defer to `isCostSequencePayable`. Include the Life Trigger cost gate in [OPT-864](<https://linear.app/optcg-sim/issue/OPT-864>). Prohibitions are an input to shared availability and feasibility under rule 1-3-3. Keep an explicit classification next to the prohibition type union distinguishing activation-time gates from resolution-time restrictions; an execution-time restriction must not be indiscriminately promoted into an activation veto. Blanket removal of cheap checks is out of scope.

### C. Narrow scope: shared replacement scanning and rechecking

Start with a shared scan-and-recheck helper used by batch and battle K.O. replacement paths. Address stale feasibility, offering the next eligible replacement after a decline, and substitute checks that disagree with execution (<issue id="3bac6540-3a38-43bb-bbd7-64d23fa81d1a" href="https://linear.app/optcg-sim/issue/OPT-922/batch-replacement-path-never-re-checks-substitute-feasibility-between">OPT-922</issue>/883/923). Validate the relevant removal paths, including the review's reported field `TRASH_CARD` scanning gap, before broadening callers.

Replacements can suspend for decisions, so keep orchestration above synchronous `zone-transition.ts`. Use the literal reading of rule 8-1-3-4-2: the generating card's own replacement first, then the turn player chooses among theirs, then the non-turn player among theirs. This precedence is **assumed, with no official ruling**; isolate it as an explicit policy and fixture so a later ruling can change it without rewriting the shared helper.

For the simultaneous-removal patterns covered by OP11-001 Koby, OP15-009, OP05-001 Sabo, and OP05-032 Pica, pin one payment for the applicable batch replacement, keep batch members on the field during payment, and prohibit removing a member first to fund a sibling. Preserve each card's applicability rather than generalizing one payment across unrelated replacements. Substitute feasibility must have a per-action contract rather than silently defaulting new actions to feasible. Koby's original hotfix claim was withdrawn because [OPT-873](<https://linear.app/optcg-sim/issue/OPT-873>) already fixes it; keep its tests. Domain fixes such as [OPT-921](<https://linear.app/optcg-sim/issue/OPT-921>)'s attached-DON!! target pool still need explicit coverage.

Defer a general consequence service until a concrete failure cannot be handled cleanly by this narrower boundary. <issue id="ceed1560-cf66-4e0a-ab3b-be49ea71eb9a" href="https://linear.app/optcg-sim/issue/OPT-885/op15-002-lucy-gains-no-power-for-cards-trashed-cards-trashed-this-way">OPT-885</issue> (`3de2fb5d`) already scopes `*_THIS_WAY` counts to action results or cost references, including persisted continuation references. Preserve that contract and its tests; it is not evidence that a new service is missing.

Replacement-aware cost feasibility must distinguish carrying out a substitute from paying the printed activation cost. Use §8-3-1-7 and any applicable card ruling to decide whether the post-cost effect can proceed; do not use a generic replacement-success boolean as proof of payment.

### D. Separate workstream: consistent card interpretation

Preserve the schema-driven approach. Start with shared trigger matching and effect lookup, plus validation that authored references resolve. <issue id="3a294b0e-5cfc-4831-bffa-846de8401a4c" href="https://linear.app/optcg-sim/issue/OPT-911/11-compound-maincounter-events-never-resolve-either-effect-consumers">OPT-911</issue> (Urgent in the reviewed queue) and <issue id="9bfd79f8-ab88-4043-85ef-d69afd81ef45" href="https://linear.app/optcg-sim/issue/OPT-913/reuse-effect-target-lookup-misses-11-triggers-block-id-targets-any-of">OPT-913</issue> have no dependency on continuation consolidation; schedule them independently when work begins. Consider a preparation or normalization pass only if these smaller shared contracts prove insufficient.

Candidate responsibilities:

* Normalize compound triggers and supported aliases.
* Resolve reused effects to unambiguous references.
* Check that intermediate-result references are valid in the branch where they are used.
* Reject unsupported parameters or instruction shapes before a game starts.
* Retain card, effect, and instruction identifiers for debugging.

These are candidate improvements for that workstream, not prerequisites for the scheduling refactor. A new executable card representation or compiler framework is not currently justified. Validating a definition cannot prove that it correctly represents the printed card; card-text and FAQ tests remain necessary.

### E. Separate workstreams: provenance, visibility, and randomness

Keep distinct concepts explicit: effect controller, acting player, chooser, card owner, affected player, and permitted viewers. Determine when source information must be captured so movement cannot destroy required context.

Distinguish continuously generated effects from lasting results of already-resolved effects. Negating a source should affect each according to its rules, rather than merely according to whether the source still exists on the field. Claude also raised possible analogous modifier and keyword problems; these remain hypotheses requiring their own source investigation and reproductions.

Use a consistent visibility policy across prompts, state projections, events, history, reconnects, and spectators. Ownership of a card does not automatically grant knowledge of its hidden identity or order. Audit correlatable identifiers as well as card names.

Preserve deterministic execution while addressing the hidden-information RNG concern in [OPT-888](<https://linear.app/optcg-sim/issue/OPT-888>). That issue reports a theoretical weakness, not a demonstrated exploit. This is separate correctness/security work; a test suite alone cannot prove unpredictability. Do not postpone visibility or RNG fixes until scheduling is consolidated. Coordinate any source metadata changes with frame migration, without making every workstream a prerequisite for every other one.

## 5. Scope of the refactor

| Preserve where sound | Consolidate in place | Retire after behavior and compatibility are proven |
| -- | -- | -- |
| Game board, deck builder, and card database | Pending-work ownership and frame types | Independent scheduling and trigger-draining paths |
| Session authorization, connections, and transport | Availability and sequential feasibility | Hand-written feasibility mirrors once equivalent coverage exists |
| Centralized zone-transition behavior | Shared replacement scan/recheck above zone transitions | Misleading top-level replacement stub, after caller review |
| Execution context and real payment functions | Save/restore conversion for old continuation shapes | `ResumeContext` as an independently persisted execution shape |
| Target queries, behavioral tests, and card corpus | Rules checkpoints and terminal cleanup | Compatibility readers after the support window ends |

Preserving a subsystem means retaining its useful design and code, not promising zero edits. Prompt types and saved-state changes may require coordinated client and persistence updates.

Separate scope: schema-consumer consistency, effect origin, visibility, and RNG. They need their own acceptance cases and do not automatically disappear when scheduling improves.

Non-goals: a second runtime, a UI redesign, replacing Cloudflare, changing programming language, rewriting every card, a new card compiler by default, a general consequence framework, a general-purpose rules platform, or full event sourcing.

## 6. Alternatives and revised decision

| Option | Benefit | Main risk |
| -- | -- | -- |
| Continue targeted fixes | Small changes and immediate progress on known bugs | Repeated fixes across separate execution paths may continue. |
| Consolidate existing continuation and legality code in place | Can reduce duplication with less migration machinery | Existing frame shapes and handoffs may constrain the result. |
| Introduce a replacement execution core behind existing boundaries | Makes timing, choices, and consequences explicit while retaining investments | Requires compatibility work and a carefully controlled transition. |
| Rebuild the entire engine | Broad freedom to change assumptions | Recreates substantial working behavior and expands regression scope. |

**Revised preference:** consolidate in place. The smaller-consolidation tie-breaker in revision 1 applies: existing frames, prompt handling, and payment executors provide most of the required foundations. Replacement introduces migration machinery without a demonstrated need.

Revisit a replacement core only if the frame model cannot represent damage-wide trigger deferral without side channels, or a correct unified trigger executor requires re-entrant scheduling the stack cannot express. Neither review found evidence that these limitations are likely. A difficult implementation or a large backlog alone would not reopen the decision.

## 7. Sequencing and decision gates

### Baseline and rules fixtures

Confirm current main and the issue queue. Capture current behavior, distinguish reachable failures from synthetic tests, and run the existing suites before implementation changes.

The repository contains rules v1.2.0. The [official rules](<https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf>) are v1.2.1, dated August 28, 2026. For this final revision, the relevant End Phase, nested-trigger, damage-interruption, and replaced-cost provisions were checked and remain substantively consistent with the cited repository text. This was a focused comparison, not a complete version diff. Complete the remaining reconciliation during baseline work without treating the main ordering cases as undecided.

The timing fixtures must assert:

| Rule | Fixture and expected order |
| -- | -- |
| §8-6-1 | Turn-player A and opponent X are pending; A creates turn-player C. Finish **A → X → C**. |
| §8-6-1-1 | Same-player A and B are pending; the player chooses A first and A creates C. Finish **A → B → C**. |
| §6-6-1-1-2; §6-6-1-2; §6-6-1-3 | Complete the ending player's End Phase trigger wave, then the opponent's wave. Then run the three expiry stages: turn player's scheduled end-of-turn effects and “until end of turn” expiry; non-turn player's equivalents; “during this turn” expiry for both. An End of Your Turn effect newly fulfilled within a wave resolves in that wave before advancing; use ST13-002 with Bonney/Kalgara and the loop budget. |
| §8-6-2-1 | OP06-116 is a confirmed Phase 1 timing gap: accept and decline the defender's Life Trigger before the following LIFE_TO_HAND instruction takes from the activator's Life. Cover a nested prompt and reload with the two Life areas kept distinct. |
| §8-6-2; FAQ damage timing | Per point: Life check → applicable attacker's “deals damage to Life” effect → defender's Life Trigger choice. After the final point, resolve the defender's “when you take damage” effect once per attack for Enel OP05-098. Use the OP03 damage FAQs, OP13-002 Ace, and Double Attack with a first-point Trigger changing Life before point two. Do not treat “ordinary triggers wait” as suppressing the specified attacker window. |

Additional fixtures: source removed before activation versus after activation (Sugar OP04-024 / Senor Pink OP04-026); battle-zone checks at Attack, Block, and Counter step ends; simultaneous defeat at one checkpoint versus sequential defeat in later instructions; and the already-correct Double Attack into 1 Life and Koby substitute-feasibility behavior ([OPT-886](<https://linear.app/optcg-sim/issue/OPT-886>), [OPT-873](<https://linear.app/optcg-sim/issue/OPT-873>)). Preserve these baseline fixes through consolidation.

Run both nested-trigger fixtures continuously and with a prompt inside A, holding player choices constant. Repeat with a serialization/reload before the response. The required order must not depend on whether execution crossed a prompt boundary. These fixtures are the authority for merging executors.

### Phase 0 — Compatibility first, then reachable correctness fixes

**PR 1: saved-state compatibility groundwork.** It must precede any writer that adds frame metadata, source snapshots, or an End Phase stage.

* Define an explicit game-state schema version, separate in meaning from the existing session storage `formatVersion` and execution-context version. Specify the version assigned to legacy saves.
* Introduce one versioned conversion entry point for live state and every undo snapshot. Validate the recognized input version, convert it, strictly validate the output, and validate continuation references. Do not discard unknown fields merely to make parsing succeed.
* Define the initial frame `kind` contract alongside the version contract, while retaining `phase`. Ship read support first; new Phase 0 writers then produce the intended shape without a second representation migration.
* Readers must understand the meaning of supported new fields, not merely accept their syntax. Include the proposed end-phase stage in the compatibility plan before it is written.
* Collect real captured paused sessions, including undo snapshots, with sensitive user/session information removed while preserving game structure. Supplement with constructed malformed-state fixtures; do not call constructed states real captures.
* Test old-save conversion, each supported new shape, missing-frame references, mixed historical undo entries, and controlled failure on unsupported versions.

**Deployment order:** release readers/converters while continuing to write the existing shape; verify them as the supported rollback baseline; then enable new-format writers in a later release. A reader-first PR does not make the original strict-reader build compatible. Once a new writer is enabled, rollback must use a reader-capable build or an independently tested reverse conversion. Record this boundary explicitly.

After that groundwork:

1. [OPT-924](<https://linear.app/optcg-sim/issue/OPT-924>): correct the full End Phase sequence. Extend frame-owned `PhaseBoundaryContinuation` with a stage. Resolve the ending player's trigger wave, then the opponent's wave, including newly fulfilled End of Your Turn effects in the same wave until no new work remains, bounded by the engine budget. Then process the turn player's scheduled end-of-turn effects and “until end of turn” expiry, the non-turn player's equivalents, and finally “during this turn” expiry for both before handoff. Tag each scheduled obligation with its rules-defined stage; “scheduled action” is an implementation concept. Preserve choices, Brook's deferred-loss window, and the corresponding Refresh Phase ordering fixture (OP11-040). Reuse existing grouping without introducing a third trigger policy.
2. [OPT-949](<https://linear.app/optcg-sim/issue/OPT-949>) with [OPT-862](<https://linear.app/optcg-sim/issue/OPT-862>)/[OPT-925](<https://linear.app/optcg-sim/issue/OPT-925>): one joint rule-processing checkpoint and terminal writer. Evaluate both players' defeat conditions at the same checkpoint, apply loss modifications, then write one outcome and clear all live decisions. Check after each deck/Life-changing card move, each damage determination, before a prompt, and at action end; multi-card draw/mill checks between cards. Pass explicit qualifying damage context: zero Life alone is not defeat, and taking the last Life card does not by itself create lethal damage. Conditions at separate sequential instructions cannot be accumulated into a draw after an earlier checkpoint ends play. Route WIN_GAME and all terminal writers through the common boundary while retaining win, draw, concession, abandonment, diagnostics, and notification distinctions. Engine-budget exhaustion gets a distinct engine-limit outcome; the declared-count loop protocol remains outside scope in [OPT-952](<https://linear.app/optcg-sim/issue/OPT-952>).
3. [OPT-864](<https://linear.app/optcg-sim/issue/OPT-864>): sequential cost availability, including the Life Trigger cost gate, activation-time prohibitions, sound fast checks, and hot-path measurements. Preserve the activation-versus-resolution prohibition classification in §4B. Pin the retained mid-payment rollback as a named rules-deviation fixture linked to [OPT-958](<https://linear.app/optcg-sim/issue/OPT-958>); its passing result is compatibility evidence, not rules conformance. No new frame is needed.
4. <issue id="3bac6540-3a38-43bb-bbd7-64d23fa81d1a" href="https://linear.app/optcg-sim/issue/OPT-922/batch-replacement-path-never-re-checks-substitute-feasibility-between">OPT-922</issue>: local replacement recheck. Include the small batch recheck here so the competing-Life-payment fixture is an actual Phase 0 acceptance gate. Broader helper consolidation stays in Phase 3.

End-phase legacy saves require special care. At the old boundary, expiry has already run, a scheduled action may be suspended, and `remainingScheduledActions` may still contain work. The normal end-turn effect windows have not run. A missing stage therefore cannot mean “start the new End Phase again,” nor does it prove all scheduled actions finished. Specify a conversion/compatibility outcome from captured progress; if required information has already been erased, explicitly preserve the supported legacy boundary behavior or reject with a recovery path. Never replay completed actions or invent expired effects.

**Phase 0 acceptance scenarios:**

| Scenario | Required observation |
| -- | -- |
| ST13-002 with Bonney/Kalgara | Correct effect waves and active player, with modifiers retained until their proper expiry stage. |
| Brook's delayed deck-out at turn end | Deferred loss is evaluated at the correct boundary without losing the recorded deck-empty condition during handoff. |
| EB01-051 pays a deck-emptying MILL cost | Required defeat processing precedes further gameplay, honoring applicable loss modifications. |
| EB03 On K.O. damage and OP14-115 self-damage at zero Life | The reachable damage defeat is recorded and remaining gameplay is stopped. |
| OP07-079 Rob Lucci with insufficient deck cards | Unpayable optional activation is not offered as payable. |
| Mass K.O. with replacements competing for one Life | Paying the first changes the second's eligibility; the same Life cannot pay twice. |
| Both players meet defeat conditions at the same checkpoint | One joint evaluation yields a draw; use an explicitly constructed checkpoint fixture where necessary and identify it as synthetic. |
| An earlier instruction ends play before a later instruction could defeat the other player | Stop at the first terminal checkpoint; never continue merely to manufacture a draw. |
| Zero Life with no qualifying lethal damage; damage takes the last Life card | Neither condition alone ends the game. Qualifying battle/effect damage at zero Life defeats; preserve Double Attack into 1 Life under <issue id="54b572ba-c38a-437b-8d2c-9be3a8c3a143" href="https://linear.app/optcg-sim/issue/OPT-886/double-attack-against-1-life-can-end-the-game-faq-says-it-cannot-win">OPT-886</issue>. |
| WIN_GAME mid-chain; legal chain exceeds engine budget | No later instructions or prompts; explicit win and engine-limit outcomes remain distinct from a rules draw. |
| Replaced cost becomes unpayable after payment begins | Retained rollback restores the activation baseline and permits retry; label this as known rules debt under <issue id="7bb5d66e-b984-4ab5-9888-8d4248fec55d" href="https://linear.app/optcg-sim/issue/OPT-958/review-retained-mid-payment-rollback-and-once-per-turn-retry-deviation">OPT-958</issue> and state the rule-literal result beside the fixture. |
| Legacy mid-End-Phase session and undo snapshot | Both pass the same conversion path with an explicit disposition; no repeated payment, scheduled action, or expiry. |

**Exit:** compatibility deployment gates pass, the listed reachable fixes pass through the existing engine, and terminal state contains no live gameplay decisions. Latent <issue id="4f2816ff-8c39-4524-b3a5-1f33b3096955" href="https://linear.app/optcg-sim/issue/OPT-926/prompted-effect-damage-life-trigger-abandons-the-remaining-damage-of-a">OPT-926</issue> is excluded from Phase 0.

### Phase 1 — Consolidate coupled pending-work representations

Complete the frame-kind union and move coupled state together:

* Effect damage in `turn.pendingTriggerFromEffect`.
* Battle Life Trigger state in `battle.pendingTriggerLifeCard` and `turn.pendingBattleDamageContinuation`.
* `REPLACEMENT` and `REPLACEMENT_BATCH` executable prompt contexts.
* Event-activation completion debt and its relationship to nested frames.
* Identity-only queued-trigger source snapshots ([OPT-937](<https://linear.app/optcg-sim/issue/OPT-937>)) and activation-time source-zone eligibility; no snapshot of live power, cost, modifiers, or attached DON!!.

Battle sub-phase state and omitted pending work are explicitly owned by [OPT-950](<https://linear.app/optcg-sim/issue/OPT-950>): step, redirect window, Blocker lock, target lock, and the pending step-end checkpoints. This adds state, so bump the game-state schema version and ship semantic readers/converters before writers. The scheduler executes those checkpoints in Phase 2 ([OPT-951](<https://linear.app/optcg-sim/issue/OPT-951>)).

Damage migration includes the `REVEAL_TRIGGER` command route, which currently returns through the pipeline, plus trigger surfacing in the coordinator. Update visibility, history retention, validation, termination, and state projection together. Moving only the storage field leaves its readers inconsistent.

Fix the confirmed OP06-116 instruction/Trigger ordering gap through the actual pipeline with accept, decline, nested-choice, and reload fixtures. Enforce the damage windows in §7. Preserve synthetic multi-damage tests for [OPT-926](<https://linear.app/optcg-sim/issue/OPT-926>) as latent coverage, including two damage instructions, nested choices, and reloads; do not relabel that synthetic case as an authored failure.

Inventory all owners, not just the damage fields: effect/cost frames, phase-boundary stages and scheduled obligations (including END_OF_THIS_BATTLE and instance-bound targets), batch markers, replacement contexts, root `pendingEventActivationEvents`, legacy structural `ResumeContext`, and pregame work. Include overflow/rule-trash continuation with queued triggers, Trigger staging identities, once-per-turn usage, battle sub-phases and target locks, loss modifications, and Event-activation source zone/class. Map each to authoritative state, a reference, a derived projection, or an explicit lifecycle boundary; counters need not become instructions. Undo snapshots use the same conversions.

**Exit:** a single authoritative representation for each migrated operation, reference-valid prompts, converted live and undo states, and no lost or duplicated pending work.

### Phase 2 — One drain loop and one trigger executor

Consolidate advancement of pending work and nested-trigger execution under the timing fixtures above. Inventory `processPlayerTriggerGroup → processTriggerQueuePipeline`, `processRemainingTriggers`, `scanEventsForTriggers`, `reenterBatchResume`, the scheduled-action loop, and `surfaceRevealTrigger`. A scan helper may remain, but its callers must not independently decide scheduling.

[OPT-951](<https://linear.app/optcg-sim/issue/OPT-951>) runs Attack-, Block-, and Counter-step zone checkpoints after any work suspended within that step completes, before entering the next step (rules 7-1-1-4, 7-1-2-3, 7-1-3-3). If a combatant has left the required area, advance to End of Battle. Preserve redirect/target-lock semantics and verify the same result across prompts and reloads. Apply the distinct attacker-damage, Life Trigger, and after-damage windows from §7 through this owner.

This phase includes aligning handler return contracts across resume code and its callers. Claude estimated roughly 37 drain call sites and about 6,000 lines of resume code; remeasure those navigation counts at implementation baseline.

**This is the highest-risk phase.** Classify every behavioral difference as an intended correction, another demonstrated baseline defect, or a regression. Unexplained differences block rollout. Preserve specialized handlers that return control to the shared owner.

**Exit:** one advancement owner, one trigger-order implementation, removal of alternative executors, and identical rule-required results across uninterrupted, prompted, and restored execution.

### Phase 3 — Narrow replacement and feasibility consolidation

Share scanning and rechecking between batch and battle replacement paths. Cover <issue id="7df512c8-89e9-4b9b-a6fa-67ee51edfc6f" href="https://linear.app/optcg-sim/issue/OPT-883/battle-ko-replacements-offer-the-next-matching-replacement-after-a">OPT-883</issue>'s decline-then-next-match behavior, <issue id="4b1b04b5-14f6-4765-8d01-90e9acef5e1c" href="https://linear.app/optcg-sim/issue/OPT-923/replacement-feasibility-gaps-player-choice-offers-infeasible-branches">OPT-923</issue>'s substitute feasibility, the Phase 0 <issue id="3bac6540-3a38-43bb-bbd7-64d23fa81d1a" href="https://linear.app/optcg-sim/issue/OPT-922/batch-replacement-path-never-re-checks-substitute-feasibility-between">OPT-922</issue> regression, and any reproduced missing scan path. Review <issue id="bdbbdedc-659c-4795-86ce-c0cc92eaa529" href="https://linear.app/optcg-sim/issue/OPT-921/return-don-to-deck-never-returns-attached-don-although-from-your-field">OPT-921</issue>'s target-pool semantics independently.

Reuse real execution for substitute checks where drift is proven, with an explicit per-action feasibility contract. Apply the precedence assumption and card-scoped batch-payment rules in §4C; preserve Koby's already-correct behavior ([OPT-873](<https://linear.app/optcg-sim/issue/OPT-873>)). Extend cost feasibility for replacements under the printed-payment and prohibition contracts, keeping sound cheap checks. A substitute being executable and an activation cost being paid as printed are separate outcomes. During [OPT-948](<https://linear.app/optcg-sim/issue/OPT-948>) acceptance, reassess the rollback deviation in [OPT-958](<https://linear.app/optcg-sim/issue/OPT-958>) and record its disposition before closing <issue id="b2735e4a-7d09-4517-90e2-d2176c87cbc0" href="https://linear.app/optcg-sim/issue/OPT-948/make-cost-feasibility-replacement-aware-using-real-payment-execution">OPT-948</issue>; the accepted rollback remains in force unless separately changed.

**Exit:** the shared paths offer and execute the same legal replacements, recheck after intervening payments, preserve cause and timing, and remain within measured search budgets. No general consequence service is required.

### Rollout requirements throughout

Keep the reader-first policy, schema support window, conversion fixtures, and rollback target explicit for every format change. Remove old readers only after their supported live and undo snapshots have an agreed disposition. Do not route ordinary gameplay through parallel authoritative runtimes.

Keep independent urgent fixes moving. Close tickets only when their acceptance scenarios pass; a shared abstraction is not sufficient evidence.

## 8. Validation strategy

Test from the engine boundary: **command → decisions → responses → observable result**. Keep useful unit tests for complex calculations, but avoid making internal frame layouts the primary correctness contract.

Required properties include:

* Saving and restoring at every supported decision produces equivalent outcomes to uninterrupted execution under the same recorded execution context and version.
* Rejected or duplicate responses do not replay costs or effects; clarify any deliberate rejection bookkeeping.
* Hypothetical evaluation leaves authoritative state, randomness, IDs, and published history unchanged.
* Sequential payments and replacement choices cannot spend a resource twice.
* Timing-dependent effects observe the appropriate turn, source, and state.
* Each committed consequence is recorded and processed once in its applicable timing context.
* Joint defeat is evaluated per checkpoint using qualifying damage context. Sequential instructions after a terminal checkpoint never run, and zero Life alone never implies defeat. Terminal games cannot continue unresolved gameplay or expose new actionable prompts.
* Two states differing only in information hidden from a viewer produce equivalent permitted views, except where a rule grants knowledge.
* Within the separate schema-consumer workstream, every supported authored effect reference resolves, and unsupported definitions fail before play.

Use the existing engine for differential comparison where helpful, but resolve differences against rules, card text, and FAQs. Existing green tests can encode wrong assumptions. Preserve scenario coverage while correcting those expectations. The retained payment rollback is explicitly an exception: label its fixture as a known rules deviation, link [OPT-958](<https://linear.app/optcg-sim/issue/OPT-958>), and record the rule-literal outcome separately. Review it at <issue id="b2735e4a-7d09-4517-90e2-d2176c87cbc0" href="https://linear.app/optcg-sim/issue/OPT-948/make-cost-feasibility-replacement-aware-using-real-payment-execution">OPT-948</issue> acceptance or the earlier triggers in §4B. Preserve the existing correct Double Attack and Koby expectations; the audit's claims that they were unfixed were withdrawn.

Performance checks should include large target pools, multi-cost feasibility, nested effects, Worker execution budgets, and serialized state size. Establish thresholds from measurements rather than inventing them in this proposal.

## 9. Success criteria, stop conditions, and effort

The consolidation should show more than passing tests. Record a before/after comparison for the same scenarios:

* Which modules must understand pause/resume?
* How many places define an operation's legality?
* Does adding a new prompting operation require changes to unrelated resume routers?
* Can a trace explain what remains pending and why a choice is legal?
* What new compatibility machinery is required, and when can it be deleted?
* Does the design remain understandable when simultaneous processing, replacements, and source movement interact?

Track authoritative pending-work stores, independent drain loops, and callers that implement their own ordering policy. Call counts such as `processRemainingTriggers` are useful navigation aids, but a rename or wrapper does not count as reducing responsibility. Claude's estimate of roughly 13 pending-work kinds across 10 storage locations should be replaced with an explicit inventory before setting numeric targets.

Stop and revise a phase if:

* A new kind of frame still needs a side-channel bookmark or its own scheduler to resume correctly.
* Supported persisted sessions lose information or fail their round-trip fixtures.
* Storage and execution ownership remain duplicated after the relevant consolidation step.
* Merging trigger executors produces unexplained behavior changes.
* Feasibility becomes a second interpreter or becomes impractical on realistic target pools.

Typed handling for damage, end-phase work, or replacements is expected. The presence of per-kind behavior alone is not a reason to reject the design; bypassing common scheduling and persistence contracts is.

The expected benefit of the core consolidation is that a new card mechanic inherits correct sequencing, choices, and persistence from shared machinery. Provenance and visibility improvements come from their coordinated workstreams. No claim is made that every future card can be added without an engine change.

Claude's final review estimated **approximately 14–23 PRs, mostly Large-tier**, for the core consolidation:

| Phase | Preliminary PR estimate |
| -- | -- |
| Phase 0: compatibility foundation and reachable fixes | 5–7 |
| Phase 1: common pending-work representation | 4–6 |
| Phase 2: one drain loop and trigger executor | 3–6 |
| Phase 3: replacement scan/recheck and demonstrated feasibility drift | 2–4 |
| **Total** | **14–23** |

This is Claude's planning estimate, not an independently validated commitment. It assumes roughly three review rounds per engine PR and continued bug fixing alongside the work. The separate schema, provenance, visibility, and RNG workstreams require additional sizing. The biggest uncertainties are the support window for old saves, additional incorrect timing expectations uncovered by fixtures, and review rounds. Re-estimate after Phase 0 and the pending-work inventory. PR count does not establish a calendar duration.

## 10. Decision register and implementation prerequisites

The architecture review is complete. The October 9 decisions are integrated into the responsibilities, fixtures, and phase acceptance criteria in §§4–8. This register records their ownership and provenance; it is not an addendum that overrides contradictory earlier instructions. This planning document does not authorize engine implementation or deployment.

The audit (`docs/game-engine/CONSOLIDATION-PROPOSAL-AUDIT-2026-10.md`, with leg reports under `docs/game-engine/audits/consolidation-2026-10/`) checked rules v1.2.0, 1,257 FAQ rulings, and baseline `4fe26c6a`. Four High gaps and eleven decisions were resolved by the project owner on October 9. Two original bug claims were withdrawn: Double Attack into 1 Life and Koby OP11-001 were already fixed by [OPT-886](<https://linear.app/optcg-sim/issue/OPT-886>) and [OPT-873](<https://linear.app/optcg-sim/issue/OPT-873>). Preserve those regressions.

### Resolved decisions

| \# | Decision | Current contract and implementation location | Owner |
| -- | -- | -- | -- |
| 1 | Source-left eligibility | Identity-only snapshots; source-zone eligibility at activation with the On K.O. exception; no repeat eligibility check after activation. Sugar/Senor Pink fixtures; §§4A and 7 Phase 1. | [OPT-937](<https://linear.app/optcg-sim/issue/OPT-937>), Phase 1 |
| 2 | Damage windows | Per point: Life check, applicable attacker damage effect, defender Life Trigger choice; defender taking-damage effect after the final point, once per attack for Enel. OP06-116 accept/decline is a confirmed acceptance case; §§3, 4A, and 7. | [OPT-939](<https://linear.app/optcg-sim/issue/OPT-939>) fixtures, Phase 1 |
| 3 | Joint defeat checkpoint | Evaluate both players at the same checkpoint, with explicit qualifying damage context, then write once. Zero Life alone is not defeat; do not run later instructions to manufacture simultaneous defeat. Check each deck/Life-changing move, damage determination, pre-prompt boundary, and action end; multi-card draw/mill checks between cards. WIN_GAME and loss modifications use the common terminal boundary; §7 Phase 0. | [OPT-949](<https://linear.app/optcg-sim/issue/OPT-949>), 0B |
| 4 | Double Attack into 1 Life | Already fixed. Preserve `pipeline.test.ts:669` and `opt-239-double-attack-damage-split.test.ts:353` (baseline line references); §7 fixtures and Phase 0. | [OPT-886](<https://linear.app/optcg-sim/issue/OPT-886>) regression coverage |
| 5 | Engine budget versus rules loop | Budget exhaustion is an engine-limit outcome, distinct from a rule 11-1-1-1 draw. Declared-count rules 11-1-1-2/11-1-1-3 remain outside this project. A budget may still terminate a game whose loop the rules would let a player stop; §7 Phase 0. | [OPT-949](<https://linear.app/optcg-sim/issue/OPT-949>); [OPT-952](<https://linear.app/optcg-sim/issue/OPT-952>) deferred protocol |
| 6 | Battle step-end checkpoints | Phase 1 owns battle step, redirect window, Blocker lock, target lock, and pending checkpoints with versioned readers. Phase 2 runs Attack/Block/Counter checks after suspended step work completes; §7 Phases 1–2. | [OPT-950](<https://linear.app/optcg-sim/issue/OPT-950>), [OPT-951](<https://linear.app/optcg-sim/issue/OPT-951>) |
| 7 | Replacement precedence | Generating card's replacement, then turn player's choices, then non-turn player's choices. Assumed literal reading of rule 8-1-3-4-2, without an official ruling; isolate the policy/fixture; §§4C and 7 Phase 3. | [OPT-883](<https://linear.app/optcg-sim/issue/OPT-883>) |
| 8 | Batch replacement | For the cited simultaneous-removal card patterns, one applicable replacement payment covers the batch, members stay on the field during payment, and no member is removed first to fund a sibling. Per-action substitute feasibility; Koby's hotfix claim is withdrawn; §§4C and 7 Phase 3. | [OPT-923](<https://linear.app/optcg-sim/issue/OPT-923>) |
| 9 | End Phase expiry | After the two trigger waves: turn player's scheduled end-of-turn effects and “until end of turn” expiry; non-turn player's equivalents; then “during this turn” expiry for both. Newly fulfilled End of Your Turn effects stay in their wave, bounded by the engine budget. Tag obligations by rules stage and preserve Refresh ordering (OP11-040); §7 Phase 0. | [OPT-924](<https://linear.app/optcg-sim/issue/OPT-924>) |
| 10 | Mid-payment inability | Retain baseline rollback as a deliberate deviation: paid resources restored, post-cost effect skipped, once-per-turn use unconsumed and retry possible. Rule-literal behavior retains the paid portion and consumes the use. Label the replaced-cost fixture as rules debt. Reassess during <issue id="b2735e4a-7d09-4517-90e2-d2176c87cbc0" href="https://linear.app/optcg-sim/issue/OPT-948/make-cost-feasibility-replacement-aware-using-real-payment-execution">OPT-948</issue> acceptance before closure, or earlier on new/expanded reachability or a relevant authoritative ruling; §§4B, 7, and 8. | [OPT-864](<https://linear.app/optcg-sim/issue/OPT-864>) compatibility; [OPT-948](<https://linear.app/optcg-sim/issue/OPT-948>) reassessment; [OPT-958](<https://linear.app/optcg-sim/issue/OPT-958>) follow-up outside milestones |
| 11 | Prohibitions in feasibility | Shared feasibility and availability consult prohibitions. Keep activation-time gates distinct from resolution-time restrictions in a classification beside the prohibition union; §§4B and 7 Phases 0/3. | [OPT-864](<https://linear.app/optcg-sim/issue/OPT-864>), [OPT-948](<https://linear.app/optcg-sim/issue/OPT-948>) |

### Remaining implementation prerequisites

* Establish the old-save support window, captured live/undo inventory, and explicit conversion or rejection policy before enabling new writers ([OPT-940](<https://linear.app/optcg-sim/issue/OPT-940>)).
* Establish a reader-capable rollback build with semantic support for each new shape before its writer deployment. The original strict-reader binary is not a rollback target after incompatible writes.
* Capture and classify the §7 fixtures, including synthetic cases and the deliberately retained rollback behavior ([OPT-939](<https://linear.app/optcg-sim/issue/OPT-939>), [OPT-864](<https://linear.app/optcg-sim/issue/OPT-864>)).
* Correct Doc 08's known false guarantees during baseline work and keep structural documentation aligned as phases land ([OPT-939](<https://linear.app/optcg-sim/issue/OPT-939>), [OPT-956](<https://linear.app/optcg-sim/issue/OPT-956>)); complete rules-version reconciliation in [OPT-957](<https://linear.app/optcg-sim/issue/OPT-957>).
* At the <issue id="7bb5d66e-b984-4ab5-9888-8d4248fec55d" href="https://linear.app/optcg-sim/issue/OPT-958/review-retained-mid-payment-rollback-and-once-per-turn-retry-deviation">OPT-958</issue> review condition, record whether the deviation is retained with rationale and a next review condition or assigned a correction. A passing compatibility fixture or completion of consolidation does not close that rules debt.

Separate workstreams remain outside this project's milestones: value layers ([OPT-953](<https://linear.app/optcg-sim/issue/OPT-953>)), negation scope ([OPT-954](<https://linear.app/optcg-sim/issue/OPT-954>)), broader batch/distribution semantics ([OPT-955](<https://linear.app/optcg-sim/issue/OPT-955>)), declared-count loops ([OPT-952](<https://linear.app/optcg-sim/issue/OPT-952>)), payment rollback rules debt ([OPT-958](<https://linear.app/optcg-sim/issue/OPT-958>)), and the separately scoped schema, provenance, visibility, and RNG work. They retain their own acceptance and sizing. This project improves execution scalability; it does not claim to supply every semantic primitive needed by future sets.

### Required conversion dispositions

For each shape below, provide a fixture and an explicit result: lossless conversion, a specified compatibility/recovery path, or a clear rejection. Apply the same policy to live state and every undo snapshot.

* Phase-boundary frames with no stage, including a currently suspended scheduled action and a nonempty remaining-action list.
* Legacy structural `ResumeContext` objects and `isLegacyCostTransactionFrame` cases.
* <issue id="401f4946-8849-4752-be2e-684d154a0fde" href="https://linear.app/optcg-sim/issue/OPT-884/battle-continuation-hardening-end-the-battle-when-an-orphaned-ko">OPT-884</issue> sessions already stuck in `DAMAGE_STEP`.
* String frame references that point to no existing frame or to an incompatible kind.
* Pending damage, replacement, and event-activation records whose ownership moves in Phase 1.

### Project milestone map

Phase 0 is split into two milestones so compatibility is a visible prerequisite, not a checklist buried inside a gameplay change. The split does not add to the Phase 0 PR estimate.

1. **0A — Saved-state compatibility:** version contract, readers, conversions, captured live/undo fixtures, and rollback baseline.
2. **0B — Reachable correctness fixes:** full End Phase order, terminal path, sequential cost availability, and batch replacement recheck.
3. **1 — Unified pending-work frames:** coupled damage/replacement/activation state, consumers, and source snapshots.
4. **2 — One scheduler and trigger executor:** return contracts, timing fixtures, and retirement of competing execution paths.
5. **3 — Replacement and feasibility consistency:** shared scan/recheck and targeted substitute/payment feasibility fixes.

Milestones are ordered acceptance gates without invented dates. Independent schema, visibility, provenance, and RNG tickets remain separately scoped; listing their dependencies does not move or duplicate them automatically.

## 11. Starting points for source review

Use current main for conclusions. **Doc 08 is not a trustworthy description of all current control flow.** At the reviewed revision it claims every mutation passes through all seven steps, describes the top-level replacement interceptor as operative, and documents zero-power K.O. behavior not implemented by the actual defeat path. Step 7 itself exists; the problem is its documented guarantees and checks. Its `TURN_ENDED` description also obscures the missing end-of-turn effect window.

Confirm behavior in source and official rules. Correcting documentation is part of baseline work; do not implement its stale claims to make code agree with prose. This revision records the discrepancy but does not edit Doc 08.

The following pinned links preserve the initial architectural baseline. Revisions 2 and 3 checked its immediate successor, `4fe26c6a`:

* [Effect frames and resume context](<https://github.com/corycunanan/optcg-sim/blob/1dd5f5b9f42d262bb764ce0c3a3aab91b7939a06/workers/game/src/types.ts#L251>)
* [Pipeline and continuation processing](<https://github.com/corycunanan/optcg-sim/blob/1dd5f5b9f42d262bb764ce0c3a3aab91b7939a06/workers/game/src/engine/pipeline.ts#L279>)
* [Action-chain resolver](<https://github.com/corycunanan/optcg-sim/blob/1dd5f5b9f42d262bb764ce0c3a3aab91b7939a06/workers/game/src/engine/effect-resolver/resolver.ts#L852>)
* [Session prompt lifecycle](<https://github.com/corycunanan/optcg-sim/blob/1dd5f5b9f42d262bb764ce0c3a3aab91b7939a06/workers/game/src/session/prompt-lifecycle.ts#L150>)
* [Cost availability](<https://github.com/corycunanan/optcg-sim/blob/1dd5f5b9f42d262bb764ce0c3a3aab91b7939a06/workers/game/src/engine/validation.ts#L354>) and [sequential feasibility](<https://github.com/corycunanan/optcg-sim/blob/1dd5f5b9f42d262bb764ce0c3a3aab91b7939a06/workers/game/src/engine/effect-resolver/cost/feasibility.ts>)
* [Replacement feasibility](<https://github.com/corycunanan/optcg-sim/blob/1dd5f5b9f42d262bb764ce0c3a3aab91b7939a06/workers/game/src/engine/replacements.ts#L537>)
* [Zone-transition service](<https://github.com/corycunanan/optcg-sim/blob/1dd5f5b9f42d262bb764ce0c3a3aab91b7939a06/workers/game/src/engine/zone-transition.ts>)
* [Latest merged change inspected: OPT-876](<https://github.com/corycunanan/optcg-sim/commit/4fe26c6ae96a6798296da49217980b842fda91fb>)
* [Strict persisted-state shapes](<https://github.com/corycunanan/optcg-sim/blob/4fe26c6ae96a6798296da49217980b842fda91fb/workers/game/src/session/persisted-game-state.ts#L93>) and [live/undo session parsing](<https://github.com/corycunanan/optcg-sim/blob/4fe26c6ae96a6798296da49217980b842fda91fb/workers/game/src/session/persistence.ts#L714>)
* [End Phase and parked progress](<https://github.com/corycunanan/optcg-sim/blob/4fe26c6ae96a6798296da49217980b842fda91fb/workers/game/src/engine/phases.ts#L176>)
* [Life Trigger surfacing](<https://github.com/corycunanan/optcg-sim/blob/4fe26c6ae96a6798296da49217980b842fda91fb/workers/game/src/session/coordinator.ts#L312>)
* [Existing action-scoped counts: OPT-885](<https://github.com/corycunanan/optcg-sim/commit/3de2fb5d>)

Related repository documents: [Engine Architecture](<https://github.com/corycunanan/optcg-sim/blob/4fe26c6ae96a6798296da49217980b842fda91fb/docs/game-engine/08-ENGINE-ARCHITECTURE.md>), [Zone Transition Contract](<https://github.com/corycunanan/optcg-sim/blob/4fe26c6ae96a6798296da49217980b842fda91fb/docs/game-engine/ZONE-TRANSITION-CONTRACT.md>), [Rules to Engine Map](<https://github.com/corycunanan/optcg-sim/blob/4fe26c6ae96a6798296da49217980b842fda91fb/docs/game-engine/RULES-TO-ENGINE-MAP.md>), [Schema Overview](<https://github.com/corycunanan/optcg-sim/blob/4fe26c6ae96a6798296da49217980b842fda91fb/docs/game-engine/01-SCHEMA-OVERVIEW.md>), and [Encoding Guide](<https://github.com/corycunanan/optcg-sim/blob/4fe26c6ae96a6798296da49217980b842fda91fb/docs/game-engine/11-ENCODING-GUIDE.md>). Treat their contents as evidence to reconcile with source and official rules, rather than assuming every description remains current.