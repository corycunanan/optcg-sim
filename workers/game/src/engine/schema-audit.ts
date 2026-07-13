import {
  getNestedActions,
  type Action,
  type EffectSchema,
} from "./effect-types.js";

export interface CardTextRecord {
  id: string;
  text: string;
}

export interface LowConfidenceFinding {
  cardId: string;
  pattern: string;
}

interface RiskPattern {
  name: string;
  textPattern: RegExp;
  suspicious(actionTypes: ReadonlySet<string>): boolean;
}

const HIGH_RISK_PATTERNS: readonly RiskPattern[] = [
  {
    name: "REVEAL_WITHOUT_ACTION",
    textPattern: /\breveal\s+\d+\s+card/i,
    suspicious: (types) => !types.has("REVEAL"),
  },
  {
    name: "HAND_COST_REDUCTION",
    textPattern:
      /give this card in your hand.*cost|this card in your hand.*−\d+ cost/i,
    suspicious: () => true,
  },
  {
    name: "CHOOSE_A_COST",
    textPattern: /\bchoose a cost\b/i,
    suspicious: (types) => !types.has("CHOOSE_VALUE"),
  },
  {
    name: "NEXT_TIME_YOU_PLAY",
    textPattern: /\bthe next time you play\b/i,
    suspicious: () => true,
  },
  {
    name: "SAME_NAME_AS_TRASHED",
    textPattern: /same (?:card )?name as the (?:trashed|returned)/i,
    suspicious: () => true,
  },
  {
    name: "BASE_POWER_BECOMES",
    textPattern: /base power becomes/i,
    suspicious: (types) =>
      !types.has("SET_BASE_POWER") && !types.has("MODIFIER:SET_BASE_POWER"),
  },
  {
    name: "SWAP_POWER",
    textPattern: /swap.*(?:base )?power|switch.*(?:base )?power/i,
    suspicious: (types) => !types.has("SWAP_BASE_POWER"),
  },
  {
    name: "OPPONENT_REVEALS_HAND",
    textPattern: /opponent reveals? (?:that|the|a) card/i,
    suspicious: (types) => !types.has("REVEAL_HAND"),
  },
  {
    name: "TURN_LIFE_FACE",
    textPattern:
      /turn \d+ (?:of your )?(?:face-up )?life cards? face-(?:up|down)|turn \d+ card from.*life.*face-(?:up|down)/i,
    suspicious: (types) =>
      !types.has("TURN_LIFE_FACE_UP") &&
      !types.has("TURN_LIFE_FACE_DOWN") &&
      !types.has("COST:TURN_LIFE_FACE_UP") &&
      !types.has("COST:TURN_LIFE_FACE_DOWN"),
  },
  {
    name: "PLAY_FROM_DECK",
    textPattern: /play up to \d+.*from your deck(?! \.)/i,
    suspicious: (types) =>
      !types.has("SEARCH_AND_PLAY") && !types.has("FULL_DECK_SEARCH"),
  },
  {
    name: "COPY_OPPONENTS_EFFECT",
    textPattern: /\bactivate (?:1 of )?your opponent'?s?\b.*\beffect/i,
    suspicious: () => true,
  },
  {
    name: "POWER_BECOMES_ZERO",
    textPattern: /power becomes 0|reduce.*power to 0/i,
    suspicious: (types) => !types.has("SET_POWER_TO_ZERO"),
  },
  {
    name: "SEARCH_TRASH_THE_REST",
    textPattern:
      /look at.*top.*cards?.*(?:add|place|choose).*(?:rest|remaining).*(?:trash|bottom|deck)/i,
    suspicious: (types) =>
      !types.has("SEARCH_TRASH_THE_REST") && !types.has("SEARCH_DECK"),
  },
];

export function parseCardTextMarkdown(markdown: string): CardTextRecord[] {
  const records: CardTextRecord[] = [];
  let currentId: string | null = null;
  let text: string[] = [];

  const flush = (): void => {
    if (currentId) records.push({ id: currentId, text: text.join(" ").trim() });
  };

  for (const line of markdown.split("\n")) {
    const match = line.match(
      /^\*\*([A-Z0-9]+-\d+[A-Za-z]?)\*\*\s*·\s*\w+\s*·\s*/
    );
    if (match) {
      flush();
      currentId = match[1];
      text = [];
    } else if (
      currentId &&
      line.trim() &&
      !line.startsWith("#") &&
      !line.startsWith("---")
    ) {
      text.push(line.trim());
    }
  }
  flush();
  return records;
}

function collectActionTypes(schema: EffectSchema): Set<string> {
  const types = new Set<string>();
  const visit = (actions: Action[] | undefined): void => {
    for (const action of actions ?? []) {
      types.add(action.type);
      visit(getNestedActions(action));
    }
  };

  for (const block of schema.effects) {
    visit(block.actions);
    visit(block.replacement_actions);
    for (const modifier of block.modifiers ?? []) {
      types.add(`MODIFIER:${modifier.type}`);
    }
    for (const cost of block.costs ?? []) types.add(`COST:${cost.type}`);
  }
  return types;
}

export function findLowConfidenceFindings(
  cardTexts: ReadonlyMap<string, string>,
  schemas: Readonly<Record<string, EffectSchema>>
): LowConfidenceFinding[] {
  const findings: LowConfidenceFinding[] = [];
  for (const [cardId, schema] of Object.entries(schemas)) {
    const text = cardTexts.get(cardId);
    if (!text) continue;
    const actionTypes = collectActionTypes(schema);
    for (const pattern of HIGH_RISK_PATTERNS) {
      pattern.textPattern.lastIndex = 0;
      if (pattern.textPattern.test(text) && pattern.suspicious(actionTypes)) {
        findings.push({ cardId, pattern: pattern.name });
      }
    }
  }
  return findings;
}
