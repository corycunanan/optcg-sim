/**
 * Keyword lookups over effect-block triggers, compound `any_of` included.
 *
 * Convention (OPT-911): a card printed `[Main]/[Counter]` is authored as ONE
 * block with `trigger: { any_of: [{ keyword: "MAIN_EVENT" }, { keyword:
 * "COUNTER_EVENT" }] }` and `category: "auto"`. Every consumer that selects a
 * block by keyword (PLAY_CARD's [Main], USE_COUNTER_EVENT's [Counter], Life
 * [Trigger], REUSE_EFFECT) goes through `findBlockByKeyword`, so a keyword
 * nested in `any_of` selects the block exactly as a top-level keyword does.
 */
import type { EffectBlock, KeywordTriggerType, Trigger } from "./effect-types.js";

/** Every keyword a trigger carries, flattening nested `any_of` compounds. */
export function triggerKeywords(trigger: Trigger | undefined): KeywordTriggerType[] {
  if (!trigger || typeof trigger !== "object") return [];
  if ("any_of" in trigger) {
    return Array.isArray(trigger.any_of) ? trigger.any_of.flatMap(triggerKeywords) : [];
  }
  return "keyword" in trigger ? [trigger.keyword] : [];
}

/** True when the trigger is `keyword` itself or an `any_of` containing it. */
export function triggerHasKeyword(
  trigger: Trigger | undefined,
  keyword: KeywordTriggerType,
): boolean {
  return triggerKeywords(trigger).includes(keyword);
}

/** The first block whose trigger carries `keyword`, directly or via `any_of`. */
export function findBlockByKeyword(
  effects: readonly EffectBlock[] | undefined,
  keyword: KeywordTriggerType,
): EffectBlock | undefined {
  return effects?.find((block) => triggerHasKeyword(block.trigger, keyword));
}

/**
 * OPT-913 `REUSE_EFFECT.target_effect` contract: the value names the reused
 * block either by its block `id` or by a trigger keyword the block carries
 * (directly or inside `any_of`). It must resolve to exactly one block on the
 * card; schema validation rejects zero or several matches, and the resolver
 * treats anything but one match as a failed lookup. There is no keyword
 * alias: a [Counter] Event's block is `COUNTER_EVENT`, never `COUNTER`.
 */
export function findReuseTargetBlocks(
  effects: readonly EffectBlock[] | undefined,
  targetEffect: string,
): EffectBlock[] {
  return (effects ?? []).filter(
    (block) =>
      block.id === targetEffect ||
      triggerKeywords(block.trigger).includes(targetEffect as KeywordTriggerType),
  );
}
