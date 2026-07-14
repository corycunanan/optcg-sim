#!/usr/bin/env node
/**
 * Documentation drift detector.
 *
 * The ActionType and TargetType catalogs are checked against their runtime
 * mirrors and must contain every supported value exactly once. The remaining
 * schema unions retain the broader "documented somewhere" check, and every
 * executable-test link in RULES-TO-ENGINE-MAP.md must resolve to a real file.
 *
 * Usage: node check-doc-drift.sh
 *
 * Exit code 0 = no drift, 1 = drift detected.
 */

const fs = require("node:fs");
const path = require("node:path");

const SCHEMAS_DIR = __dirname;
const REPO_ROOT = path.resolve(SCHEMAS_DIR, "../../../../../");
const TYPES_FILE = path.resolve(SCHEMAS_DIR, "../effect-types.ts");
const README_FILE = path.resolve(SCHEMAS_DIR, "README.md");
const RULES_MAP_FILE = path.resolve(
  REPO_ROOT,
  "docs/game-engine/RULES-TO-ENGINE-MAP.md",
);
const DEFERRED_FILE = path.resolve(
  REPO_ROOT,
  "docs/game-engine/DEFERRED-CARD-EFFECTS.md",
);

for (const file of [TYPES_FILE, README_FILE, RULES_MAP_FILE, DEFERRED_FILE]) {
  if (!fs.existsSync(file)) {
    console.error(`Error: required documentation source not found at ${file}`);
    process.exit(1);
  }
}

const typesContent = fs.readFileSync(TYPES_FILE, "utf8");
const readmeContent = fs.readFileSync(README_FILE, "utf8");
const rulesMapContent = fs.readFileSync(RULES_MAP_FILE, "utf8");
const deferredContent = fs.readFileSync(DEFERRED_FILE, "utf8");

/** Extract string members from a TypeScript union used by the broad checks. */
function extractUnionMembers(content, typeName) {
  const typeRegex = new RegExp(
    `export\\s+type\\s+${typeName}\\s*=([\\s\\S]*?)(?:;\\s*\\n|export\\s)`,
    "m",
  );
  const match = content.match(typeRegex);
  if (!match) return [];

  return [
    ...new Set(
      [...match[1].matchAll(/"\s*([A-Z][A-Z0-9_]+)\s*"/g)].map(
        (member) => member[1],
      ),
    ),
  ];
}

/**
 * Extract the runtime mirror of a union. These arrays are compile-time checked
 * against their TypeScript unions, so they are safer than scraping a type block
 * that may contain comments or semicolons.
 */
function extractRuntimeMembers(content, constantName) {
  const arrayRegex = new RegExp(
    `export\\s+const\\s+${constantName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`,
    "m",
  );
  const match = content.match(arrayRegex);
  if (!match) return [];

  return [
    ...new Set(
      [...match[1].matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map(
        (member) => member[1],
      ),
    ),
  ];
}

/** Extract the first-column enum values from one bounded README section. */
function extractCatalogRows(content, startHeading, endHeading) {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  if (start === -1 || end === -1) return [];

  return [...content.slice(start, end).matchAll(/^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|/gm)]
    .map((row) => row[1]);
}

function compareExactCatalog(label, supported, documented) {
  const missing = supported.filter((member) => !documented.includes(member));
  const unexpected = [...new Set(documented.filter((member) => !supported.includes(member)))];
  const duplicates = [...new Set(
    documented.filter((member, index) => documented.indexOf(member) !== index),
  )];

  return { label, missing, unexpected, duplicates, total: supported.length };
}

const exactCatalogs = [
  compareExactCatalog(
    "Action Types",
    extractRuntimeMembers(typesContent, "ALL_ACTION_TYPES"),
    extractCatalogRows(
      readmeContent,
      "## Complete Action Catalog",
      "### Chain Connectors",
    ),
  ),
  compareExactCatalog(
    "Target Types",
    extractRuntimeMembers(typesContent, "ALL_TARGET_TYPES"),
    extractCatalogRows(readmeContent, "### Target Types", "### Count Modes"),
  ),
];

const inclusionChecks = [
  ["Cost Types", "CostType"],
  ["Keyword Trigger Types", "KeywordTriggerType"],
  ["Custom Event Types", "CustomEventType"],
  ["Prohibition Types", "ProhibitionType"],
  ["Keywords", "Keyword"],
  ["Replacement Events", "ReplacementEvent"],
].map(([label, typeName]) => ({
  label,
  members: extractUnionMembers(typesContent, typeName),
}));

const filterMatch = typesContent.match(
  /export\s+interface\s+TargetFilter\s*\{([\s\S]*?)\n\}/m,
);
const filterFields = filterMatch
  ? [...filterMatch[1].matchAll(/^\s+(\w+)\??:/gm)].map((field) => field[1])
  : [];
inclusionChecks.push({ label: "Target Filter Fields", members: filterFields });

const inclusionDrift = inclusionChecks
  .map((check) => ({
    ...check,
    missing: check.members.filter((member) => !readmeContent.includes(member)),
  }))
  .filter((check) => check.missing.length > 0);

const executableTestLinks = [
  ...new Set(
    [...rulesMapContent.matchAll(/\]\(([^)]+\.test\.ts)\)/g)].map(
      (link) => link[1],
    ),
  ),
];
const brokenTestLinks = executableTestLinks.filter((link) => {
  if (/^[a-z]+:/i.test(link)) return false;
  return !fs.existsSync(path.resolve(path.dirname(RULES_MAP_FILE), link));
});

const historicalDeferredCards = [
  ...deferredContent.matchAll(/^### ~~([A-Z0-9]+-\d+[A-Za-z]?)\b.*~~ — ENCODED$/gm),
].map((entry) => entry[1]);
const openDeferredCards = [
  ...deferredContent.matchAll(/^### (?!~~)([A-Z0-9]+-\d+[A-Za-z]?)\b/gm),
].map((entry) => entry[1]);
const reportedHistoricalCount = Number(
  deferredContent.match(
    /^\| Historical card entries in this document \| (\d+) cards \|/m,
  )?.[1] ?? Number.NaN,
);
const reportedOpenCount = Number(
  deferredContent.match(/Remaining deferred cards: (\d+)/)?.[1] ?? Number.NaN,
);
const deferredDrift = [];
if (reportedHistoricalCount !== historicalDeferredCards.length) {
  deferredDrift.push(
    `Historical card total reports ${reportedHistoricalCount}, but ${historicalDeferredCards.length} encoded card entries exist.`,
  );
}
if (reportedOpenCount !== openDeferredCards.length) {
  deferredDrift.push(
    `Remaining deferred total reports ${reportedOpenCount}, but ${openDeferredCards.length} open card entries exist.`,
  );
}
if (executableTestLinks.length === 0) {
  deferredDrift.push(
    "RULES-TO-ENGINE-MAP.md contains no executable-test links.",
  );
}

const exactDrift = exactCatalogs.filter(
  (check) =>
    check.missing.length > 0 ||
    check.unexpected.length > 0 ||
    check.duplicates.length > 0,
);

if (
  exactDrift.length === 0 &&
  inclusionDrift.length === 0 &&
  brokenTestLinks.length === 0 &&
  deferredDrift.length === 0
) {
  const actionCount = exactCatalogs.find((check) => check.label === "Action Types").total;
  const targetCount = exactCatalogs.find((check) => check.label === "Target Types").total;
  console.log(
    `No documentation drift detected — ${actionCount} action types and ${targetCount} target types are cataloged exactly once, ${historicalDeferredCards.length} historical card dispositions and ${openDeferredCards.length} open deferrals reconcile, remaining schema members are documented, and ${executableTestLinks.length} rules-map test links resolve.`,
  );
  process.exit(0);
}

console.error("=== Documentation Drift Report ===\n");
for (const check of exactDrift) {
  console.error(`${check.label} (runtime total: ${check.total})`);
  if (check.missing.length > 0) console.error(`  Missing: ${check.missing.join(", ")}`);
  if (check.unexpected.length > 0) {
    console.error(`  Unexpected: ${check.unexpected.join(", ")}`);
  }
  if (check.duplicates.length > 0) {
    console.error(`  Duplicated: ${check.duplicates.join(", ")}`);
  }
  console.error("");
}
for (const check of inclusionDrift) {
  console.error(`${check.label} missing from schemas/README.md:`);
  for (const member of check.missing) console.error(`  - ${member}`);
  console.error("");
}
if (brokenTestLinks.length > 0) {
  console.error("Broken executable-test links in RULES-TO-ENGINE-MAP.md:");
  for (const link of brokenTestLinks) console.error(`  - ${link}`);
  console.error("");
}
if (deferredDrift.length > 0) {
  console.error("Deferred inventory / evidence drift:");
  for (const message of deferredDrift) console.error(`  - ${message}`);
  console.error("");
}

process.exit(1);
