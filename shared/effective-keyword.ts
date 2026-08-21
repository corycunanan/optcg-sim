export type KeywordName =
  | "BLOCKER"
  | "RUSH"
  | "RUSH_CHARACTER"
  | "DOUBLE_ATTACK"
  | "UNBLOCKABLE"
  | "BANISH"
  | "TRIGGER";

type PrintedKeywords = {
  blocker?: boolean;
  rush?: boolean;
  rushCharacter?: boolean;
  doubleAttack?: boolean;
  unblockable?: boolean;
  banish?: boolean;
  trigger?: boolean;
};

type ActiveKeywordEffect = {
  appliesTo?: string[];
  modifiers?: Array<{
    type: string;
    params?: { keyword?: string };
  }>;
};

const PRINTED_KEYWORD_FIELDS: Record<KeywordName, keyof PrintedKeywords> = {
  BLOCKER: "blocker",
  RUSH: "rush",
  RUSH_CHARACTER: "rushCharacter",
  DOUBLE_ATTACK: "doubleAttack",
  UNBLOCKABLE: "unblockable",
  BANISH: "banish",
  TRIGGER: "trigger",
};

/**
 * Return whether a broadcast card has a printed or runtime-granted keyword.
 *
 * Broadcast effects already exclude false conditions. Runtime-selected
 * negation targets and SELF modifier targets are resolved into `appliesTo` by
 * the worker, so membership is sufficient here. Dynamic aura targets are absent
 * from `appliesTo` and remain unsupported until the worker broadcasts their
 * resolved targets. `CAN_ATTACK_ACTIVE` and `_DON_PHASE_GIVE_TO_LEADER` are
 * internal engine grants and deliberately excluded from the client-facing set.
 */
export function hasRuntimeKeyword(
  instanceId: string,
  printedKeywords: PrintedKeywords | undefined,
  activeEffects: ReadonlyArray<ActiveKeywordEffect>,
  keyword: KeywordName
): boolean {
  const printed = printedKeywords?.[PRINTED_KEYWORD_FIELDS[keyword]] === true;
  let granted = false;
  let removed = false;
  let negated = false;

  for (const effect of activeEffects) {
    if (!effect.appliesTo?.includes(instanceId)) continue;

    for (const modifier of effect.modifiers ?? []) {
      if (modifier.type === "NEGATE_EFFECTS_FLAG") {
        negated = true;
        continue;
      }
      if (modifier.params?.keyword !== keyword) continue;
      if (modifier.type === "GRANT_KEYWORD") granted = true;
      if (modifier.type === "REMOVE_KEYWORD") removed = true;
    }
  }

  return ((printed && !negated) || granted) && !removed;
}
