# OPT-849 — activated attached-DON requirements

## Scope and source interpretation

Supported rules: `docs/rules/rule_comprehensive.md`, v1.2.0 (2026-01-16), §8-3-2-3 and §10-2-9. The given DON!! count on the source must be at least the printed threshold at activation. Active/rested DON!! in the cost area, or attached to another instance, cannot satisfy it. DON!! state does not alter the attached count. No rules-version or schema migration is included.

Canonical printed clauses were read in the linked `docs/cards/` files for every consumer below. All 13 match their authored trigger thresholds. This is an activation precondition before costs, optional prompts, and once-per-turn bookkeeping; the accepted effect continues through its existing persisted resolver frame without rerunning activation validation during resolution.

| Clause | Evaluation / payer | Observable result | Evidence |
| --- | --- | --- | --- |
| OP08-008 `[DON!! x1]`, Life-to-hand cost, Rush | Requested Character at activation; controller pays top Life after acceptance | Zero attached rejects without payment/prompt/OPT; one or two permits Life payment and Rush on the same instance | Pipeline and direct execution regressions; JSON round-trip optional prompt continuation |
| ST13-002 `[DON!! x2]` | Actual Leader at activation | One rejects; two/three completes authored search (pick zero, preserve all five at deck bottom) | Pipeline threshold matrix with persisted search continuation |
| OP12-020 `[DON!! x3]` | Actual Leader at activation | Two rejects; three/four resolves and records source OPT | Pipeline threshold matrix |
| UI condition availability | Same source and common predicate before cost availability | Menu disabled with condition reason below; legal menu dispatch preserves effect/source identity | Server availability → rendered CardActionMenuContent regression |

## Recursive consumer inventory

Inventory walks every object and array in all registered authored schemas, including nested blocks; it found 13 blocks, all direct `ACTIVATE_MAIN` triggers, no nested activated DON consumers or compound activated DON trigger leaves. Twelve lacked an equivalent block condition; OP10-022 already had the scoped OPT-809 guard. Generated/source parity remains enforced by `pnpm schema:check`; schemas are unchanged.

| Card / printed source | Recursive path / effect | DON!! | Disposition |
| --- | --- | --- | --- |
| [OP01-063](../../cards/OP-01.md) | `effects.0` / `OP01-063_activate_reveal_conditional` | 1 | No equivalent block condition; now enforced by common activation gate. |
| [OP02-093](../../cards/OP-02.md) | `effects.0` / `activate_cost_reduce_buff` | 1 | No equivalent block condition; now enforced by common activation gate. |
| [OP05-008](../../cards/OP-05.md) | `effects.0` / `activate_give_don` | 1 | No equivalent block condition; now enforced by common activation gate. |
| [OP08-002](../../cards/OP-08.md) | `effects.0` / `activate_draw_place_debuff` | 1 | No equivalent block condition; now enforced by common activation gate. |
| [OP08-008](../../cards/OP-08.md) | `effects.1` / `activate_rush` | 1 | No equivalent block condition; now enforced by common activation gate. |
| [OP08-010](../../cards/OP-08.md) | `effects.0` / `activate_power_boost` | 1 | No equivalent block condition; now enforced by common activation gate. |
| [OP10-022](../../cards/OP-10.md) | `effects.0` / `activate_reveal_life_play` | 1 | Equivalent source-specific `DON_GIVEN >= 1` in `all_of`; retain OPT-809 total-cost gate. |
| [OP12-020](../../cards/OP-12.md) | `effects.0` / `OP12-020_activate` | 3 | No equivalent block condition; now enforced by common activation gate. |
| [ST03-007](../../cards/ST-03.md) | `effects.0` / `activate_search_play` | 1 | No equivalent block condition; now enforced by common activation gate. |
| [ST13-001](../../cards/ST-13.md) | `effects.0` / `activate_add_to_life_buff` | 1 | No equivalent block condition; now enforced by common activation gate. |
| [ST13-002](../../cards/ST-13.md) | `effects.0` / `activate_search_to_life` | 2 | No equivalent block condition; now enforced by common activation gate. |
| [ST13-003](../../cards/ST-13.md) | `effects.1` / `activate_add_to_life` | 2 | No equivalent block condition; now enforced by common activation gate. |
| [ST21-001](../../cards/ST-21.md) | `effects.0` / `activate_give_don` | 1 | No equivalent block condition; now enforced by common activation gate. |

Reproduce the inventory from repository root (Node avoids the tsx CLI's IPC requirement):

```sh
node --import tsx -e 'const {getAllAuthoredSchemas}=require("./workers/game/src/engine/schema-registry.ts"); function walk(v,p){if(!v||typeof v!=="object")return;if(v.category==="activate")console.log(p,JSON.stringify(v.trigger),JSON.stringify(v.conditions));for(const [k,x]of Object.entries(v))walk(x,p+"."+k)};for(const [id,s]of Object.entries(getAllAuthoredSchemas()))walk(s,id)'
```

OPT-603 landed in `c8745bdef22ba7a1492d6555f0b093d378bd845c` / PR #470. Its EB01-014, EB01-058, OP05-001 source-specific condition encodings, replacement registration/condition evaluation, and lint correction did not add an activated trigger gate to validation, execution, or availability. Preserve those tests and automatic trigger matching; this patch does not change either path.

## Handoff

Read `workers/game/src/engine/attached-don.ts`, then its three callers in validation, execution and availability. UI menu eligibility is driven by server availability, not the legacy `canActivateNow` prop. Keep the predicate before payable-cost checks and before resolver entry. No wire/schema/DB changes. OPT-846 owns Life flip costs independently; no changes to those handlers here.

Baseline at a31499ba6f8d0787443501ff9c022e962e0bf01f: worker suite 240 files, 2750 passed / 5 skipped. OP08-008 regression was red before production edits: below-threshold pipeline and direct execution failed; legal exact/above passed. Focused 3-file checks: 30 passed. Full worker suite after gate: 241 files, 2757 passed / 5 skipped. Mutation check temporarily returning true from the common predicate made all five negative/gate tests fail (two legal cases passed); helper restored afterward. Final gate and PR/commit evidence are recorded in the PR body.

Implementation is awaiting independent review and coordinator readiness assessment. No dependent ticket is introduced. Follow-ups: none discovered within this mechanism; existing legacy UI props and compound activation support remain outside this change.
