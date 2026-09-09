# Effect Facet Taxonomy

**Purpose.** This document defines the Tier 1 facets extracted from authored `EffectSchema` values. The pure pipeline extractor works at card scope and never accesses the database.

**Convention.** Tags use lowercase snake case as `group:value` or `group:value:qualifier`. The group is the segment before the first colon. `EFFECT_FACET_GROUPS` in `shared/effect-facets.ts` is the ordered machine-readable vocabulary.

**Traversal.** The extractor reads `actions`, `replacement_actions`, and nested `PLAYER_CHOICE` and `OPPONENT_CHOICE` options. It reads `modifiers` where a rule below says so. It lowercases schema discriminants when building tags.

---

## Trigger

**Derivation.** `block.trigger.keyword` and `block.trigger.event` each produce a tag. A `CompoundTrigger.any_of` produces tags for every member.

**Keyword triggers.** `trigger:on_play`, `trigger:when_attacking`, `trigger:when_attacked`, `trigger:on_ko`, `trigger:on_block`, `trigger:on_opponent_attack`, `trigger:activate_main`, `trigger:main_event`, `trigger:counter`, `trigger:counter_event`, `trigger:trigger`, `trigger:end_of_your_turn`, `trigger:end_of_opponent_turn`, `trigger:start_of_turn`.

**Custom events.** `trigger:opponent_character_ko`, `trigger:any_character_ko`, `trigger:any_character_trashed`, `trigger:opponent_character_trashed`, `trigger:character_removed_from_field`, `trigger:don_returned_to_don_deck`, `trigger:don_given_to_card`, `trigger:event_activated_from_hand`, `trigger:event_main_resolved_from_trash`, `trigger:event_trigger_resolved`, `trigger:character_played`, `trigger:card_removed_from_life`, `trigger:life_card_removed`, `trigger:trigger_activated`, `trigger:combat_victory`, `trigger:character_battles`, `trigger:end_of_battle`, `trigger:battle_aborted`, `trigger:life_count_becomes_zero`, `trigger:card_added_to_hand_from_life`, `trigger:draw_outside_draw_phase`, `trigger:character_becomes_rested`, `trigger:character_returned_to_hand`, `trigger:damage_taken`, `trigger:blocker_activated`, `trigger:leader_attack_deals_damage`.

---

## Timing

**DON!! requirement.** `timing:don_requirement` comes from any trigger member whose `don_requirement` is at least 1.

**Turn restriction.** `timing:your_turn` comes from `YOUR_TURN`. `timing:opponent_turn` comes from `OPPONENT_TURN`.

---

## Category

**Derivation.** `block.category` produces `category:auto`, `category:activate`, `category:permanent`, `category:replacement`, or `category:rule_modification`.

---

## Keyword

**Intrinsic.** `flags.keywords` produces `keyword:rush`, `keyword:blocker`, `keyword:double_attack`, `keyword:banish`, `keyword:unblockable`, `keyword:rush_character`, or `keyword:can_attack_active`.

**Granted.** A `GRANT_KEYWORD` action or modifier produces `keyword:rush:granted`, `keyword:blocker:granted`, `keyword:double_attack:granted`, `keyword:banish:granted`, `keyword:unblockable:granted`, `keyword:rush_character:granted`, or `keyword:can_attack_active:granted`.

---

## Removal

**K.O.** `KO` produces `removal:ko` or `removal:ko:wipe`.

**Trash.** `TRASH_CARD` produces `removal:trash` or `removal:trash:wipe`.

**Bounce.** `RETURN_TO_HAND` produces `removal:bounce` or `removal:bounce:wipe`.

**Bottom deck.** `RETURN_TO_DECK` with `params.position` set to `BOTTOM` produces `removal:bottom_deck` or `removal:bottom_deck:wipe`.

**Top deck.** `RETURN_TO_DECK` with `params.position` set to `TOP` produces `removal:top_deck` or `removal:top_deck:wipe`.

**Placement fallback.** An absent or unrecognized deck position emits both placement tags. The extractor adds `:wipe` only when `target.count` is the `CountMode` shape `{ all: true }`.

---

## DON!!

**Qualification.** Each operation registers an unqualified tag plus `:self` and `:opponent` forms. `target.controller` supplies a qualifier when it is `SELF` or `OPPONENT`; `target.type` set to `SELF` also identifies self. `EITHER`, `ANY`, or an absent controller stays unqualified. Explicit opponent action names identify the opponent.

**Ramp.** `ADD_DON_FROM_DECK` alone produces `don:ramp`, `don:ramp:self`, or `don:ramp:opponent`.

**Untap.** `SET_DON_ACTIVE` produces `don:untap`, `don:untap:self`, or `don:untap:opponent`.

**Give.** `GIVE_DON`, `DISTRIBUTE_DON`, `REDISTRIBUTE_DON`, and `GIVE_OPPONENT_DON_TO_OPPONENT` produce `don:give`, `don:give:self`, or `don:give:opponent`.

**Return.** `RETURN_DON_TO_DECK`, `FORCE_OPPONENT_DON_RETURN`, and `RETURN_ATTACHED_DON_TO_COST` produce `don:return`, `don:return:self`, or `don:return:opponent`.

**Rest.** `REST_DON` and `REST_OPPONENT_DON` produce `don:rest`, `don:rest:self`, or `don:rest:opponent`.

---

## Life

**Qualification.** Life operations follow the target-controller rule above. `DEAL_DAMAGE` always identifies the opponent, while `SELF_TAKE_DAMAGE` always identifies self.

**Add.** `ADD_TO_LIFE`, `ADD_TO_LIFE_FROM_DECK`, `ADD_TO_LIFE_FROM_HAND`, and `ADD_TO_LIFE_FROM_FIELD` produce `life:add`, `life:add:self`, or `life:add:opponent`.

**Trash.** `TRASH_FROM_LIFE` and `TRASH_FACE_UP_LIFE` produce `life:trash`, `life:trash:self`, or `life:trash:opponent`.

**To hand.** `LIFE_TO_HAND` produces `life:to_hand`, `life:to_hand:self`, or `life:to_hand:opponent`.

**To deck.** `LIFE_CARD_TO_DECK` produces `life:to_deck`, `life:to_deck:self`, or `life:to_deck:opponent`.

**Face up.** `TURN_LIFE_FACE_UP` produces `life:face_up`, `life:face_up:self`, or `life:face_up:opponent`.

**Face down.** `TURN_LIFE_FACE_DOWN` and `TURN_ALL_LIFE_FACE_DOWN` produce `life:face_down`, `life:face_down:self`, or `life:face_down:opponent`.

**Scry.** `LIFE_SCRY` and `REORDER_ALL_LIFE` produce `life:scry`, `life:scry:self`, or `life:scry:opponent`.

**Damage.** `SELF_TAKE_DAMAGE` and `DEAL_DAMAGE` produce `life:damage`, `life:damage:self`, or `life:damage:opponent`.

**Drain.** `DRAIN_LIFE_TO_THRESHOLD` produces `life:drain`, `life:drain:self`, or `life:drain:opponent`.

---

## State

**Rest.** `SET_REST` produces `state:rest`, `state:rest:self`, or `state:rest:opponent` from its target controller.

**Active.** `SET_ACTIVE` produces `state:active`, `state:active:self`, or `state:active:opponent` from its target controller.

**Other state.** `APPLY_PROHIBITION` or a non-empty `block.prohibitions` list produces `state:prohibit`. `NEGATE_EFFECTS` or `NEGATE_TRIGGER_TYPE` produces `state:negate`. `REDIRECT_ATTACK` produces `state:redirect`.

---

## Hand and deck

**Draw and search.** `DRAW` produces `hand:draw`. `SEARCH_DECK` or `FULL_DECK_SEARCH` produces `hand:search`. `SEARCH_TRASH_THE_REST` produces `hand:search_trash`.

**Deck inspection.** `DECK_SCRY` produces `hand:scry`. `MILL` produces `hand:mill`. `REVEAL` or `REVEAL_HAND` produces `hand:reveal`.

**Hand movement.** The `TRASH_FROM_HAND` action produces `hand:discard`. `PLACE_HAND_TO_DECK` or `RETURN_HAND_TO_DECK` produces `hand:to_deck`. `HAND_WHEEL` produces `hand:wheel`.

**Reuse and counter.** `ACTIVATE_EVENT_FROM_HAND`, `ACTIVATE_EVENT_FROM_TRASH`, or `REUSE_EFFECT` produces `hand:event_reuse`. `GRANT_COUNTER` produces `hand:grant_counter`.

**Play source.** A `PLAY_CARD.params.source_zone` of `HAND` produces `hand:play_from_hand`; `TRASH` produces `hand:play_from_trash`; `DECK` or `DECK_TOP` produces `hand:play_from_deck`; and `LIFE` produces `hand:play_from_life`. `HAND_OR_TRASH` produces both matching tags. `SEARCH_AND_PLAY` produces the deck tag, and `PLAY_FROM_LIFE` produces the Life tag.

---

## Stats

**Direction.** `MODIFY_POWER` and `MODIFY_COST` inspect `params.amount`. A positive number produces an up tag, a negative number produces a down tag, and zero produces neither. A `DynamicValue` counts as up. Actions and modifiers use the same rule. `target.controller` supplies qualifiers, and `target.type` set to `SELF` identifies self.

**Power.** Power changes produce `stat:power_up`, `stat:power_up:self`, `stat:power_up:opponent`, `stat:power_down`, `stat:power_down:self`, or `stat:power_down:opponent`.

**Cost.** Cost changes produce `stat:cost_up`, `stat:cost_up:self`, `stat:cost_up:opponent`, `stat:cost_down`, `stat:cost_down:self`, or `stat:cost_down:opponent`.

**Fixed operations.** `SET_POWER_TO_ZERO` produces `stat:power_to_zero`; `SET_BASE_POWER` produces `stat:set_base_power`; `SET_COST` produces `stat:set_cost`; `COPY_POWER` produces `stat:copy_power`; `SWAP_BASE_POWER` produces `stat:swap_base_power`; and `GRANT_ATTRIBUTE` produces `stat:grant_attribute`.

---

## Cost

**Derivation.** Every non-`CHOICE` `SimpleCost` produces its lowercase discriminant. A `CHOICE` recursively emits every option's simple costs. An `auto` or `activate` block without costs produces `cost:none`.

**Tags.** `cost:don_minus`, `cost:don_rest`, `cost:variable_don_return`, `cost:rest_self`, `cost:trash_self`, `cost:trash_from_hand`, `cost:trash_named_card_from_hand_or_stage`, `cost:trash_from_life`, `cost:place_hand_to_deck`, `cost:reveal_from_hand`, `cost:play_named_card_from_hand`, `cost:rest_cards`, `cost:rest_named_card`, `cost:ko_own_character`, `cost:trash_own_character`, `cost:return_own_character_to_hand`, `cost:place_own_character_to_deck`, `cost:place_self_to_deck`, `cost:place_stage_to_deck`, `cost:add_own_character_to_life`, `cost:trash_own_stage`, `cost:place_from_trash_to_deck`, `cost:leader_power_reduction`, `cost:give_opponent_don`, `cost:return_attached_don_to_cost`, `cost:place_self_and_hand_to_deck`, `cost:place_self_and_trash_to_deck`, `cost:life_to_hand`, `cost:rest_don`, `cost:turn_life_face_up`, `cost:turn_life_face_down`, `cost:choose_one_cost`, `cost:none`.

---

## Condition

**Derivation.** The extractor walks every condition node beneath `conditions`, `post_cost_conditions`, and `WHILE_CONDITION` durations, including `all_of`, `any_of`, and `not`. Each node produces its lowercase `SimpleCondition.type`.

**Tags.** `condition:life_count`, `condition:character_total_cost`, `condition:hand_count`, `condition:trash_count`, `condition:deck_count`, `condition:don_field_count`, `condition:active_don_count`, `condition:all_don_state`, `condition:card_on_field`, `condition:multiple_named_cards`, `condition:named_card_with_property`, `condition:field_purity`, `condition:leader_property`, `condition:self_power`, `condition:self_cost`, `condition:self_state`, `condition:no_base_effect`, `condition:has_effect_type`, `condition:lacks_effect_type`, `condition:comparative`, `condition:combined_total`, `condition:was_played_this_turn`, `condition:action_performed_this_turn`, `condition:play_method`, `condition:face_up_life`, `condition:card_type_in_zone`, `condition:combined_zone_count`, `condition:board_wide_existence`, `condition:rested_card_count`, `condition:don_given`, `condition:turn_count`, `condition:is_my_turn`, `condition:source_property`, `condition:revealed_card_property`.

---

## Flag

**Once per turn.** `flag:once_per_turn` comes from `flags.once_per_turn` or `trigger.once_per_turn`, including compound-trigger members.

**Optional.** `flag:optional` comes from `flags.optional`.

**Decline lock.** `flag:lock_on_decline` comes from `flags.lock_on_decline`.

---

## Effect-trait references

**Reachability.** The extractor walks `TargetFilter` values reachable from each block. Sources include action targets, action parameter filters, cost filters and targets, modifier targets, event filters, rule and prohibition filters, duration conditions, and nested `any_of` filters. `TARGET_FILTER_KEYS` supplies the shared filter vocabulary.

**Target role.** The `target` role records positive values from `traits`, `traits_any_of`, and `traits_contains` in the default target context.

**Search role.** The `search` role records positive values reached through `SEARCH_DECK`, `FULL_DECK_SEARCH`, `SEARCH_TRASH_THE_REST`, or `SEARCH_AND_PLAY`.

**Cost role.** The `cost` role records positive values reached through `costs`.

**Exclude role.** The `exclude` role records every `traits_exclude` value regardless of its surrounding context.

**Substring semantics.** Values from `traits_contains` remain verbatim substrings. The extractor does not expand or normalize them into canonical trait names.

**Identity.** Each distinct reference contains the authored string, its role, and its `blockId`.

---

## Product decisions

**Decision 1.** Removal excludes `SET_POWER_TO_ZERO`. Power-to-zero effects use `stat:power_to_zero` because they modify a card without removing it.

**Decision 2.** DON!! ramp means only `ADD_DON_FROM_DECK`. `SET_DON_ACTIVE` uses the separate untap facet.

**Decision 3.** `traits_exclude` references use the `exclude` role. Products hide them by default so exclusions do not look like positive affinities.

**Decision 4.** The Tier 1 effect-trait filter ignores roles. Role-aware filtering remains Tier 2 even though extraction preserves role metadata.

**Decision 5.** Cost-side trait references count as effect traits with the `cost` role.

**Decision 6.** Card-level scoping is the default. Block-level scoping remains an advanced product toggle, while every reference retains `blockId` for that future view.
