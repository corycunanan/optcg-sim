#!/usr/bin/env node
/**
 * Pre-scan card text for known deferred effect patterns.
 * Run BEFORE encoding a set to identify cards that may need deferral.
 *
 * Usage: node pre-scan.sh <card-text-file>
 *   e.g. node pre-scan.sh docs/cards/OP-04.md
 */

const fs = require("fs");
const path = require("path");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node pre-scan.sh <card-text-file>");
  process.exit(1);
}

const resolved = path.resolve(file);
if (!fs.existsSync(resolved)) {
  console.error(`Error: File not found: ${resolved}`);
  process.exit(1);
}

const text = fs.readFileSync(resolved, "utf8");
const lines = text.split("\n");

const PATTERNS = [
  {
    tag: "REVEAL_CONDITIONAL",
    desc: "Reveal-then-branch: reveals card and conditionally acts based on properties",
    test: (line) =>
      /reveal.*from.*top.*deck/i.test(line) &&
      /if\s+(that|the revealed|it is)/i.test(line),
  },
  {
    tag: "HAND_REVEAL_CONDITIONAL",
    desc: "Blind hand selection + reveal + conditional branch",
    test: (line) =>
      /choose.*from.*opponent.*hand/i.test(line) && /reveal/i.test(line),
  },
  {
    tag: "HAND_ZONE_MODIFIER",
    desc: "Permanent cost/stat modifier applied to cards in hand zone",
    test: (line) =>
      /(?:in your hand|in their hand).*(?:cost|power)/i.test(line) &&
      !/(?:trash|from your hand)/i.test(line),
  },
  {
    tag: "SELF_REF_TRACKING",
    desc: "Tracks own prior activations beyond once_per_turn",
    test: (line) =>
      /haven.*(?:drawn|activated|used).*using.*this.*(?:leader|character|card).*effect/i.test(
        line,
      ),
  },
  {
    tag: "FULL_DECK_SEARCH_AND_PLAY",
    desc: "Full deck search that plays to field (not top-N)",
    test: (line) =>
      /play.*from.*your\s+deck/i.test(line) &&
      !/look\s+at.*cards/i.test(line) &&
      !/don!!\s+deck/i.test(line) &&
      !/from.*top.*(?:of\s+)?your\s+deck/i.test(line) &&
      !/from\s+your\s+deck\s+to/i.test(line) &&
      !/place.*(?:from|at).*(?:bottom|top).*(?:of\s+)?(?:your|the|owner)/i.test(line),
  },
  {
    tag: "NEXT_EVENT_COST_REDUCTION",
    desc: "One-time cost reduction scoped to next qualifying play event",
    test: (line) =>
      /next\s+time\s+you\s+play/i.test(line) &&
      /(?:cost|reduced)/i.test(line),
  },
];

let currentCard = "";
const matches = [];

for (const line of lines) {
  // Track current card ID from **OP0X-NNN** bold markers
  const idMatch = line.match(/\*\*([A-Z]{2}\d+-\d+)\*\*/);
  if (idMatch) {
    currentCard = idMatch[1];
  }

  // Skip empty lines, dividers, headers
  if (!line.trim() || line.trim() === "---" || line.startsWith("#")) continue;

  for (const pattern of PATTERNS) {
    if (pattern.test(line)) {
      matches.push({ tag: pattern.tag, desc: pattern.desc, card: currentCard, line: line.trim() });
    }
  }
}

if (matches.length === 0) {
  console.log(`No deferred patterns found in ${path.basename(file)} — all cards are encodable.`);
} else {
  console.log(`=== Deferred Pattern Scan: ${path.basename(file)} ===\n`);
  for (const m of matches) {
    console.log(`[${m.tag}] ${m.card}`);
    console.log(`  ${m.desc}`);
    console.log(`  Text: ${m.line}\n`);
  }
  console.log("---");
  console.log("Review flagged cards against docs/game-engine/DEFERRED-CARD-EFFECTS.md");
  console.log("before encoding. Some may be false positives.");
}
