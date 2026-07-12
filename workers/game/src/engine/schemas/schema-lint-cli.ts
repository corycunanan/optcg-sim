import { pathToFileURL } from "node:url";
import type { EffectSchema } from "../effect-types.js";
import {
  getAllAuthoredSchemas,
  validateEffectSchema,
} from "../schema-registry.js";

function collectSchemas(
  exports: Record<string, unknown>
): Record<string, EffectSchema> {
  const schemas: Record<string, EffectSchema> = {};
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (
      "card_id" in value &&
      typeof value.card_id === "string" &&
      "effects" in value &&
      Array.isArray(value.effects)
    ) {
      schemas[value.card_id] = value as EffectSchema;
      return;
    }
    for (const nested of Object.values(value)) visit(nested);
  };
  for (const value of Object.values(exports)) visit(value);
  return schemas;
}

async function main(): Promise<void> {
  const source = process.argv[2];
  const schemas = source
    ? collectSchemas(await import(pathToFileURL(source).href))
    : getAllAuthoredSchemas();
  const diagnostics = Object.entries(schemas).flatMap(([cardId, schema]) =>
    validateEffectSchema(schema, cardId)
  );
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
