import type { EffectSchema } from "./effect-types.js";

export interface SchemaSourceModule {
  path: string;
  schemas: Record<string, EffectSchema>;
}
export function collectExportedSchemas(
  exports: Record<string, unknown>,
): Record<string, EffectSchema> {
  const schemas: Record<string, EffectSchema> = {};
  const visited = new Set<object>();

  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
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

export function validateSchemaSourceParity(
  modules: readonly SchemaSourceModule[],
  registry: Readonly<Record<string, EffectSchema>>,
): string[] {
  const diagnostics: string[] = [];
  const sourceByCardId = new Map<string, string>();

  for (const sourceModule of modules) {
    const cardIds = Object.keys(sourceModule.schemas);
    if (cardIds.length === 0) {
      diagnostics.push(
        `[schema-source] ${sourceModule.path} exports no EffectSchema objects`,
      );
      continue;
    }

    for (const cardId of cardIds) {
      const previousSource = sourceByCardId.get(cardId);
      if (previousSource && previousSource !== sourceModule.path) {
        diagnostics.push(
          `[schema-source] ${cardId} is exported by both ${previousSource} and ${sourceModule.path}`,
        );
      } else {
        sourceByCardId.set(cardId, sourceModule.path);
      }
      if (!registry[cardId]) {
        diagnostics.push(
          `[schema-source] ${sourceModule.path} exports ${cardId}, but schema-registry.ts does not register it`,
        );
      } else if (
        JSON.stringify(registry[cardId]) !==
        JSON.stringify(sourceModule.schemas[cardId])
      ) {
        diagnostics.push(
          `[schema-source] ${sourceModule.path} exports ${cardId}, but the generated registry payload differs`,
        );
      }
    }
  }

  for (const cardId of Object.keys(registry)) {
    if (!sourceByCardId.has(cardId)) {
      diagnostics.push(
        `[schema-source] schema-registry.ts registers ${cardId}, but no schema source file exports it`,
      );
    }
  }

  return diagnostics;
}
