#!/usr/bin/env node
/**
 * Documentation drift detector.
 * Extracts type union members from effect-types.ts and checks
 * that they appear in the schemas README.md.
 *
 * Usage: node check-doc-drift.sh
 *
 * Exit code 0 = no drift, 1 = drift detected.
 */

const fs = require("fs");
const path = require("path");

const SCHEMAS_DIR = __dirname;
const TYPES_FILE = path.resolve(SCHEMAS_DIR, "../effect-types.ts");
const README_FILE = path.resolve(SCHEMAS_DIR, "README.md");

if (!fs.existsSync(TYPES_FILE)) {
  console.error(`Error: effect-types.ts not found at ${TYPES_FILE}`);
  process.exit(1);
}
if (!fs.existsSync(README_FILE)) {
  console.error(`Error: README.md not found at ${README_FILE}`);
  process.exit(1);
}

const typesContent = fs.readFileSync(TYPES_FILE, "utf8");
const readmeContent = fs.readFileSync(README_FILE, "utf8");

/**
 * Extract string literal union members from a TypeScript type.
 * Matches patterns like:  | "DRAW"  or  | "ON_PLAY"
 * within a type definition block.
 */
function extractUnionMembers(content, typeName) {
  // Find the type declaration and extract all string literals from it
  const typeRegex = new RegExp(
    `export\\s+type\\s+${typeName}\\s*=([\\s\\S]*?)(?:;|export\\s)`,
    "m",
  );
  const match = content.match(typeRegex);
  if (!match) return [];

  const block = match[1];
  const members = [];
  const literalRegex = /"\s*([A-Z][A-Z0-9_]+)\s*"/g;
  let m;
  while ((m = literalRegex.exec(block)) !== null) {
    members.push(m[1]);
  }
  return [...new Set(members)];
}

/**
 * Extract string literal members from an interface's string literal type fields.
 * e.g., type: "LIFE_COUNT" from interface LifeCountCondition
 */
function extractConditionTypes(content) {
  const types = [];
  const regex = /type:\s*"([A-Z][A-Z0-9_]+)"/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    types.push(m[1]);
  }
  return [...new Set(types)];
}

// Types to check
const CHECKS = [
  {
    label: "Action Types",
    members: extractUnionMembers(typesContent, "ActionType"),
  },
  {
    label: "Cost Types",
    members: extractUnionMembers(typesContent, "CostType"),
  },
  {
    label: "Keyword Trigger Types",
    members: extractUnionMembers(typesContent, "KeywordTriggerType"),
  },
  {
    label: "Custom Event Types",
    members: extractUnionMembers(typesContent, "CustomEventType"),
  },
  {
    label: "Prohibition Types",
    members: extractUnionMembers(typesContent, "ProhibitionType"),
  },
  {
    label: "Target Types",
    members: extractUnionMembers(typesContent, "TargetType"),
  },
  {
    label: "Keywords",
    members: extractUnionMembers(typesContent, "Keyword"),
  },
  {
    label: "Replacement Events",
    members: extractUnionMembers(typesContent, "ReplacementEvent"),
  },
];

// Also check TargetFilter fields
const filterFieldRegex =
  /export\s+interface\s+TargetFilter\s*\{([\s\S]*?)\n\}/m;
const filterMatch = typesContent.match(filterFieldRegex);
const filterFields = [];
if (filterMatch) {
  const fieldRegex = /^\s+(\w+)\??:/gm;
  let m;
  while ((m = fieldRegex.exec(filterMatch[1])) !== null) {
    filterFields.push(m[1]);
  }
}
CHECKS.push({
  label: "Target Filter Fields",
  members: filterFields,
});

let totalDrift = 0;
const results = [];

for (const check of CHECKS) {
  const missing = check.members.filter((m) => !readmeContent.includes(m));
  if (missing.length > 0) {
    totalDrift += missing.length;
    results.push({ label: check.label, missing, total: check.members.length });
  }
}

if (totalDrift === 0) {
  console.log(
    "No drift detected — all effect-types.ts members are documented in README.md.",
  );
  process.exit(0);
} else {
  console.log(
    `=== Documentation Drift Report ===\n`,
  );
  console.log(
    `${totalDrift} type(s) in effect-types.ts are missing from schemas/README.md:\n`,
  );
  for (const r of results) {
    console.log(
      `${r.label} (${r.missing.length}/${r.total} missing):`,
    );
    for (const m of r.missing) {
      console.log(`  - ${m}`);
    }
    console.log("");
  }
  console.log("---");
  console.log(
    "Add missing types to workers/game/src/engine/schemas/README.md",
  );
  process.exit(1);
}
