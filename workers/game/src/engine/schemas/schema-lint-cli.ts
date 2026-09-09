import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getNestedActions,
  type Action,
  type EffectSchema,
} from "../effect-types.js";
import { SEARCH_PICK_DESTINATIONS } from "../effect-resolver/resume/deck.js";
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

function loadBracketedDonCardIds(): Set<string> {
  const cardIds = new Set<string>();
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
      if (/\[DON!! x\d+\]/.test(block)) {
        cardIds.add(cardId);
      }
    }
  }

  return cardIds;
}

function hasAttachedDonEncoding(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasAttachedDonEncoding);
  }
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  if (
    record.type === "DON_GIVEN" &&
    record.mode === "SPECIFIC_CARD"
  ) {
    return true;
  }
  if (
    typeof record.don_requirement === "number"
  ) {
    return true;
  }

  return Object.values(record).some(hasAttachedDonEncoding);
}

function findDonIntentViolations(
  schemas: Record<string, EffectSchema>,
): string[] {
  const bracketedDonCardIds = loadBracketedDonCardIds();
  const violations: string[] = [];

  for (const [cardId, schema] of Object.entries(schemas)) {
    if (!bracketedDonCardIds.has(cardId)) continue;

    if (!hasAttachedDonEncoding(schema)) {
      violations.push(
        `${cardId}: canonical [DON!! xN] requires DON_GIVEN/SPECIFIC_CARD or trigger.don_requirement`,
      );
    }
  }

  return violations;
}

function findStartOfGameEffectRuleCountViolations(
  modules: readonly SchemaSourceModule[],
): string[] {
  const violations: string[] = [];

  for (const sourceModule of modules) {
    const source = basename(sourceModule.path);
    for (const [cardId, schema] of Object.entries(sourceModule.schemas)) {
      const ruleCount = (schema.rule_modifications ?? []).filter(
        (rule) => rule.rule_type === "START_OF_GAME_EFFECT",
      ).length;
      if (ruleCount <= 1) continue;

      violations.push(
        `${source} ${cardId}: ${ruleCount} START_OF_GAME_EFFECT rules are unsupported; see workers/game/src/engine/pregame.ts limitation comment`,
      );
    }
  }

  return violations;
}

function findPickDestinationViolations(
  modules: readonly SchemaSourceModule[],
): string[] {
  const violations: string[] = [];

  for (const sourceModule of modules) {
    const source = basename(sourceModule.path);
    for (const [cardId, schema] of Object.entries(sourceModule.schemas)) {
      const actionGroups = schema.effects.map((block) => ({
        id: block.id,
        actions: [
          ...(block.actions ?? []),
          ...(block.replacement_actions ?? []),
          ...(block.rule?.rule_type === "START_OF_GAME_EFFECT"
            ? block.rule.actions
            : []),
        ],
      }));
      for (const [index, rule] of (schema.rule_modifications ?? []).entries()) {
        if (rule.rule_type === "START_OF_GAME_EFFECT") {
          actionGroups.push({
            id: `rule_modification[${index}]`,
            actions: rule.actions,
          });
        }
      }

      for (const group of actionGroups) {
        const pending: Action[] = [...group.actions];
        let actionIndex = 0;

        while (pending.length > 0) {
          const action = pending.shift();
          if (!action) continue;
          const currentIndex = actionIndex++;
          pending.unshift(...getNestedActions(action));

          const params = action.params as
            | Record<string, unknown>
            | undefined;
          const value = params?.pick_destination;
          if (value === undefined) continue;

          const normalized = typeof value === "string" ? value.toUpperCase() : "";
          if (
            SEARCH_PICK_DESTINATIONS.some(
              (destination) => destination === normalized,
            )
          ) {
            continue;
          }

          violations.push(
            `${source} ${cardId} ${group.id} action[${currentIndex}] pick_destination "${String(value)}" is not handled by moveSearchPicksToDestination; allowed: ${SEARCH_PICK_DESTINATIONS.join(", ")}`,
          );
        }
      }
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
    ...findStartOfGameEffectRuleCountViolations(modules),
    ...findPickDestinationViolations(modules),
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
