#!/usr/bin/env node
/**
 * Card text completeness checker.
 * Flags cards with truncated, incomplete, or malformed effect text.
 * Run BEFORE encoding to catch bad source data.
 *
 * Usage: node check-card-text.sh <card-text-file>
 *   e.g. node check-card-text.sh docs/cards/OP-03.md
 */

const fs = require("fs");
const path = require("path");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node check-card-text.sh <card-text-file>");
  process.exit(1);
}

const resolved = path.resolve(file);
if (!fs.existsSync(resolved)) {
  console.error(`Error: File not found: ${resolved}`);
  process.exit(1);
}

const text = fs.readFileSync(resolved, "utf8");

// Parse cards: each card is a ## heading followed by **ID** and effect lines
const cards = [];
let current = null;

for (const line of text.split("\n")) {
  if (line.startsWith("## ")) {
    if (current) cards.push(current);
    current = { name: line.replace("## ", "").trim(), id: "", lines: [] };
  } else if (current) {
    const idMatch = line.match(/\*\*([A-Z]{2}\d+-\d+)\*\*/);
    if (idMatch) {
      current.id = idMatch[1];
    } else if (line.trim() && line.trim() !== "---" && !line.startsWith("#")) {
      current.lines.push(line.trim());
    }
  }
}
if (current) cards.push(current);

const CHECKS = [
  {
    name: "Trailing preposition",
    desc: "Effect text ends with a preposition (by/with/of/to/from/and/or) — likely truncated",
    test: (lines) => {
      for (const line of lines) {
        if (/\b(by|with|of|to|from|and|or)\s*$/.test(line) && !line.startsWith("**Trigger")) {
          return line;
        }
      }
      return null;
    },
  },
  {
    name: "Unclosed bracket",
    desc: "Opening bracket [ without matching ]",
    test: (lines) => {
      for (const line of lines) {
        const opens = (line.match(/\[/g) || []).length;
        const closes = (line.match(/\]/g) || []).length;
        if (opens > closes) return line;
      }
      return null;
    },
  },
  {
    name: "Unclosed brace",
    desc: "Opening brace { without matching }",
    test: (lines) => {
      for (const line of lines) {
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        if (opens > closes) return line;
      }
      return null;
    },
  },
  {
    name: "Unclosed parenthesis",
    desc: "Opening ( without matching )",
    test: (lines) => {
      for (const line of lines) {
        const opens = (line.match(/\(/g) || []).length;
        const closes = (line.match(/\)/g) || []).length;
        if (opens > closes) return line;
      }
      return null;
    },
  },
  {
    name: "Suspiciously short effect",
    desc: "Effect text under 15 characters — may be truncated (not counting Trigger lines)",
    test: (lines) => {
      const effectLines = lines.filter(
        (l) => !l.startsWith("**Trigger") && l.length > 0,
      );
      if (effectLines.length === 0) return null;
      // Only flag if ALL effect lines combined are very short
      const combined = effectLines.join(" ");
      if (combined.length > 0 && combined.length < 15) return combined;
      return null;
    },
  },
  {
    name: "Missing number after operator",
    desc: "Text has 'cost of' or 'power of' without a following number",
    test: (lines) => {
      for (const line of lines) {
        if (/(?:cost|power)\s+of\s*$/.test(line)) return line;
        if (/(?:cost|power)\s+of\s+(?:or|and|$)/i.test(line)) return line;
      }
      return null;
    },
  },
  {
    name: "Empty effect after bracket tag",
    desc: "Bracket tag like [On Play] with no effect text following",
    test: (lines) => {
      for (const line of lines) {
        // Line is ONLY bracket tags with no actual effect
        if (/^\[.+\]\s*$/.test(line) && !/\(/.test(line)) return line;
      }
      return null;
    },
  },
  {
    name: "Dangling colon",
    desc: "Line ends with a colon — cost specified but effect text missing",
    test: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/:\s*$/.test(line) && !line.startsWith("**") && !/choose\s+one/i.test(line)) {
          // Check if next line exists and has content (bullet options)
          const next = lines[i + 1];
          if (next && /^[•\-\*]/.test(next.trim())) continue;
          return line;
        }
      }
      return null;
    },
  },
];

let issues = 0;

for (const card of cards) {
  if (card.lines.length === 0) continue; // Vanilla card, skip

  for (const check of CHECKS) {
    const match = check.test(card.lines);
    if (match) {
      if (issues === 0) {
        console.log(`=== Card Text Check: ${path.basename(file)} ===\n`);
      }
      issues++;
      console.log(`[${check.name}] ${card.id} ${card.name}`);
      console.log(`  ${check.desc}`);
      console.log(`  Text: ${match}\n`);
    }
  }
}

if (issues === 0) {
  console.log(
    `No issues found in ${path.basename(file)} — all card text looks complete.`,
  );
} else {
  console.log("---");
  console.log(
    `${issues} issue(s) found. Fix card text in the source file before encoding.`,
  );
}
