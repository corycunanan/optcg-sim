# Leg 6 — OP18-046 encodability and schema extensibility

## Verdict
Clauses B, C, and E map to existing primitives with precedents, and clause A maps only on a per-target reading. Clause D is the blocker: the engine dispatches `[Main]` (MAIN_EVENT) only for Event cards (execute.ts:119-136), and no Character schema in the 2,472-entry registry uses MAIN_EVENT. Clause A's "up to 2 rested DON!! total" cannot be expressed, because DON give actions cap per target, not per action. Adding a primitive needs a union edit plus a handler; there is no registry, and the description and feasibility parts of the contract are not enforced.

## Clause table
| Clause | Trigger type | Cost encoding | Actions | Targeting | Duration | Exists today? | Gap detail with file:line |
|---|---|---|---|---|---|---|---|
| A: On Play, draw 2, give up to 2 rested DON!! to Leader and all Characters | `ON_PLAY` (effect-types.ts:152) | none | `DRAW {amount:2}`; `GIVE_DON {amount:2, don_state:"RESTED"}` | `LEADER_OR_CHARACTER`, controller SELF, `count:{all:true}` | none | PARTIAL | Per-target reading is YES: `executeGiveDon` loops `amount` per target (don.ts:31-75). "Up to 2 total, spread across targets" is NO: `DISTRIBUTE_DON` caps per target only (don.ts:543-580), no total cap in `ActionParamsMap` (effect-types.ts:769+). |
| B: On Opponent's Attack, may trash 1: Baroque Works Leader becomes 7000 base power this turn | `ON_OPPONENT_ATTACK`; allowed on Characters (triggers.ts:551-554) | `TRASH_FROM_HAND {amount:1}` (effect-types.ts:1254), `flags.optional` | `SET_BASE_POWER {value:7000}` on `YOUR_LEADER` | `YOUR_LEADER` + `traits_contains:["Baroque Works"]` (effect-types.ts:1101) | `THIS_TURN` (effect-types.ts:1311) | YES | Precedents OP17-005 (op17.ts:116-160), OP17-008 (op17.ts:208-226), OP17-034 (op17.ts:1161-1177), EB01-002 (eb01.ts:73). |
| C: Activate Main, may K.O. your Stage cost ≤5: gains Rush this turn | `ACTIVATE_MAIN` | `TRASH_OWN_STAGE` with filter `{card_type:"STAGE", cost_max:5}` (payability.ts:201-205; payment.ts:415-427) | `GRANT_KEYWORD {keyword:"RUSH"}` on SELF | SELF | `THIS_TURN` | PARTIAL | No K.O.-typed Stage cost; `KO_OWN_CHARACTER` lists Characters only (cost/targets.ts:84-93). Engine trashes the Stage (reason "cost"), so "K.O." becomes trash. No precedent for TRASH_OWN_STAGE with `cost_max`. |
| D: Main, may trash 1: negate up to 1 opp cost ≤6 Character, then return it to hand | `MAIN_EVENT` (effect-types.ts:160), dispatched only for Events (execute.ts:119-136) | `TRASH_FROM_HAND {amount:1}`, optional | `NEGATE_EFFECTS` (`result_ref`, chain THEN) then `RETURN_TO_HAND` with `target_ref` | CHARACTER, OPPONENT, `count:{up_to:1}`, `cost_max:6` | none | NO (for [Main] on a Character) | Zero Character schemas use MAIN_EVENT. Negate-then-ref chain exists: OP09-093 (op09.ts:3073-3119). `target_ref` resolves generically (resolver.ts:857-860; simultaneous.ts:114-115). RETURN_TO_HAND with `target_ref`: 0 precedents; handler removal.ts:126. |
| E: Trigger, draw 2 then trash 1 | `TRIGGER`; type-agnostic from Life (battle.ts:449-456; effect-damage.ts:82-95; keywords.ts:55-57) | none | `DRAW {amount:2}` THEN `TRASH_FROM_HAND {amount:1}` | SELF | none | YES | 201 Character TRIGGER schemas; draw-then-trash chain 66 precedents, e.g. EB01-060 (eb01.ts:2122-2152). |

## Precedent cards (file:line)
1. OP17-005 Edward.Newgate, op17.ts:116-160 — SET_BASE_POWER on YOUR_LEADER with duration.
2. OP16-021 Moby Dick, op16.ts:506-526 — TRASH_OWN_STAGE cost + GIVE_DON on ACTIVATE_MAIN (no cost filter).
3. OP09-093, op09.ts:3073-3119 — NEGATE_EFFECTS result_ref + THEN + APPLY_PROHIBITION target_ref.
4. EB01-002 Izo, eb01.ts:73-100 — ON_OPPONENT_ATTACK on Character with TRASH_FROM_HAND cost.
5. EB01-060, eb01.ts:2122-2152 — Character TRIGGER with draw-then-trash chain.

## Schema size and extension mechanics
Counts from workers/game/src/engine/effect-types.ts:
- ActionType: 76 members (line 618); ALL_ACTION_TYPES mirrors (line 712).
- KeywordTriggerType: 14 (line 152). CustomEventType: 27 (line 168).
- SimpleCondition: 34 (line 231) + 3 compound forms.
- CostType: 33 incl. CHOICE (line 1254); ALL_COST_TYPES (line 1293); ChoiceCost (line 1224).
- TargetType: 25 (line 1019); ALL_TARGET_TYPES (line 1054).
- TargetFilter: 44 fields (line 1101).
- Duration: 9 variants (line 1311).

Adding a member: union edit + ALL_* array + ActionParamsMap; handler in ACTION_HANDLERS (resolver.ts); ActionHandlerMap exhaustive (effect-resolver/types.ts:135-137); or list in ACTION_TYPES_WITHOUT_RESOLVER_HANDLER (effect-types.ts:755-758); execution test + EXECUTED_ACTION_TYPES (action-coverage-contract.ts:10-18). No registry object.

Enforced: compile-time `_AllActionTypesCovers` (effect-types.ts:761-763); worker boot throw (resolver.ts:216-238); schema-registry rejects unknown/unhandled (schema-registry.ts:695-698); test gate opt-473-action-handler-coverage.test.ts:36-42; action-inventory-cli.ts.

NOT enforced: per-action feasibility (feasibility.ts:30-60 checks only FULL_TARGET_COUNT and OPPONENT_ACTION wrapper); descriptions (ACTION_LABELS is Record<string,string>, action-utils.ts:35, fallback :58).

Doc drift: 04-ACTIONS.md:1356-1380 DISTRIBUTE_DON params (`don_per_target`, `max_targets`) vs code (`amount`, `amount_per_target`, `don_state`); GIVE_DON `source_state`/`target_state` vs code `don_state`.

## Bundle capacity headroom
- SCHEMA-BUNDLE-CAPACITY.md last measured 2026-07-14: 326,457 B gzip, 31.1% of 1 MiB repo budget; platform limit 3 MB free / 10 MB paid.
- Registry grew 2,319 → 2,472 schemas; authored-schemas.generated.ts gzip -9 now 125,667 B (was 115,921).
- Projected Worker gzip ~336,200 B (~32.1%); headroom ~712,000 B.
- ~51 gzip bytes per card; a 111-card main set adds ~5.7 KB (~0.5%). Estimates only; dry-run not executed.
