# Value-layer contract: power and cost

Status: binding (OPT-953, OPT-1035). Evaluator: `workers/game/src/engine/modifiers.ts`.

This is the order the engine uses to compute a card's power and cost, and the FAQ rulings that fix each step. Every power and cost read goes through the evaluator below. `opt-953-value-layer-guard.test.ts` fails on a new direct `…Data.power` or `…Data.cost` read, and `opt-953-value-layer-rulings.test.ts` holds one fixture per ruling.

## The evaluator

| Read | Function | Layers |
|---|---|---|
| Base power ("base power", `base_power_*` filters, base copy and swap) | `getEffectiveBasePower` | P0 to P1 |
| Power (filters, conditions, aggregates, battle, K.O. gates, replacement `power_min`, set-to-0, copy, client projection) | `getEffectivePower` | P0 to P4 |
| Cost of a card on the field | `getEffectiveFieldCost` | C0 to C2 |
| Cost in a filter or condition, any zone | `getEffectiveCostForRead` | C0 to C2, plus while-in-hand changes |
| Cost to pay when playing | `getEffectiveCost` | C0 to C3 |

Off the field, power and cost are the printed values (OPT-455). Power layers P1 to P4 and cost layers C1 and C2 apply only to a Leader, Character, or Stage on the field.

## Power

| Layer | What | Rule |
|---|---|---|
| P0 | Printed power | §4-9-2 |
| P1 | Base-power settings (`SET_POWER`): "base power becomes N", base swap, base copy | §4-9-2-1: when several settings apply, the highest value wins, whatever the order or controller. Printed power does not compete. |
| P2 | Additive modifiers (`MODIFY_POWER`), turn player's first | Commutative. Negative totals are kept (§1-3-6-1). |
| P3 | DON!!: +1000 for each attached DON!!, on its owner's turn | §6-5-5-2 |
| P4 | [Symbol Counter] power on the current battle's target | §7-1-3-1-1: "during that battle". Kept on `BattleContext.counterPowerAdded`. |

`getEffectivePower` returns P0 to P4. There is no separate "battle power". The battle result, the Counter Step display, and every effect read during the battle see the same number (OPT-1035).

### Resolved settings and modifiers

A one-shot effect ("becomes 7000 base power during this turn", "+2000 during this battle", a swap or copy) resolves into an `auto` active effect:

- It **captures its value at resolution.** `SET_POWER.params.value` and `MODIFY_POWER.params.amount` are numbers when the record is written (`PersistedModifierSpec` in `effect-resolver/actions/modifiers.ts`). A copy or swap reads the source's power once, then never again.
- It **survives its source leaving the field.** Only `permanent` and `replacement` effects and `SOURCE_LEAVES_ZONE` expiries end with their source (`zone-transition.ts`). A resolved effect ends with its duration or when the affected card leaves the field.

A permanent ("aura") setting or modifier is evaluated live. It applies only while its source is on the field and its conditions hold. Its values can be dynamic and are read on every evaluation.

## Cost

| Layer | What | Rule |
|---|---|---|
| C0 | Printed cost | §1-3-9-1 |
| C1 | Cost settings (`SET_COST`), turn player's first, last wins | §2-7-6 |
| C2a | Permanent `MODIFY_COST`: turn player's, then the non-turn player's, repeated until nothing changes | §8-1-3-3-5 |
| C2b | Resolved (auto) `MODIFY_COST`, in the order they resolved | OP10-042 rulings |
| C2c | Re-check C2a against the result: a permanent whose filter fails drops off, then newly eligible permanents apply, until stable | OP10-042 Kaku ruling |
| C3 | Play-time only: pending "next time you play" changes, and while-in-hand self changes | OPT-444, OPT-450 |

The total may be negative while it is computed, and a later change starts from that negative number. Only the final value is raised to 0 (§1-3-6-2, §1-3-6-2-1).

A permanent is never removed by its own change: "cost 4 or less gets +1" stays on a base-4 card at 5. It drops off at C2c only when the value without its own change also fails its filter.

## Rulings, by layer

| Ruling | FAQ | Layer | What it fixes |
|---|---|---|---|
| OP13-084 Ju Peter | `docs/FAQs/qa_op13.md:186` | P1 | A setting replaces printed power: Five Elders (12000) becomes 7000. |
| OP13-084 with OP14-003 | `docs/FAQs/qa_op14_eb04.md:30` | P1 | Filters read the set base: Mars at 7000 base K.O.s Bege, which is immune to 5000 base or less. |
| OP14-001 Law | `docs/FAQs/qa_op14_eb04.md:12` | P1, captured | A swap keeps its value after the other Character leaves the field. |
| OP14-001 Law with PRB02-002 | `docs/FAQs/qa_op14_eb04.md:16` | P1 below P2 | Swapped base 0, then −2000 from a modifier: power −2000. |
| OP14-017 Chambres | `docs/FAQs/qa_op14_eb04.md:44` | P1, captured | Same as Law, for an opponent's pair. |
| OP15-070 Fuza | `docs/FAQs/faq_op15-eb04.md:328` | P1 | A Leader with every name is a [Shura] card: base power becomes 6000. |
| OP15-071 Holly | `docs/FAQs/faq_op15-eb04.md:335` | P1 | The same for [Ohm]. |
| ST26-005 Luffy | `docs/FAQs/qa_st-23-28.md:77` | P1, §4-9-2-1 | Two 7000 settings: base power 7000, not stacked. |
| OP06-009 Shuraiya | `docs/FAQs/qa_op06.md:26` | P1 below P4 | Base power set to 8000 on block, then a Counter still adds power. |
| OP06-009 Shuraiya | `docs/FAQs/qa_op06.md:30` | P1, captured | The copied value is the opponent's Leader at activation; a later Counter on that Leader does not change it. |
| OP06-009 with EB03-004 | `docs/FAQs/qa_eb03.md:15` | P1 read by a condition | "6000 base power or more" sees the set base. |
| OP02-121 Kuzan | `docs/FAQs/qa_op02.md:458` | C2, negatives kept | 6 −5 −2 is −1, shown as 0; after Kuzan leaves, 4. |
| OP03-091 Helmeppo with Kuzan | `docs/FAQs/qa_op03.md:218` | C1 below C2 | Set to 0 with Kuzan's −5 active; after Kuzan leaves, still 0. |
| OP10-042 Usopp with Tsuru | `docs/FAQs/qa_op10.md:285` | C2a then C2b | 3 +1 (permanent) −2 (auto) is 2, and Usopp stays. |
| OP10-042 Usopp with Kaku | `docs/FAQs/qa_op10.md:289` | C2c | 3 +1 −3 is 1, Usopp's "cost 2 or more" fails and drops: 0. |
| OP10-042 Usopp with Issho | `docs/FAQs/qa_op10.md:293` | C2a order | The turn player's permanent −3 first: 0, so Usopp never applies. |
| OP18-046 clause B | `CONSOLIDATION-PROPOSAL-AUDIT-2026-10.md` §6.2 | P1 | "Becomes 7000 base power during this turn" is a resolved P1 setting, as above. No card data yet. |

## Counter power and "power becomes 0"

Counter power is P4, above any setting. The OP06-009 ruling above is the evidence: a set base is still raised by a Counter.

`SET_POWER_TO_ZERO` (§4-12-1) reduces power "by the same amount as the target's current power at the time the effect was activated". Current power is `getEffectivePower`, so on the battle target it includes Counter power. The reduction is a resolved P2 modifier with a captured amount. It does not compete with P1 settings.

## Adding a value effect

1. A one-shot change resolves through the action handlers in `effect-resolver/actions/modifiers.ts`, which write a captured number.
2. A permanent change uses only the modifier types in `PERMANENT_MODIFIER_PARAM` (`modifiers.ts`), with the param named there. `schema-permanent-modifier-lint.ts` rejects anything else. OP15-070 and OP15-071 had an inert `SET_BASE_POWER` aura until this rule.
3. Read power and cost only through the functions in the table at the top.
