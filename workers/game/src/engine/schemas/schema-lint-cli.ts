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

const cardTextManifest = JSON.parse(
  readFileSync(
    resolve(__dirname, "../card-text-manifest.generated.json"),
    "utf8"
  )
) as CardTextManifest;

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
