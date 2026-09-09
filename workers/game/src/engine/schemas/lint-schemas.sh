#!/usr/bin/env node

/**
 * Compatibility entry point for schema validation.
 *
 * The runtime validator imports compiled TypeScript schema objects via tsx.
 * This entry point also runs source guards that need file and line diagnostics.
 */

const { spawnSync } = require("node:child_process");
const { readFileSync, readdirSync } = require("node:fs");
const { basename, relative, resolve } = require("node:path");

const repoRoot = resolve(__dirname, "../../../../../");
const cli = resolve(__dirname, "schema-lint-cli.ts");
const deckResume = resolve(__dirname, "../effect-resolver/resume/deck.ts");
const allowedPickDestinations = ["HAND", "LIFE", "LIFE_TOP", "TRASH"];

function findUnhandledPickDestinations(sourcePath) {
  const source = readFileSync(sourcePath, "utf8");
  const violations = [];
  const destinationPattern = /\bpick_destination\s*:\s*(["'])([^"']+)\1/g;
  let match;

  while ((match = destinationPattern.exec(source)) !== null) {
    const value = match[2].toUpperCase();
    if (allowedPickDestinations.includes(value)) continue;

    const precedingSource = source.slice(0, match.index);
    const cardIds = [...precedingSource.matchAll(/\bcard_id\s*:\s*(["'])([^"']+)\1/g)];
    const cardId = cardIds.at(-1)?.[2] ?? "UNKNOWN";
    const line = precedingSource.split("\n").length;
    const relativePath = relative(repoRoot, sourcePath);
    const file = relativePath.startsWith("..") ? basename(sourcePath) : relativePath;
    violations.push(
      `${file}:${line}: ${cardId}: pick_destination "${match[2]}" is not handled by resume/deck.ts; allowed values: ${allowedPickDestinations.join(", ")}`,
    );
  }

  return violations;
}

const resumeSource = readFileSync(deckResume, "utf8");
const missingResumeDestinations = allowedPickDestinations.filter(
  (destination) => !resumeSource.includes(`"${destination}"`),
);
if (missingResumeDestinations.length > 0) {
  throw new Error(
    `lint-schemas.sh destination list drifted from resume/deck.ts: ${missingResumeDestinations.join(", ")}`,
  );
}

const requestedSource = process.argv[2];
const sourcePaths = requestedSource
  ? [resolve(requestedSource)]
  : readdirSync(__dirname)
      .filter((file) => file.endsWith(".ts") && file !== "schema-lint-cli.ts")
      .map((file) => resolve(__dirname, file));
const pickDestinationViolations = sourcePaths.flatMap(
  findUnhandledPickDestinations,
);
if (pickDestinationViolations.length > 0) {
  console.log(pickDestinationViolations.join("\n"));
  process.exit(1);
}

const args = ["--import", "tsx", cli, ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, {
  cwd: repoRoot,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
