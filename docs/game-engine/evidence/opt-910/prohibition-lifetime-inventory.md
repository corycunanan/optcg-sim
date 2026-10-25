# OPT-910 bounded prohibition lifetime inventory

Base: `10b6f28a184ba6441711c832c72e9acd104aa45a`. Scope is the shared
RuntimeProhibition source-negation gate; OPT-954 and unrelated prohibition
contracts remain deferred. No persistence field, payload rewrite, event-history
inference, duration inference or source-category inference is introduced.

## Producer and accepted-format evidence

| Producer | Existing provenance | Meaning at later source negation |
|---|---|---|
| `actions/effects.ts::executeApplyProhibition` | `sourceEffectBlockId: ""` | Already resolved action output; retain result and its live gates |
| `actions/effects.ts::executeNegateTriggerType` | Same exact empty string; affected controller separate from ownerController | Already resolved output; direct trigger reader already preserves it |
| `triggers.ts::registerPermanentEffectsForCard`, reached by `registerCardEnteredField` | Authored `block.id`, schema validator rejects missing/empty ID | Registered continuous result pauses under source negation |

Searches of RuntimeProhibition constructors and all append/registration sites
found no additional production constructor. Historical APPLY_PROHIBITION origin
`e56f1784` (`effect-resolver.ts:632–642`) and split `5d247f0c` already used empty
string; NEGATE_TRIGGER_TYPE introduction `7f337ed5` did likewise. Permanent
registration introduction `2202dfb8` used authored block.id. These source checks
were independently corroborated in the bounded high-risk design consultation.

PersistedGameStateV3 accepts prohibition rows as `unknown`; persistence's
`hasValidProhibition` checks only record and conditional override action shape.
It therefore also admits absent/null/numeric/arbitrary block metadata. Exact
empty string is positive evidence for inspected engine-produced resolved output,
not proof about every arbitrary accepted object. All other values retain the
previous source gate; they are not labeled proven continuous, normalized or
reconstructed from current schemas. Historical missing expiry continues through
the existing expiry fallback. No historical format is tightened.

A recursive current checked-in JSON/gzip fixture audit found451 prohibition row
occurrences (repeated live/undo/root copies included):208 exactempty and243
nonempty, no missing/nonstring rows. This is limited fixture evidence, not a
universal historical provenance guarantee. The separately immutable actual046
archive has63 occurrences over319 nested saved-state objects:61 DON and2
CANNOT_BE_KO, all exactempty; existing corpus suffixes are replayed unchanged.

## Consumers and bypasses

| Reader / consumer | Path and preserved gates |
|---|---|
| `checkProhibitions` | Pipeline actions, blocker validation/candidate UI, activation veto and cost-movement checks; uses, common gate, override, matcher/target/controller preserved |
| `isLifeToHandProhibited` | Effect/cost Life movement; common gate preserved |
| `isDonAttachProhibited` | Delegates common card prohibition check; DON placement/return semantics unchanged |
| `applyRefreshProhibitions` | Refresh skip matching/consumption and continuous aura behavior unchanged; common gate still applied at same point |
| `isProhibitedForCard` | Effect-level card restrictions; play, cost payability/payment/targets/named-play paths use it |
| `isRemovalProhibited` | Battle and effect removal/trash/Life paths, including native9/10 field-trash replacement flow; common source gate changes only |
| `isCardPlayProhibitedByEffect` runtime rows | Common gate; HAND permanent schema scan is separate and unchanged |
| `isDrawProhibitedByEffect` | DRAW and draw-like top-deck hand-deck path; uses/override/drawer/cause remain live |
| `isDonActivationProhibitedByEffect` | SET_DON_ACTIVE direct/nested/resumed/scheduled; its existing exactempty special case now delegates common gate, equivalent lifetime behavior |
| `visibility::stripInactiveProhibitions` | Common conditions and override; resolved visible result survives, registered continuous row filters out while negated |
| `triggers::isTriggerTypeNegated` | Existing direct scope.triggerType/controller reader; bypasses common conditions/uses/override/source checks. Already preserves resolved lifetime. Tested and left unchanged; adding broader gates requires a separate contract |
| Source cleanup, expiry, transaction roots, history, DON grouping/descriptions | Lifecycle/storage/identity consumers, not independent source-negation gates; unchanged |

The sole direct source-negation call for RuntimeProhibition is in the common
`isProhibitionConditionMet`. Other isCardNegated callers govern queued
activation/keywords/modifiers/win rules and do not receive this exception.
Target/duration/conditions/override/uses/owner/expiry handling stays in its prior
location; this does not repair unrelated matcher or trigger-reader debt.

## Rules and acceptance

Canonical rule8-2-3 protects auto/activate effects already activated and resolved
(`docs/rules/rule_comprehensive.md:774`). Kalgara's canonical OP12-099 text and
schema resolve draw then THIS_TURN CANNOT_DRAW. Its FAQ (`docs/FAQs/qa_op12.md`)
confirms the first resolved copy prevents a second effect draw for the rest of
the turn. Roger's permanent suppression (`docs/cards/OP-13.md:424`) suppresses
future source behavior; its FAQ concerns its power result, not revoking prior
restrictions. No speculative duration or negation redesign follows.

| Acceptance | Durable regression / observation |
|---|---|
| Actual Kalgara → attack/PASS/PASS → actual Roger PLAY and on-play cost → own draw Event | Event draw blocked; no-Roger baseline also blocked; actual End Phase expires restriction |
| Resolved action Blocker restriction | Real APPLY_PROHIBITION activation then real negation action; common DECLARE_BLOCKER check still vetoes |
| Trigger-type resolved output | Real NEGATE_TRIGGER_TYPE producer retains original owner/affected controllers, prospective ON_PLAY scope and End Phase expiry through source negation |
| Continuous pause/resume | Real permanent registration with authored id, PERMANENT and THIS_TURN duration controls; real negation flag pauses, expiry restores |
| Live gates | Conditions and WHILE_CONDITION toggles, override, remaining uses, drawer/cause controls still govern resolved output |
| Persistence and unknown provenance | Explicit8/9/10 live/undo round trips; mixed8/9/10 cost6/7/8 retains modes; missing/null/numeric/nonempty metadata stays source-gated |
| Visibility | Resolved Kalgara remains visible under Roger; registered continuous row filters while source negated |
| Registry / schema | Nonempty permanent block IDs and recursive nested Character producer enumeration; invalid empty authored id rejected |
| Existing DON / modifier / compatibility | Existing OPT988/253 plus immutable actual04641-family/217-boundary corpus and preceding historical readers replay unchanged |

All new behavioral cases are in
`workers/game/src/__tests__/opt-910-resolved-prohibitions.test.ts`. Meaningful
initial matrix on frozen base:8 failures/4 controls, then12 green after the
common gate change. Additional continuous-duration and mixed-undo controls
bring the final matrix to14. Final focused64 files:1228 passed,1 existing
environment-dependent skip (1229 collected); worker types and scoped lint
passed with zero errors. Explicit selected-file list, JSON and logs are
`../opt1004-opt910-focused-files.txt`, `../opt1004-opt910-focused.json` and
`../opt1004-opt910-focused.log` in the run-owned work directory.
No old fixture bytes change. Current writer046
sources remain immutable evidence; future enabled writer must inherit this
common gate correction and retain its exact reviewed activation policy.

## Authored registry inventory

Enumeration uses `getAllAuthoredSchemas` and recursively `getNestedActions`,
including PLAYER_CHOICE/OPPONENT_CHOICE/OPPONENT_ACTION/SCHEDULE_ACTION children.
There are114 action occurrences across111 cards:113 APPLY_PROHIBITION and1
NEGATE_TRIGGER_TYPE. Character cards contribute85 occurrences across83 distinct
cards; all are APPLY_PROHIBITION.69 permanent prohibition blocks have authored
nonempty IDs. Counts are occurrences, not execution reachability claims.

The two nested Character occurrences are OP14-069 `actions[0].nested[1]` and
OP15-025 `actions[1].nested[0]`; nested paths below preserve wrapper traversal.

| Character card | Authored block/category | Action path | Resolved prohibition |
|---|---|---|---|
| EB02-011 | `on_play_give_don_prohibit` / auto | `actions[1]` | CANNOT_BE_RESTED |
| EB02-015 | `on_play_prohibit_refresh_schedule_don` / auto | `actions[0]` | CANNOT_REFRESH |
| EB03-017 | `on_play_don_active_prohibit` / auto | `actions[1]` | CANNOT_BE_RESTED |
| EB03-024 | `on_play_play_then_prohibit` / auto | `actions[1]` | CANNOT_PLAY_CHARACTER |
| EB03-059 | `trigger_cannot_attack` / auto | `actions[0]` | CANNOT_ATTACK |
| EB04-016 | `activate_set_don_active` / activate | `actions[1]` | CANNOT_SET_DON_ACTIVE |
| OP01-051 | `taunt_prohibition` / auto | `actions[0]` | CANNOT_ATTACK |
| OP01-085 | `on_play_prohibit_attack` / auto | `actions[0]` | CANNOT_ATTACK |
| OP01-120 | `when_attacking_no_blocker` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP02-004 | `on_play_buff_and_prohibition` / auto | `actions[1]` | CANNOT_ADD_LIFE_TO_HAND |
| OP02-061 | `when_attacking_no_blocker` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP02-101 | `when_attacking_block_prohibition` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP02-110 | `on_block_lock` / auto | `actions[0]` | CANNOT_ATTACK |
| OP03-002 | `when_attacking_blocker_lock` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP04-031 | `on_play_skip_refresh` / auto | `actions[0]` | CANNOT_REFRESH |
| OP04-065 | `on_play_cannot_attack` / auto | `actions[0]` | CANNOT_ATTACK |
| OP04-083 | `on_play_ko_protection_and_draw` / auto | `actions[0]` | CANNOT_BE_KO |
| OP04-090 | `activate_untap_from_trash` / activate | `actions[1]` | CANNOT_REFRESH |
| OP04-100 | `trigger_cannot_attack` / auto | `actions[0]` | CANNOT_ATTACK |
| OP05-016 | `when_attacking_blocker_prohibition` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP05-042 | `on_play_cannot_attack` / auto | `actions[0]` | CANNOT_ATTACK |
| OP06-023 | `OP06-023_effect_1` / auto | `actions[0]` | CANNOT_ATTACK |
| OP06-026 | `OP06-026_effect_1` / auto | `actions[1]` | CANNOT_ATTACK |
| OP06-030 | `OP06-030_effect_1` / auto | `actions[0]` | CANNOT_BE_KO |
| OP06-055 | `OP06-055_effect_1` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP07-026 | `OP07-026_effect_1` / auto | `actions[0]` | CANNOT_REFRESH |
| OP07-051 | `OP07-051_effect_1` / auto | `actions[0]` | CANNOT_ATTACK |
| OP07-063 | `OP07-063_effect_1` / auto | `actions[0]` | CANNOT_ATTACK |
| OP08-022 | `on_play_skip_refresh` / auto | `actions[0]` | CANNOT_REFRESH |
| OP08-023 | `skip_refresh` / auto | `actions[0]` | CANNOT_REFRESH |
| OP08-024 | `when_attacking_skip_refresh` / auto | `actions[0]` | CANNOT_REFRESH |
| OP08-025 | `on_play_skip_refresh` / auto | `actions[0]` | CANNOT_REFRESH |
| OP08-026 | `when_attacking_skip_refresh` / auto | `actions[0]` | CANNOT_REFRESH |
| OP08-043 | `on_play_lockdown` / auto | `actions[0]` | CANNOT_ATTACK |
| OP08-111 | `when_attacking_no_blocker` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP08-112 | `on_play_cannot_attack` / auto | `actions[0]` | CANNOT_ATTACK |
| OP09-014 | `on_play_block_prohibition` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP09-033 | `on_play_ko_protection` / auto | `actions[0]` | CANNOT_BE_KO |
| OP09-093 | `activate_negate_and_lock` / activate | `actions[2]` | CANNOT_ATTACK |
| OP10-030 | `activate_set_don_active_then_prohibit` / activate | `actions[1]` | CANNOT_SET_DON_ACTIVE |
| OP10-033 | `on_play_don_refresh_lock` / auto | `actions[0]` | CANNOT_REFRESH |
| OP10-070 | `on_play_ko_protection` / auto | `actions[0]` | CANNOT_BE_KO |
| OP11-013 | `when_attacking_block_prohibition` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP11-028 | `on_play_skip_refresh` / auto | `actions[0]` | CANNOT_REFRESH |
| OP11-034 | `activate_prohibition` / activate | `actions[0]` | CANNOT_BE_RESTED |
| OP12-022 | `OP12-022_activate` / activate | `actions[0]` | CANNOT_REFRESH |
| OP12-030 | `OP12-030_on_play` / auto | `actions[1]` | CANNOT_PLAY_CHARACTER |
| OP12-043 | `OP12-043_on_play` / auto | `actions[0]` | CANNOT_ATTACK |
| OP12-051 | `OP12-051_activate` / activate | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP12-099 | `OP12-099_effect_1` / auto | `actions[1]` | CANNOT_DRAW |
| OP13-023 | `OP13-023_on_play` / auto | `actions[1]` | CANNOT_PLAY_CHARACTER |
| OP13-028 | `OP13-028_on_play` / auto | `actions[1]` | CANNOT_PLAY_FROM_HAND |
| OP13-032 | `OP13-032_on_play` / auto | `actions[0]` | CANNOT_BE_RESTED |
| OP13-118 | `OP13-118_on_play` / auto | `actions[1]` | CANNOT_PLAY_CHARACTER |
| OP14-021 | `OP14-021_on_rest` / auto | `actions[1]` | CANNOT_REFRESH |
| OP14-024 | `OP14-024_on_play` / auto | `actions[1]` | CANNOT_PLAY_CHARACTER |
| OP14-033 | `OP14-033_on_play` / auto | `actions[0]` | CANNOT_BE_RESTED |
| OP14-035 | `OP14-035_on_rest` / auto | `actions[0]` | CANNOT_REFRESH |
| OP14-069 | `OP14-069_on_play` / auto | `actions[0].nested[1]` | CANNOT_BE_RESTED |
| OP14-111 | `OP14-111_on_play` / auto | `actions[0]` | CANNOT_ATTACK |
| OP14-111 | `OP14-111_on_ko` / auto | `actions[0]` | CANNOT_ATTACK |
| OP14-119 | `OP14-119_on_rest` / auto | `actions[0]` | CANNOT_BE_RESTED |
| OP14-120 | `OP14-120_on_play` / auto | `actions[0]` | CANNOT_ATTACK |
| OP15-023 | `OP15-023_on_ko` / auto | `actions[0]` | CANNOT_REFRESH |
| OP15-025 | `OP15-025_on_play` / auto | `actions[1].nested[0]` | CANNOT_REFRESH |
| OP15-029 | `OP15-029_on_play` / auto | `actions[0]` | CANNOT_BE_RESTED |
| OP16-030 | `on_play_skip_refresh` / auto | `actions[0]` | CANNOT_REFRESH |
| OP16-032 | `on_play_cannot_be_rested` / auto | `actions[0]` | CANNOT_BE_RESTED |
| OP16-056 | `activate_trash_draw_lock` / activate | `actions[1]` | CANNOT_ATTACK |
| OP16-063 | `activate_blocker_lock` / activate | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP17-054 | `on_play_cannot_attack` / auto | `actions[0]` | CANNOT_ATTACK |
| OP17-054 | `activate_cannot_attack` / activate | `actions[0]` | CANNOT_ATTACK |
| OP17-065 | `on_play_draw_cannot_attack` / auto | `actions[1]` | CANNOT_ATTACK |
| OP17-085 | `on_play_play_brogy` / auto | `actions[1]` | CANNOT_PLAY_CHARACTER |
| OP17-092 | `on_play_play_dorry` / auto | `actions[1]` | CANNOT_PLAY_CHARACTER |
| P-097 | `on_play_or_attack_no_blocker` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| PRB02-017 | `on_play_cannot_attack` / auto | `actions[0]` | CANNOT_ATTACK |
| ST01-002 | `when_attacking_blocker_prohibition` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| ST01-012 | `when_attacking_no_blocker` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| ST15-001 | `when_attacking_life_prohibition` / auto | `actions[0]` | CANNOT_ADD_LIFE_TO_HAND |
| ST19-001 | `on_play_attack_prohibition` / auto | `actions[0]` | CANNOT_ATTACK |
| ST21-003 | `on_play_blocker_prohibition` / auto | `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| ST24-004 | `on_play_rest_and_buff` / auto | `actions[1]` | CANNOT_REFRESH |
| ST30-010 | `on_play_skip_refresh` / auto | `actions[0]` | CANNOT_REFRESH |
| ST32-002 | `on_play_draw_prevent_rest` / auto | `actions[1]` | CANNOT_BE_RESTED |

Other authored prohibition action producers (including the Leader trigger-type producer):

| Card/type | Block/category | Action/path | Restriction |
|---|---|---|---|
| EB02-021 / Event | `main_buff_and_prohibit` / activate | APPLY_PROHIBITION `actions[1]` | CANNOT_REFRESH |
| EB04-028 / Event | `main_prohibit_attack` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_ATTACK |
| OP02-023 / Event | `main_prohibition` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_ADD_LIFE_TO_HAND |
| OP02-118 / Event | `counter_protection` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_BE_KO |
| OP05-094 / Event | `main_cost_reduction_and_freeze` / auto | APPLY_PROHIBITION `actions[1]` | CANNOT_REFRESH |
| OP06-020 / Leader | `OP06-020_effect_1` / activate | APPLY_PROHIBITION `actions[1]` | CANNOT_ADD_LIFE_TO_HAND |
| OP06-096 / Event | `OP06-096_effect_1` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_BE_KO |
| OP07-059 / Leader | `OP07-059_effect_1` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_REFRESH |
| OP07-059 / Leader | `OP07-059_effect_1` / auto | APPLY_PROHIBITION `actions[1]` | CANNOT_REFRESH |
| OP08-036 / Event | `main_effect` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_REFRESH |
| OP08-038 / Event | `main_effect` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_BE_KO |
| OP09-081 / Leader | `activate_negate_opponent_on_play` / activate | NEGATE_TRIGGER_TYPE `actions[0]` | ON_PLAY |
| OP12-016 / Event | `OP12-016_main` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP12-020 / Leader | `OP12-020_activate` / activate | APPLY_PROHIBITION `actions[1]` | CANNOT_ATTACK |
| OP12-077 / Event | `OP12-077_main` / auto | APPLY_PROHIBITION `actions[1]` | CANNOT_ACTIVATE_BLOCKER |
| OP13-040 / Event | `OP13-040_main` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_REFRESH |
| OP13-057 / Event | `OP13-057_main` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| OP14-020 / Leader | `OP14-020_activate` / activate | APPLY_PROHIBITION `actions[1]` | CANNOT_PLAY_CHARACTER |
| OP14-118 / Event | `OP14-118_counter` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_ATTACK |
| OP15-038 / Event | `OP15-038_main` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_REFRESH |
| OP15-077 / Event | `OP15-077_main` / auto | APPLY_PROHIBITION `actions[1]` | CANNOT_REFRESH |
| OP15-097 / Event | `OP15-097_main` / auto | APPLY_PROHIBITION `actions[0]` | CANNOT_ATTACK |
| OP16-040 / Event | `main_skip_refresh` / activate | APPLY_PROHIBITION `actions[0]` | CANNOT_REFRESH |
| OP17-020 / Leader | `activate_skip_refresh` / activate | APPLY_PROHIBITION `actions[0]` | CANNOT_REFRESH |
| P-057 / Event | `main_skip_refresh` / activate | APPLY_PROHIBITION `actions[0]` | CANNOT_REFRESH |
| ST01-016 / Event | `main_blocker_prohibition` / activate | APPLY_PROHIBITION `actions[0]` | CANNOT_ACTIVATE_BLOCKER |
| ST05-017 / Event | `counter_power_and_protection` / auto | APPLY_PROHIBITION `actions[1]` | CANNOT_BE_KO |
| ST06-016 / Event | `trigger_draw_and_protection` / auto | APPLY_PROHIBITION `actions[1]` | CANNOT_BE_KO |
| ST21-016 / Event | `main_effect` / auto | APPLY_PROHIBITION `actions[1]` | CANNOT_ACTIVATE_BLOCKER |

Registered permanent prohibition blocks (same registry traversal):

| Card | Block | Types |
|---|---|---|
| EB03-018 | `opponent_turn_protection` | CANNOT_BE_KO |
| EB04-005 | `cannot_attack_restriction` | CANNOT_ATTACK |
| EB04-051 | `cannot_attack_restriction` | CANNOT_ATTACK |
| EB04-057 | `permanent_cannot_be_removed` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP01-024 | `ko_protection` | CANNOT_BE_KO |
| OP01-099 | `proxy_ko_protection` | CANNOT_BE_KO |
| OP02-027 | `conditional_removal_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP02-100 | `conditional_ko_protection` | CANNOT_BE_KO |
| OP02-102 | `ko_protection` | CANNOT_BE_KO |
| OP02-114 | `opp_turn_buff_and_protection` | CANNOT_BE_KO |
| OP03-004 | `rush_no_leader_attack` | CANNOT_ATTACK |
| OP03-008 | `ko_protection_slash` | CANNOT_BE_KO |
| OP03-032 | `ko_protection_battle` | CANNOT_BE_KO |
| OP03-058 | `cannot_attack` | CANNOT_ATTACK |
| OP03-079 | `cannot_be_ko_in_battle` | CANNOT_BE_KO |
| OP03-088 | `cannot_be_ko_by_effects` | CANNOT_BE_KO |
| OP04-001 | `cannot_attack` | CANNOT_ATTACK |
| OP04-039 | `cannot_attack` | CANNOT_ATTACK |
| OP04-119 | `opponent_turn_ko_protection` | CANNOT_BE_KO |
| OP05-040 | `permanent_no_refresh` | CANNOT_REFRESH |
| OP06-012 | `OP06-012_effect_1` | CANNOT_BE_KO |
| OP06-052 | `OP06-052_effect_1` | CANNOT_BE_KO |
| OP06-083 | `OP06-083_cannot_attack` | CANNOT_ATTACK |
| OP06-109 | `OP06-109_effect_1` | CANNOT_BE_KO |
| OP07-033 | `OP07-033_effect_1` | CANNOT_BE_KO |
| OP07-069 | `OP07-069_effect_1` | CANNOT_BE_KO |
| OP07-097 | `OP07-097_cannot_attack` | CANNOT_ATTACK |
| OP07-098 | `OP07-098_effect_1` | CANNOT_BE_KO |
| OP08-029 | `ko_protection_aura` | CANNOT_BE_KO |
| OP08-114 | `don_conditional_protection` | CANNOT_BE_KO |
| OP09-025 | `ko_protection_vs_leaders` | CANNOT_BE_KO |
| OP09-045 | `ko_protection_in_battle` | CANNOT_BE_KO |
| OP09-086 | `ko_protection` | CANNOT_BE_KO |
| OP10-082 | `removal_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP10-104 | `conditional_ko_protection` | CANNOT_BE_KO |
| OP10-118 | `ko_protection_once` | CANNOT_BE_KO |
| OP11-005 | `ko_protection` | CANNOT_BE_KO |
| OP11-022 | `cannot_attack` | CANNOT_ATTACK |
| OP11-046 | `conditional_protection` | CANNOT_BE_KO, CANNOT_BE_RESTED |
| OP11-058 | `conditional_cannot_attack` | CANNOT_ATTACK |
| OP12-021 | `OP12-021_cannot_be_rested` | CANNOT_BE_RESTED |
| OP12-024 | `OP12-024_ko_protection` | CANNOT_BE_KO |
| OP12-036 | `OP12-036_cannot_be_played` | CANNOT_BE_PLAYED_BY_EFFECTS |
| OP12-036 | `OP12-036_battle_protection` | CANNOT_BE_KO |
| OP13-080 | `OP13-080_conditional_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP13-083 | `OP13-083_conditional_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP13-084 | `OP13-084_conditional_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP13-089 | `OP13-089_conditional_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP13-091 | `OP13-091_conditional_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP14-003 | `OP14-003_cannot_be_ko` | CANNOT_BE_KO |
| OP14-056 | `OP14-056_cannot_attack` | CANNOT_ATTACK |
| OP14-079 | `OP14-079_prohibition` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP15-024 | `OP15-024_opponent_turn_protection` | CANNOT_BE_RESTED |
| OP15-039 | `OP15-039_cannot_attack` | CANNOT_ATTACK |
| OP15-060 | `OP15-060_permanent_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP15-118 | `OP15-118_permanent_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| OP17-044 | `rested_attack_taunt` | CANNOT_ATTACK |
| P-007 | `don_ko_protection_strike` | CANNOT_BE_KO |
| P-025 | `don_cannot_be_ko_in_battle` | CANNOT_BE_KO |
| P-052 | `don_battle_ko_protection` | CANNOT_BE_KO |
| P-054 | `don_battle_ko_protection` | CANNOT_BE_KO |
| P-084 | `cannot_attack_self` | CANNOT_ATTACK |
| P-084 | `leader_buggy_cannot_attack_aura` | CANNOT_ATTACK |
| P-104 | `conditional_removal_protection` | CANNOT_BE_REMOVED_FROM_FIELD |
| ST05-008 | `conditional_ko_protection` | CANNOT_BE_KO |
| ST06-004 | `ko_protection` | CANNOT_BE_KO |
| ST08-002 | `ko_protection_vs_leaders` | CANNOT_BE_KO |
| ST09-004 | `don_conditional_ko_protection` | CANNOT_BE_KO |
| ST14-009 | `don_opponent_turn_protection` | CANNOT_BE_KO |
