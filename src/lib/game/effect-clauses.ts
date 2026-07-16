export interface EffectClause {
  text: string;
  blockId: string | null;
}

export interface EffectBlockView {
  id: string;
  category: string;
  sourceText?: string;
  triggerKeyword?: string;
  triggerKeywords?: string[];
}

export const BLOCKED_REASON_COPY: Record<string, string> = {
  COST: "cost unavailable",
  CONDITION: "condition not met",
  PHASE: "not this phase",
  ONCE_PER_TURN: "used this turn",
  NO_TARGET: "no valid target",
};

const TIMING_KEYWORDS: Record<string, readonly string[]> = {
  "activate: main": ["ACTIVATE_MAIN"],
  "on play": ["ON_PLAY"],
  "when attacking": ["WHEN_ATTACKING"],
  "when attacked": ["WHEN_ATTACKED"],
  "on k.o.": ["ON_KO"],
  "on block": ["ON_BLOCK"],
  "on your opponent's attack": ["ON_OPPONENT_ATTACK"],
  counter: ["COUNTER", "COUNTER_EVENT"],
  main: ["MAIN_EVENT"],
  trigger: ["TRIGGER"],
  "end of your turn": ["END_OF_YOUR_TURN"],
  "end of your opponent's turn": ["END_OF_OPPONENT_TURN"],
  "start of your turn": ["START_OF_TURN"],
};

const MODIFIER_TOKEN_PATTERNS = [
  /^don!!\s*x\d+$/i,
  /^once per turn$/i,
  /^your turn$/i,
  /^opponent's turn$/i,
];

const KEYWORD_TOKENS = new Set([
  "blocker",
  "rush",
  "double attack",
  "banish",
  "unblockable",
]);

const LEADING_BRACKET_TOKENS = /^(\[[^\]]+\]\s*\/?\s*)+/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isKeywordOnlyBlock(block: Record<string, unknown>): boolean {
  if (block.category !== "permanent" || !isRecord(block.flags)) return false;

  const keywords = block.flags.keywords;
  if (!Array.isArray(keywords) || keywords.length === 0) return false;

  return (
    block.conditions === undefined &&
    block.modifiers === undefined &&
    block.prohibitions === undefined
  );
}

/** Safely extracts the client fields needed to match effect-text clauses. */
export function parseEffectBlocks(effectSchema: unknown): EffectBlockView[] {
  if (!isRecord(effectSchema) || !Array.isArray(effectSchema.effects)) {
    return [];
  }

  return effectSchema.effects.flatMap((effect): EffectBlockView[] => {
    if (
      !isRecord(effect) ||
      typeof effect.id !== "string" ||
      typeof effect.category !== "string" ||
      isKeywordOnlyBlock(effect)
    ) {
      return [];
    }

    const block: EffectBlockView = {
      id: effect.id,
      category: effect.category,
    };

    if (typeof effect.source_text === "string") {
      block.sourceText = effect.source_text;
    }

    if (isRecord(effect.trigger)) {
      if (typeof effect.trigger.keyword === "string") {
        block.triggerKeyword = effect.trigger.keyword;
      }

      if (Array.isArray(effect.trigger.any_of)) {
        const triggerKeywords = effect.trigger.any_of.flatMap((trigger) =>
          isRecord(trigger) && typeof trigger.keyword === "string"
            ? [trigger.keyword]
            : []
        );

        if (block.triggerKeyword) triggerKeywords.unshift(block.triggerKeyword);
        if (triggerKeywords.length > 0) {
          block.triggerKeywords = [...new Set(triggerKeywords)];
        }
      }
    }

    return [block];
  });
}

function normalizeToken(token: string): string {
  return token.slice(1, -1).trim().replace(/\s+/g, " ").toLowerCase();
}

function isModifierToken(token: string): boolean {
  return MODIFIER_TOKEN_PATTERNS.some((pattern) => pattern.test(token));
}

function isKeywordOnlyLine(tokens: string[], remainder: string): boolean {
  return (
    tokens.length > 0 &&
    tokens.every((token) => KEYWORD_TOKENS.has(token)) &&
    (remainder.length === 0 || /^\([^]*\)$/.test(remainder))
  );
}

function uniqueBlockId(candidates: EffectBlockView[]): string | null {
  return candidates.length === 1 ? candidates[0].id : null;
}

function isEffectBlockView(value: unknown): value is EffectBlockView {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.category === "string" &&
    (value.sourceText === undefined || typeof value.sourceText === "string") &&
    (value.triggerKeyword === undefined ||
      typeof value.triggerKeyword === "string") &&
    (value.triggerKeywords === undefined ||
      (Array.isArray(value.triggerKeywords) &&
        value.triggerKeywords.every((keyword) => typeof keyword === "string")))
  );
}

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function blockHasTriggerKeyword(
  block: EffectBlockView,
  timingKeywords: Set<string>
): boolean {
  if (block.triggerKeyword && timingKeywords.has(block.triggerKeyword)) {
    return true;
  }

  return (
    block.triggerKeywords?.some((keyword) => timingKeywords.has(keyword)) ??
    false
  );
}

/** Splits effect text into line clauses and conservatively matches each one. */
export function segmentEffectText(
  effectText: string,
  blocks: EffectBlockView[]
): EffectClause[] {
  if (typeof effectText !== "string") return [];

  const safeBlocks = Array.isArray(blocks)
    ? blocks.filter(isEffectBlockView)
    : [];

  const clauses = effectText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const normalizedClauses = clauses.map(normalizeWhitespace);
  const freshSourceBlocks = new Set(
    safeBlocks.filter((block) => {
      if (block.sourceText === undefined) return false;
      const sourceText = normalizeWhitespace(block.sourceText);
      return (
        sourceText.length > 0 &&
        normalizedClauses.some((clause) => clause.includes(sourceText))
      );
    })
  );
  const heuristicBlocks = safeBlocks.filter(
    (block) => !freshSourceBlocks.has(block)
  );

  return clauses.map((text, clauseIndex): EffectClause => {
    const sourceMatches = safeBlocks.filter(
      (block) =>
        freshSourceBlocks.has(block) &&
        normalizedClauses[clauseIndex].includes(
          normalizeWhitespace(block.sourceText!)
        )
    );
    if (sourceMatches.length > 0) {
      return { text, blockId: uniqueBlockId(sourceMatches) };
    }

    const leading = text.match(LEADING_BRACKET_TOKENS)?.[0] ?? "";
    const tokens = Array.from(leading.matchAll(/\[[^\]]+\]/g), ([token]) =>
      normalizeToken(token)
    );
    const remainder = text.slice(leading.length).trim();

    if (isKeywordOnlyLine(tokens, remainder)) {
      return { text, blockId: null };
    }

    const timingKeywords = new Set(
      tokens.flatMap((token) =>
        isModifierToken(token) ? [] : (TIMING_KEYWORDS[token] ?? [])
      )
    );

    if (timingKeywords.size > 0) {
      return {
        text,
        blockId: uniqueBlockId(
          heuristicBlocks.filter((block) =>
            blockHasTriggerKeyword(block, timingKeywords)
          )
        ),
      };
    }

    const hasOnlyModifiers =
      tokens.length > 0 && tokens.every(isModifierToken);
    if (tokens.length === 0 || hasOnlyModifiers) {
      return {
        text,
        blockId: uniqueBlockId(
          heuristicBlocks.filter((block) => block.category === "permanent")
        ),
      };
    }

    return { text, blockId: null };
  });
}
