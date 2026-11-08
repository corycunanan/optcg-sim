import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ALL_ACTION_TYPES,
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
  findHandTrashTriggerViolations,
  findSchemasWithMultipleTriggerBlocks,
  type CardTextManifest,
} from "../trigger-schema-coverage.js";
import { collectTargetInstructionCoverage } from "../effect-resolver/target-instruction.js";
import { findMillCostIntentViolations } from "../schema-cost-lint.js";
import { findLifeCostOrderIntentViolations } from "../schema-life-cost-lint.js";
import { findReplacementControllerIntentViolations } from "../schema-replacement-controller-lint.js";
import { findTriggerEventIntentViolations } from "../schema-trigger-event-lint.js";
import { findCounterEventCategoryIntentViolations } from "../schema-counter-event-lint.js";
import { findContextTargetIntentViolations } from "../schema-context-target-lint.js";
import { findDonGivenIntentViolations } from "../schema-don-given-lint.js";
import { findWholeHandTrashIntentViolations } from "../schema-hand-trash-amount-lint.js";
import { findDrawProhibitionIntentViolations } from "../schema-draw-prohibition-lint.js";
import { findThisWaySourceIntentViolations } from "../schema-this-way-source-lint.js";
import { findSearchAndPlayRevealIntentViolations } from "../schema-search-reveal-lint.js";
import { findConditionExcludeSelfIntentViolations } from "../schema-exclude-self-lint.js";

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

function findHandTrashIntentViolations(schemas: Record<string, EffectSchema>): string[] {
  const directory = resolve(repoRoot, "docs/cards");
  return readdirSync(directory).filter(file => file.endsWith(".md")).flatMap(file =>
    readFileSync(resolve(directory, file), "utf8").split(/\n---\n/).flatMap(block => {
      const cardId = block.match(/\*\*([A-Z]+\d*-\d+)\*\*/)?.[1];
      const schema = cardId ? schemas[cardId] : undefined;
      return schema ? findHandTrashTriggerViolations(block, schema) : [];
    }),
  );
}

function loadCanonicalCardBlocks(): { cardId: string; text: string }[] {
  const directory = resolve(repoRoot, "docs/cards");
  return readdirSync(directory).filter(file => file.endsWith(".md")).sort().flatMap(file =>
    readFileSync(resolve(directory, file), "utf8").split(/\n---\n/).flatMap(block => {
      const cardId = block.match(/\*\*([A-Z]+\d*-\d+)\*\*/)?.[1];
      return cardId ? [{ cardId, text: block }] : [];
    }),
  );
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

// OPT-802: an authored `params` key that no runtime code reads is dead
// encoding (cost_override, mandatory and life_controller were). The consumer
// scan reads engine runtime source with comments stripped and requires each
// authored key name to appear as a word in it. Type declarations, the schema
// validator, lint modules, tests and generated files do not count as readers.
// The match is per key name, not per action type, so it proves "something
// reads this name", which is the failure mode this rule exists for.
const PARAM_CONSUMER_ROOTS = ["workers/game/src", "shared"];
const NON_CONSUMER_SOURCE = [
  /(^|\/)__tests__\//,
  /(^|\/)schemas\//,
  /\.generated\./,
  /\.test\.ts$/,
  /(^|\/)effect-types\.ts$/,
  /(^|\/)schema-registry\.ts$/,
  /(^|\/)schema-[a-z-]*lint[a-z-]*\.ts$/,
];

function loadParamConsumerSource(): string {
  const chunks: string[] = [];
  const visit = (path: string): void => {
    for (const entry of readdirSync(path).sort()) {
      if (entry === "node_modules") continue;
      const child = join(path, entry);
      if (statSync(child).isDirectory()) {
        visit(child);
        continue;
      }
      const rel = relative(repoRoot, child);
      if (!rel.endsWith(".ts") || NON_CONSUMER_SOURCE.some((re) => re.test(rel))) continue;
      chunks.push(
        readFileSync(child, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:"'`])\/\/.*$/gm, "$1"),
      );
    }
  };
  for (const root of PARAM_CONSUMER_ROOTS) visit(resolve(repoRoot, root));
  return chunks.join("\n");
}

function findUnreadActionParamViolations(
  schemas: Record<string, EffectSchema>,
  consumerSource: string,
): string[] {
  const actionTypes = new Set<string>(ALL_ACTION_TYPES);
  const usages = new Map<string, Set<string>>();
  const visit = (value: unknown, cardId: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, cardId);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const params = record.params;
    if (
      typeof record.type === "string" &&
      actionTypes.has(record.type) &&
      params &&
      typeof params === "object" &&
      !Array.isArray(params)
    ) {
      for (const key of Object.keys(params)) {
        const usage = `${record.type}.params.${key}`;
        const cards = usages.get(usage) ?? new Set<string>();
        cards.add(cardId);
        usages.set(usage, cards);
      }
    }
    for (const child of Object.values(record)) visit(child, cardId);
  };
  for (const [cardId, schema] of Object.entries(schemas)) visit(schema, cardId);

  const readKeys = new Map<string, boolean>();
  const isRead = (key: string): boolean => {
    let read = readKeys.get(key);
    if (read === undefined) {
      read = new RegExp(`\\b${key}\\b`).test(consumerSource);
      readKeys.set(key, read);
    }
    return read;
  };

  return [...usages.entries()]
    .filter(([usage]) => !isRead(usage.slice(usage.lastIndexOf(".") + 1)))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([usage, cards]) => {
      const sample = [...cards].sort();
      return `${usage}: no engine code reads this param (${sample.length} card(s): ${sample.slice(0, 5).join(", ")}${sample.length > 5 ? ", ..." : ""}); implement it or remove it (OPT-802)`;
    });
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
  const targetInstructions = collectTargetInstructionCoverage(schemas);
  if (targetInstructions.fallbacks.length > 0) {
    console.log(
      `WARNING: ${targetInstructions.fallbacks.length} of ${targetInstructions.targetCount} target spec(s) fell back to effectDescription:`,
    );
    console.log(targetInstructions.fallbacks.join("\n"));
  } else {
    console.log(
      `Target instruction coverage complete — ${targetInstructions.targetCount} target spec(s), 0 fallbacks.`,
    );
  }
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
    ...findHandTrashIntentViolations(schemas),
    ...findMillCostIntentViolations(loadCanonicalCardBlocks(), schemas),
    ...findLifeCostOrderIntentViolations(schemas),
    ...findReplacementControllerIntentViolations(schemas),
    ...findTriggerEventIntentViolations(schemas),
    ...findCounterEventCategoryIntentViolations(schemas),
    ...findContextTargetIntentViolations(schemas),
    ...findDonGivenIntentViolations(loadCanonicalCardBlocks(), schemas),
    ...findDrawProhibitionIntentViolations(schemas),
    ...findThisWaySourceIntentViolations(schemas),
    ...findConditionExcludeSelfIntentViolations(schemas),
    ...findSearchAndPlayRevealIntentViolations(loadCanonicalCardBlocks(), schemas),
    // Full runs walk the generated registry; a single-file run checks only
    // that file's schemas and skips the missing-card disposition check.
    ...findWholeHandTrashIntentViolations(
      source ? schemas : registry,
      loadCanonicalCardBlocks(),
      undefined,
      { requireEveryDisposition: !source },
    ),
    ...findStartOfGameEffectRuleCountViolations(modules),
    ...findPickDestinationViolations(modules),
    ...findUnreadActionParamViolations(schemas, loadParamConsumerSource()),
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
