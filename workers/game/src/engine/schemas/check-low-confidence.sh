#!/usr/bin/env node
/**
 * Low-Confidence Encoding Detector
 *
 * Scans card text for patterns known to be complex or deferred,
 * then checks if the schema uses the expected action types.
 * Flags cards where the schema may be a simplified approximation
 * rather than a correct encoding.
 *
 * Usage:
 *   node check-low-confidence.sh
 */

const fs = require("fs");
const path = require("path");

const CARDS_DIR = path.resolve(__dirname, "../../../../../docs/cards");
const SCHEMAS_DIR = __dirname;

// ─── Load all card text ──────────────────────────────────────────────────────

function parseCardTextFiles() {
  const cards = new Map(); // card_id → { name, type, color, text }
  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(CARDS_DIR, file), "utf8");
    const lines = content.split("\n");

    let currentCard = null;
    let textLines = [];

    for (const line of lines) {
      // Match card header: **OP01-001** · Leader · Red
      const headerMatch = line.match(
        /^\*\*([A-Z0-9]+-\d+[A-Za-z]?)\*\*\s*·\s*(\w+)\s*·\s*(.+)/,
      );
      if (headerMatch) {
        // Save previous card
        if (currentCard) {
          cards.set(currentCard.id, {
            ...currentCard,
            text: textLines.join(" ").trim(),
          });
        }
        currentCard = {
          id: headerMatch[1],
          type: headerMatch[2],
          color: headerMatch[3].trim(),
        };
        textLines = [];
        continue;
      }
      if (line.startsWith("---")) continue;
      if (line.startsWith("## ")) continue;
      if (line.startsWith("# ")) continue;
      if (currentCard && line.trim()) {
        textLines.push(line.trim());
      }
    }
    // Save last card
    if (currentCard) {
      cards.set(currentCard.id, {
        ...currentCard,
        text: textLines.join(" ").trim(),
      });
    }
  }

  return cards;
}

// ─── Load all schemas ────────────────────────────────────────────────────────

function loadAllSchemas() {
  const schemas = new Map(); // card_id → schema object
  const files = fs
    .readdirSync(SCHEMAS_DIR)
    .filter(
      (f) =>
        f.endsWith(".ts") &&
        !f.includes("check-") &&
        !f.includes("lint-") &&
        !f.includes("pre-scan"),
    );

  for (const file of files) {
    let code = fs.readFileSync(path.join(SCHEMAS_DIR, file), "utf8");
    code = code.replace(/^import\b.*$/gm, "");
    code = code.replace(
      /export\s+const\s+(\w+)\s*:\s*[^=]+=\s*/g,
      "var $1 = exports.$1 = ",
    );
    code = code.replace(/\bas\s+\w+/g, "");
    code = code.replace(/(\w)!/g, "$1");

    const exports = {};
    try {
      const fn = new Function("exports", code);
      fn(exports);
    } catch (e) {
      console.error(`Failed to load ${file}: ${e.message}`);
      continue;
    }

    for (const value of Object.values(exports)) {
      if (value && typeof value === "object" && value.card_id && value.effects) {
        schemas.set(value.card_id, value);
      }
    }
  }

  return schemas;
}

// ─── Collect all action types from a schema ──────────────────────────────────

function collectActionTypes(schema) {
  const types = new Set();

  function walkActions(actions) {
    if (!actions) return;
    for (const a of actions) {
      if (a.type) types.add(a.type);
      if (a.params && a.params.action) walkActions([a.params.action]);
      if (a.branches) {
        for (const b of a.branches) {
          walkActions(b.actions);
        }
      }
    }
  }

  for (const effect of schema.effects) {
    walkActions(effect.actions);
    if (effect.modifiers) {
      for (const m of effect.modifiers) {
        if (m.type) types.add("MODIFIER:" + m.type);
      }
    }
    // Also collect cost types (some checks need to know about costs)
    if (effect.costs) {
      for (const c of effect.costs) {
        if (c.type) types.add("COST:" + c.type);
      }
    }
  }

  return types;
}

// ─── High-risk patterns ──────────────────────────────────────────────────────
// Each pattern: { name, textPattern (regex on card text), expectedAction (optional),
//   check (function returning true if suspicious) }

const HIGH_RISK_PATTERNS = [
  {
    name: "REVEAL_CONDITIONAL",
    textPattern: /\breveal\b.*\bif\b.*\brevealed\b/i,
    description: "Reveal + conditional on revealed card properties",
    check: (_text, actionTypes) =>
      !actionTypes.has("REVEAL") ||
      // If they have REVEAL but the schema doesn't have a condition block,
      // it might be encoded as unconditional
      false,
  },
  {
    name: "REVEAL_WITHOUT_ACTION",
    textPattern: /\breveal\s+\d+\s+card/i,
    description: "Card text mentions reveal but schema may not use REVEAL action",
    check: (_text, actionTypes) => !actionTypes.has("REVEAL"),
  },
  {
    name: "HAND_COST_REDUCTION",
    textPattern: /give this card in your hand.*cost|this card in your hand.*−\d+ cost/i,
    description: "Hand-zone cost modifier",
    check: (_text, _actionTypes) => true, // Always flag — known deferred pattern
  },
  {
    name: "CHOOSE_A_COST",
    textPattern: /\bchoose a cost\b/i,
    description: "Choose a cost value (CHOOSE_VALUE action needed)",
    check: (_text, actionTypes) => !actionTypes.has("CHOOSE_VALUE"),
  },
  {
    name: "NEXT_TIME_YOU_PLAY",
    textPattern: /\bthe next time you play\b/i,
    description: "One-time cost reduction on next play event",
    check: (_text, _actionTypes) => true, // Known deferred pattern
  },
  {
    name: "SAME_NAME_AS_TRASHED",
    textPattern: /same (?:card )?name as the (?:trashed|returned)/i,
    description: "Play/search referencing a previously trashed/returned card's name",
    check: (_text, _actionTypes) => true, // Cost-to-action ref not supported
  },
  {
    name: "BASE_POWER_BECOMES",
    textPattern: /base power becomes/i,
    description: "Set base power (needs SET_BASE_POWER)",
    check: (_text, actionTypes) =>
      !actionTypes.has("SET_BASE_POWER") && !actionTypes.has("MODIFIER:SET_BASE_POWER"),
  },
  {
    name: "SWAP_POWER",
    textPattern: /swap.*(?:base )?power|switch.*(?:base )?power/i,
    description: "Swap base power between cards",
    check: (_text, actionTypes) => !actionTypes.has("SWAP_BASE_POWER"),
  },
  {
    name: "OPPONENT_REVEALS_HAND",
    textPattern: /opponent reveals? (?:that|the|a) card/i,
    description: "Opponent reveals card from hand + conditional",
    check: (_text, actionTypes) => !actionTypes.has("REVEAL_HAND"),
  },
  {
    name: "TURN_LIFE_FACE",
    textPattern: /turn \d+ (?:of your )?(?:face-up )?life cards? face-(?:up|down)|turn \d+ card from.*life.*face-(?:up|down)/i,
    description: "Turn life cards face up/down (check if schema uses correct action/cost type)",
    check: (_text, actionTypes) =>
      !actionTypes.has("TURN_LIFE_FACE_UP") && !actionTypes.has("TURN_LIFE_FACE_DOWN") &&
      !actionTypes.has("COST:TURN_LIFE_FACE_UP") && !actionTypes.has("COST:TURN_LIFE_FACE_DOWN"),
  },
  {
    name: "PLAY_FROM_DECK",
    textPattern: /play up to \d+.*from your deck(?! \.)/i,
    description: "Play card directly from deck (full deck search + play)",
    check: (_text, actionTypes) =>
      !actionTypes.has("SEARCH_AND_PLAY") && !actionTypes.has("FULL_DECK_SEARCH"),
  },
  {
    name: "COPY_OPPONENTS_EFFECT",
    textPattern: /\bactivate (?:1 of )?your opponent'?s?\b.*\beffect/i,
    description: "Copy or activate opponent's effect",
    check: (_text, _actionTypes) => true, // Complex meta-effect
  },
  {
    name: "POWER_BECOMES_ZERO",
    textPattern: /power becomes 0|reduce.*power to 0/i,
    description: "Set power to zero",
    check: (_text, actionTypes) => !actionTypes.has("SET_POWER_TO_ZERO"),
  },
  {
    name: "SEARCH_TRASH_THE_REST",
    textPattern: /look at.*top.*cards?.*(?:add|place|choose).*(?:rest|remaining).*(?:trash|bottom|deck)/i,
    description: "Look at top N, pick some, trash/place the rest",
    check: (_text, actionTypes) => !actionTypes.has("SEARCH_TRASH_THE_REST") && !actionTypes.has("SEARCH_DECK"),
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

const cards = parseCardTextFiles();
const schemas = loadAllSchemas();

console.log(`Loaded ${cards.size} cards from docs/cards/, ${schemas.size} schemas from schema files.\n`);

const flags = [];

for (const [cardId, schema] of schemas) {
  const card = cards.get(cardId);
  if (!card) continue; // No card text available

  const actionTypes = collectActionTypes(schema);
  const text = card.text;
  if (!text) continue;

  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.textPattern.test(text)) {
      if (pattern.check(text, actionTypes)) {
        flags.push({
          cardId,
          cardName: schema.card_name,
          pattern: pattern.name,
          description: pattern.description,
          textSnippet: text.substring(0, 120) + (text.length > 120 ? "..." : ""),
        });
      }
    }
  }
}

// ─── Output ──────────────────────────────────────────────────────────────────

if (flags.length === 0) {
  console.log("No low-confidence encodings detected.");
  process.exit(0);
}

// Group by pattern
const byPattern = new Map();
for (const f of flags) {
  if (!byPattern.has(f.pattern)) byPattern.set(f.pattern, []);
  byPattern.get(f.pattern).push(f);
}

console.log(`--- ${flags.length} low-confidence encoding(s) detected ---\n`);

for (const [pattern, items] of byPattern) {
  console.log(`\n## ${pattern} (${items.length} card(s))`);
  console.log(`   ${items[0].description}\n`);
  for (const item of items) {
    console.log(`   ${item.cardId} ${item.cardName}`);
    console.log(`     text: ${item.textSnippet}`);
  }
}

process.exit(1);
