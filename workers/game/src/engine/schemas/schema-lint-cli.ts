import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  collectExportedSchemas,
  validateSchemaSourceParity,
  type SchemaSourceModule,
} from "../schema-source-parity.js";
import {
  getAllAuthoredSchemas,
  validateEffectSchema,
} from "../schema-registry.js";
import {
  findSchemaCardTypeCategoryViolations,
  findSchemasWithMultipleTriggerBlocks,
  type CardTextManifest,
} from "../trigger-schema-coverage.js";

const repoRoot = resolve(__dirname, "../../../../../");

const cardTextManifest = JSON.parse(
  readFileSync(
    resolve(__dirname, "../card-text-manifest.generated.json"),
    "utf8"
  )
) as CardTextManifest;

const donIntentDeferredToOpt600 = new Set([
  "OP03-004",
  "OP03-025",
  "OP15-001",
]);

function loadBracketedDonRequirements(): Map<string, Set<number>> {
  const requirements = new Map<string, Set<number>>();
  const cardsDirectory = resolve(repoRoot, "docs/cards");
  const files = readdirSync(cardsDirectory)
    .filter((file) => file.endsWith(".md"))
    .sort();

  for (const file of files) {
    const source = readFileSync(resolve(cardsDirectory, file), "utf8")
      .replace(/<br\s*\/?\s*>/gi, "\n");
    for (const block of source.split(/\n---\n/)) {
      const cardId = block.match(/\*\*([A-Z]+\d*-\d+)\*\*/)?.[1];
      if (!cardId) continue;
      const values = [
        ...block.matchAll(/\[DON!! x(\d+)\]/g),
      ].map((match) => Number(match[1]));
      if (values.length > 0) {
        requirements.set(cardId, new Set(values));
      }
    }
  }

  return requirements;
}

function containsDonFieldCount(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsDonFieldCount);
  }
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  if (record.type === "DON_FIELD_COUNT") return true;

  return Object.values(record).some(containsDonFieldCount);
}

function hasAttachedDonEncoding(
  value: unknown,
  requirements: Set<number>,
): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) =>
      hasAttachedDonEncoding(entry, requirements),
    );
  }
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  if (
    record.type === "DON_GIVEN" &&
    record.mode === "SPECIFIC_CARD" &&
    record.operator === ">=" &&
    typeof record.value === "number" &&
    requirements.has(record.value)
  ) {
    return true;
  }
  if (
    typeof record.don_requirement === "number" &&
    requirements.has(record.don_requirement)
  ) {
    return true;
  }

  return Object.values(record).some((entry) =>
    hasAttachedDonEncoding(entry, requirements),
  );
}

function findDonIntentViolations(
  schemas: Record<string, import("../effect-types.js").EffectSchema>,
): string[] {
  const requirementsByCard = loadBracketedDonRequirements();
  const violations: string[] = [];

  for (const [cardId, schema] of Object.entries(schemas)) {
    if (donIntentDeferredToOpt600.has(cardId)) continue;
    const requirements = requirementsByCard.get(cardId);
    if (!requirements) continue;

    if (
      containsDonFieldCount(schema) &&
      !hasAttachedDonEncoding(schema, requirements)
    ) {
      violations.push(
        `${cardId}: canonical [DON!! xN] requires DON_GIVEN/SPECIFIC_CARD or trigger.don_requirement at the printed threshold`,
      );
    }
  }

  return violations;
}

async function discoverSchemaSources(): Promise<SchemaSourceModule[]> {
  const directory = __dirname;
  const files = readdirSync(directory)
    .filter(
      (file) => file.endsWith(".ts") && file !== "schema-lint-cli.ts",
    )
    .sort();

  return Promise.all(
    files.map(async (file) => ({
      path: file,
      schemas: collectExportedSchemas(
        await import(pathToFileURL(resolve(directory, file)).href),
      ),
    })),
  );
}

async function main(): Promise<void> {
  const source = process.argv[2];
  const registry = getAllAuthoredSchemas();
  const modules = source
    ? [
        {
          path: source,
          schemas: collectExportedSchemas(
            await import(pathToFileURL(source).href),
          ),
        },
      ]
    : await discoverSchemaSources();
  const schemas = source
    ? modules[0].schemas
    : Object.assign({}, ...modules.map((module) => module.schemas));
  const categoryCheckedSchemas = source
    ? Object.fromEntries(
        Object.entries(schemas).filter(([cardId]) => cardTextManifest[cardId]),
      )
    : schemas;
  const diagnostics = [
    ...Object.entries(schemas).flatMap(([cardId, schema]) =>
      validateEffectSchema(schema, cardId),
    ),
    ...findSchemasWithMultipleTriggerBlocks(schemas).map(
      (cardId) =>
        `${cardId}: multiple TRIGGER blocks are unsupported; combine them into one block`,
    ),
    ...findSchemaCardTypeCategoryViolations(
      cardTextManifest,
      categoryCheckedSchemas,
    ),
    ...findDonIntentViolations(schemas),
    ...(source ? [] : validateSchemaSourceParity(modules, registry)),
  ];
  if (diagnostics.length > 0) {
    console.log(diagnostics.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(
    `Schema validation clean — ${Object.keys(schemas).length} card(s).`
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
