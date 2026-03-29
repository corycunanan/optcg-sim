#!/usr/bin/env node
/**
 * Semantic Schema Linter
 * Catches encoding errors that TypeScript and validateEffectSchema() cannot.
 *
 * Usage:
 *   node lint-schemas.sh                          # lint all schema files
 *   node lint-schemas.sh schemas/op03/red.ts      # lint one file
 *
 * Exit code 0 = clean, 1 = errors found.
 */

const fs = require("fs");
const path = require("path");

const SCHEMAS_DIR = __dirname;
const TYPES_FILE = path.resolve(SCHEMAS_DIR, "../effect-types.ts");

// ─── Enum Extraction ─────────────────────────────────────────────────────────

const typesContent = fs.readFileSync(TYPES_FILE, "utf8");

function extractUnionMembers(content, typeName) {
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

function extractConditionTypes(content) {
  // Find all condition interfaces with a `type: "LITERAL"` discriminant
  const types = [];
  // Match condition-related interfaces that have type: "X" patterns
  const regex =
    /export\s+interface\s+\w+Condition\w*\s*\{[^}]*?type:\s*"([A-Z][A-Z0-9_]+)"/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    types.push(m[1]);
  }
  return [...new Set(types)];
}

function extractDurationTypes(content) {
  const typeRegex =
    /export\s+type\s+Duration\s*=([\\s\S]*?)(?:;|export\s)/m;
  const match = content.match(typeRegex);
  if (!match) {
    // Fallback: find all { type: "X" } patterns in the Duration block
    const altRegex =
      /export\s+type\s+Duration\s*=([\s\S]*?)(?:;\s*\n|export\s)/m;
    const altMatch = content.match(altRegex);
    if (!altMatch) return [];
    const block = altMatch[1];
    const types = [];
    const litRegex = /type:\s*"([A-Z][A-Z0-9_]+)"/g;
    let m;
    while ((m = litRegex.exec(block)) !== null) {
      types.push(m[1]);
    }
    return [...new Set(types)];
  }
  const block = match[1];
  const types = [];
  const litRegex = /type:\s*"([A-Z][A-Z0-9_]+)"/g;
  let m;
  while ((m = litRegex.exec(block)) !== null) {
    types.push(m[1]);
  }
  return [...new Set(types)];
}

const ENUMS = {
  KeywordTriggerType: new Set(
    extractUnionMembers(typesContent, "KeywordTriggerType"),
  ),
  CustomEventType: new Set(
    extractUnionMembers(typesContent, "CustomEventType"),
  ),
  CostType: new Set(extractUnionMembers(typesContent, "CostType")),
  ConditionType: new Set(extractConditionTypes(typesContent)),
  DurationType: new Set(extractDurationTypes(typesContent)),
  TargetType: new Set(extractUnionMembers(typesContent, "TargetType")),
  Keyword: new Set(extractUnionMembers(typesContent, "Keyword")),
  ProhibitionType: new Set(
    extractUnionMembers(typesContent, "ProhibitionType"),
  ),
};

// ─── Schema Loading ──────────────────────────────────────────────────────────

function loadSchemasFromFile(filePath) {
  let code = fs.readFileSync(filePath, "utf8");

  // Remove import lines
  code = code.replace(/^import\b.*$/gm, "");

  // Strip TypeScript type annotations from const declarations
  // export const FOO: SomeType = { → var FOO = exports.FOO = {
  // Using var so the name stays in scope for later references (e.g. _SCHEMAS registries)
  code = code.replace(
    /export\s+const\s+(\w+)\s*:\s*[^=]+=\s*/g,
    "var $1 = exports.$1 = ",
  );

  // Strip `as Type` assertions (e.g. `as never`, `as const`)
  code = code.replace(/\bas\s+\w+/g, "");

  // Strip TypeScript non-null assertions (e.g. `foo.card_id!`)
  code = code.replace(/(\w)!/g, "$1");

  const exports = {};
  try {
    const fn = new Function("exports", code);
    fn(exports);
  } catch (e) {
    console.error(`Failed to load ${filePath}: ${e.message}`);
    return [];
  }

  // Collect unique schemas by card_id
  const byCardId = new Map();
  for (const value of Object.values(exports)) {
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && item.card_id && item.effects) {
          byCardId.set(item.card_id, item);
        }
      }
    } else if (value.card_id && value.effects) {
      byCardId.set(value.card_id, value);
    } else {
      // Record<string, EffectSchema>
      for (const v of Object.values(value)) {
        if (v && typeof v === "object" && v.card_id && v.effects) {
          byCardId.set(v.card_id, v);
        }
      }
    }
  }
  return [...byCardId.values()];
}

function discoverSchemaFiles() {
  const files = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name));
      } else if (
        entry.name.endsWith(".ts") &&
        entry.name !== "index.ts" &&
        !entry.name.endsWith(".sh")
      ) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  scan(SCHEMAS_DIR);
  return files;
}

// ─── Traversal Helpers ───────────────────────────────────────────────────────

/** Yields all actions in a block, including nested choice/opponent/schedule branches. */
function* walkActions(actions) {
  if (!actions) return;
  for (const action of actions) {
    yield action;
    // Recurse into nested action containers
    if (action.params) {
      if (Array.isArray(action.params.options)) {
        for (const branch of action.params.options) {
          if (Array.isArray(branch.actions)) {
            yield* walkActions(branch.actions);
          }
        }
      }
      if (Array.isArray(action.params.actions)) {
        yield* walkActions(action.params.actions);
      }
    }
  }
}

/** Yields all triggers from a block (handles compound triggers). */
function* walkTriggers(trigger) {
  if (!trigger) return;
  if (trigger.any_of) {
    for (const t of trigger.any_of) {
      yield* walkTriggers(t);
    }
  } else {
    yield trigger;
  }
}

/** Yields all conditions recursively. */
function* walkConditions(cond) {
  if (!cond) return;
  yield cond;
  if (cond.all_of) for (const c of cond.all_of) yield* walkConditions(c);
  if (cond.any_of) for (const c of cond.any_of) yield* walkConditions(c);
  if (cond.not) yield* walkConditions(cond.not);
}

/** Yields all targets from actions. */
function* walkTargets(actions) {
  for (const action of walkActions(actions)) {
    if (action.target) yield { target: action.target, action };
  }
}

/** Yields all filters found in targets. */
function* walkFilters(actions) {
  for (const { target, action } of walkTargets(actions)) {
    if (target.filter) yield { filter: target.filter, target, action };
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const INSTANTANEOUS_ACTIONS = new Set([
  "DRAW",
  "KO",
  "TRASH_CARD",
  "MILL",
  "RETURN_TO_HAND",
  "RETURN_TO_DECK",
  "PLAY_CARD",
  "TRASH_FROM_HAND",
  "SEARCH_DECK",
  "FULL_DECK_SEARCH",
  "PLAY_SELF",
]);

const DURATION_REQUIRED_ACTIONS = new Set([
  "MODIFY_POWER",
  "MODIFY_COST",
  "GRANT_KEYWORD",
  "APPLY_PROHIBITION",
]);

const BATTLE_TRIGGERS = new Set([
  "WHEN_ATTACKING",
  "ON_OPPONENT_ATTACK",
  "ON_BLOCK",
  "COUNTER",
  "COUNTER_EVENT",
]);

// TRAITS_CONTAINS_HINTS removed — C1 rule retired.
// traits vs traits_contains depends on card text wording which the linter cannot access.

// ─── Rules ───────────────────────────────────────────────────────────────────

function lintSchema(schema) {
  const issues = [];
  const cardId = schema.card_id || "UNKNOWN";
  const cardType = schema.card_type; // may be undefined

  for (const block of schema.effects) {
    const ctx = { cardId, blockId: block.id, cardType };

    // Category F: Enum Validation
    lintEnums(block, ctx, issues);

    // Category A: Cross-Field Consistency
    lintCrossField(block, ctx, issues);

    // Category B: Duration Correctness
    lintDurations(block, ctx, issues);

    // Category D: Trigger/Action Mismatches
    lintTriggerAction(block, ctx, issues);

    // Category C: Filter Semantics
    lintFilters(block, ctx, issues);

    // Category E: Cost vs Action Confusion
    lintCostAction(block, ctx, issues);
  }

  return issues;
}

// ─── Category F: Enum Validation ─────────────────────────────────────────────

function lintEnums(block, ctx, issues) {
  const { cardId, blockId } = ctx;

  // F1: Trigger keyword values
  for (const trigger of walkTriggers(block.trigger)) {
    if (trigger.keyword && !ENUMS.KeywordTriggerType.has(trigger.keyword)) {
      issues.push(
        err(
          cardId,
          blockId,
          "F1",
          `Invalid trigger keyword: "${trigger.keyword}"`,
        ),
      );
    }
    // F2: Custom event values
    if (trigger.event && !ENUMS.CustomEventType.has(trigger.event)) {
      issues.push(
        err(
          cardId,
          blockId,
          "F2",
          `Invalid trigger event: "${trigger.event}"`,
        ),
      );
    }
  }

  // F3: Cost type values
  if (block.costs) {
    for (const cost of block.costs) {
      if (cost.type && !ENUMS.CostType.has(cost.type)) {
        issues.push(
          err(cardId, blockId, "F3", `Invalid cost type: "${cost.type}"`),
        );
      }
    }
  }

  // F4: Condition type values
  for (const cond of walkConditions(block.conditions)) {
    if (
      cond.type &&
      typeof cond.type === "string" &&
      /^[A-Z]/.test(cond.type) &&
      !ENUMS.ConditionType.has(cond.type)
    ) {
      issues.push(
        err(
          cardId,
          blockId,
          "F4",
          `Invalid condition type: "${cond.type}"`,
        ),
      );
    }
  }

  // Also check conditions on individual actions
  for (const action of walkActions(block.actions)) {
    for (const cond of walkConditions(action.conditions)) {
      if (
        cond.type &&
        typeof cond.type === "string" &&
        /^[A-Z]/.test(cond.type) &&
        !ENUMS.ConditionType.has(cond.type)
      ) {
        issues.push(
          err(
            cardId,
            blockId,
            "F4",
            `Invalid condition type: "${cond.type}" (on action ${action.type})`,
          ),
        );
      }
    }
  }

  // F5: Duration type values
  if (block.duration && block.duration.type) {
    if (!ENUMS.DurationType.has(block.duration.type)) {
      issues.push(
        err(
          cardId,
          blockId,
          "F5",
          `Invalid duration type: "${block.duration.type}"`,
        ),
      );
    }
  }
  for (const action of walkActions(block.actions)) {
    if (action.duration && action.duration.type) {
      if (!ENUMS.DurationType.has(action.duration.type)) {
        issues.push(
          err(
            cardId,
            blockId,
            "F5",
            `Invalid duration type: "${action.duration.type}" (on action ${action.type})`,
          ),
        );
      }
    }
  }

  // F6: Target type values
  for (const { target, action } of walkTargets(block.actions)) {
    if (target.type && !ENUMS.TargetType.has(target.type)) {
      issues.push(
        err(
          cardId,
          blockId,
          "F6",
          `Invalid target type: "${target.type}" (on action ${action.type})`,
        ),
      );
    }
  }

  // F7: flags.keywords values
  if (block.flags && block.flags.keywords) {
    for (const kw of block.flags.keywords) {
      if (!ENUMS.Keyword.has(kw)) {
        issues.push(
          err(cardId, blockId, "F7", `Invalid keyword: "${kw}"`),
        );
      }
    }
  }

  // F8: Prohibition type values
  if (block.prohibitions) {
    for (const p of block.prohibitions) {
      if (p.type && !ENUMS.ProhibitionType.has(p.type)) {
        issues.push(
          err(
            cardId,
            blockId,
            "F8",
            `Invalid prohibition type: "${p.type}"`,
          ),
        );
      }
    }
  }
  // Also check APPLY_PROHIBITION actions
  for (const action of walkActions(block.actions)) {
    if (
      action.type === "APPLY_PROHIBITION" &&
      action.params &&
      action.params.prohibition_type
    ) {
      if (!ENUMS.ProhibitionType.has(action.params.prohibition_type)) {
        issues.push(
          err(
            cardId,
            blockId,
            "F8",
            `Invalid prohibition type: "${action.params.prohibition_type}" (in APPLY_PROHIBITION action)`,
          ),
        );
      }
    }
  }
}

// ─── Category A: Cross-Field Consistency ─────────────────────────────────────

function lintCrossField(block, ctx, issues) {
  const { cardId, blockId } = ctx;
  const cat = block.category;

  // A1: replacement blocks must not have trigger or actions
  if (cat === "replacement") {
    if (block.trigger) {
      issues.push(
        err(
          cardId,
          blockId,
          "A1",
          "Replacement block has trigger (use replaces instead)",
        ),
      );
    }
    if (block.actions && block.actions.length > 0) {
      issues.push(
        err(
          cardId,
          blockId,
          "A1",
          "Replacement block has actions (use replacement_actions instead)",
        ),
      );
    }
  }

  // A2: rule_modification blocks must not have trigger, actions, modifiers, prohibitions
  if (cat === "rule_modification") {
    if (block.trigger) {
      issues.push(
        err(cardId, blockId, "A2", "Rule modification block has trigger"),
      );
    }
    if (block.actions && block.actions.length > 0) {
      issues.push(
        err(cardId, blockId, "A2", "Rule modification block has actions"),
      );
    }
    if (block.modifiers && block.modifiers.length > 0) {
      issues.push(
        err(cardId, blockId, "A2", "Rule modification block has modifiers"),
      );
    }
    if (block.prohibitions && block.prohibitions.length > 0) {
      issues.push(
        err(
          cardId,
          blockId,
          "A2",
          "Rule modification block has prohibitions",
        ),
      );
    }
  }

  // A3: permanent blocks must not have actions (triggered effects belong in auto).
  // Permanent blocks MAY have a trigger as a scope condition (e.g., "while attacking",
  // "on your turn") when paired with modifiers — this is the standard aura pattern.
  // But permanent + trigger + actions (no modifiers) is likely miscategorized.
  if (cat === "permanent") {
    if (block.actions && block.actions.length > 0) {
      issues.push(
        err(
          cardId,
          blockId,
          "A3",
          "Permanent block has actions (triggered effects belong in auto)",
        ),
      );
    }
    if (block.trigger && !(block.modifiers && block.modifiers.length > 0) && !(block.prohibitions && block.prohibitions.length > 0)) {
      issues.push(
        err(
          cardId,
          blockId,
          "A3",
          "Permanent block has trigger but no modifiers/prohibitions (should this be auto?)",
        ),
      );
    }
  }

  // A4: auto/activate blocks must not have modifiers or prohibitions
  if (cat === "auto" || cat === "activate") {
    if (block.modifiers && block.modifiers.length > 0) {
      issues.push(
        err(
          cardId,
          blockId,
          "A4",
          `${cat} block has modifiers (should be in a separate permanent block)`,
        ),
      );
    }
    if (block.prohibitions && block.prohibitions.length > 0) {
      issues.push(
        err(
          cardId,
          blockId,
          "A4",
          `${cat} block has prohibitions (should be in a separate permanent block)`,
        ),
      );
    }
  }

  // A5: First action in a chain must not have chain field
  if (block.actions && block.actions.length > 0) {
    if (block.actions[0].chain) {
      issues.push(
        err(
          cardId,
          blockId,
          "A5",
          `First action has chain: "${block.actions[0].chain}" (only subsequent actions should have chain)`,
        ),
      );
    }
  }

  // A6: result_ref must be referenced somewhere (target_ref, filter *_ref, ACTION_RESULT ref, nested action)
  if (block.actions && block.actions.length > 0) {
    const allActions = [...walkActions(block.actions)];
    const resultRefs = new Set();
    const consumedRefs = new Set();
    for (const action of allActions) {
      if (action.result_ref) resultRefs.add(action.result_ref);
      // Deep-scan the entire action object for consumed refs:
      // target_ref fields, filter *_ref fields, ACTION_RESULT refs
      (function scanConsumed(obj, depth) {
        if (!obj || typeof obj !== "object" || depth > 10) return;
        for (const [key, val] of Object.entries(obj)) {
          if (key === "result_ref") continue; // result_ref is a producer, not consumer
          if (key === "target_ref" && typeof val === "string") consumedRefs.add(val);
          if (key.endsWith("_ref") && typeof val === "string" && key !== "result_ref") consumedRefs.add(val);
          if (typeof val === "object" && val !== null) {
            if (val.type === "ACTION_RESULT" && val.ref) consumedRefs.add(val.ref);
            scanConsumed(val, depth + 1);
          }
        }
      })(action, 0);
    }
    for (const ref of resultRefs) {
      if (!consumedRefs.has(ref)) {
        issues.push(
          err(
            cardId,
            blockId,
            "A6",
            `result_ref "${ref}" is never consumed by a target_ref, filter ref, or ACTION_RESULT`,
          ),
        );
      }
    }
    for (const ref of consumedRefs) {
      if (!resultRefs.has(ref)) {
        issues.push(
          err(
            cardId,
            blockId,
            "A6",
            `target_ref "${ref}" has no matching result_ref`,
          ),
        );
      }
    }
  }

  // A7: PLAYER_CHOICE/OPPONENT_CHOICE must have 2+ branches
  for (const action of walkActions(block.actions)) {
    if (
      (action.type === "PLAYER_CHOICE" || action.type === "OPPONENT_CHOICE") &&
      action.params &&
      Array.isArray(action.params.options)
    ) {
      if (action.params.options.length < 2) {
        issues.push(
          err(
            cardId,
            blockId,
            "A7",
            `${action.type} has ${action.params.options.length} branch(es) — need at least 2`,
          ),
        );
      }
    }
  }
}

// ─── Category B: Duration Correctness ────────────────────────────────────────

function lintDurations(block, ctx, issues) {
  const { cardId, blockId } = ctx;
  const cat = block.category;

  // Collect trigger keywords for B3 checking
  const triggerKeywords = new Set();
  for (const trigger of walkTriggers(block.trigger)) {
    if (trigger.keyword) triggerKeywords.add(trigger.keyword);
  }
  const isBattleScoped = [...triggerKeywords].some((k) =>
    BATTLE_TRIGGERS.has(k),
  );

  for (const action of walkActions(block.actions)) {
    // B1: Instantaneous actions must not have duration
    if (INSTANTANEOUS_ACTIONS.has(action.type) && action.duration) {
      issues.push(
        err(
          cardId,
          blockId,
          "B1",
          `${action.type} is instantaneous but has duration: ${action.duration.type}`,
        ),
      );
    }

    // B2: Duration-required actions should have duration in auto/activate blocks
    if (
      DURATION_REQUIRED_ACTIONS.has(action.type) &&
      (cat === "auto" || cat === "activate") &&
      !action.duration
    ) {
      issues.push(
        warn(
          cardId,
          blockId,
          "B2",
          `${action.type} in ${cat} block missing duration (defaults to permanent — rarely intended)`,
        ),
      );
    }

    // B3: THIS_BATTLE duration only valid in battle-scoped triggers
    if (
      action.duration &&
      action.duration.type === "THIS_BATTLE" &&
      !isBattleScoped
    ) {
      issues.push(
        err(
          cardId,
          blockId,
          "B3",
          `THIS_BATTLE duration on ${action.type} but trigger is not battle-scoped (${[...triggerKeywords].join(", ") || "none"})`,
        ),
      );
    }
  }
}

// ─── Category C: Filter Semantics ────────────────────────────────────────────

function lintFilters(block, ctx, issues) {
  const { cardId, blockId } = ctx;

  for (const { filter, target, action } of walkFilters(block.actions)) {
    // C1: removed — traits vs traits_contains depends on card text wording
    // ("{X} type" = traits exact match, "type including X" = traits_contains substring match)
    // The linter cannot determine the correct choice without access to card text.

    // C2: base_cost_* and cost_* both set
    const hasCostFilter =
      filter.cost_exact != null ||
      filter.cost_min != null ||
      filter.cost_max != null;
    const hasBaseCostFilter =
      filter.base_cost_exact != null ||
      filter.base_cost_min != null ||
      filter.base_cost_max != null;
    if (hasCostFilter && hasBaseCostFilter) {
      issues.push(
        warn(
          cardId,
          blockId,
          "C2",
          `Filter has both base_cost and cost filters on ${action.type}`,
        ),
      );
    }

    // C3: base_power_* and power_* both set
    const hasPowerFilter =
      filter.power_exact != null ||
      filter.power_min != null ||
      filter.power_max != null;
    const hasBasePowerFilter =
      filter.base_power_exact != null ||
      filter.base_power_min != null ||
      filter.base_power_max != null;
    if (hasPowerFilter && hasBasePowerFilter) {
      issues.push(
        warn(
          cardId,
          blockId,
          "C3",
          `Filter has both base_power and power filters on ${action.type}`,
        ),
      );
    }

    // C4: exclude_self on non-SELF/EITHER targets
    if (
      filter.exclude_self &&
      target.type !== "CHARACTER" &&
      target.type !== "LEADER_OR_CHARACTER"
    ) {
      issues.push(
        warn(
          cardId,
          blockId,
          "C4",
          `exclude_self on target type "${target.type}" (only meaningful on CHARACTER/LEADER_OR_CHARACTER)`,
        ),
      );
    } else if (
      filter.exclude_self &&
      target.controller === "OPPONENT"
    ) {
      issues.push(
        warn(
          cardId,
          blockId,
          "C4",
          `exclude_self on opponent-only target (controller: "OPPONENT") — meaningless`,
        ),
      );
    }
  }

  // C1 cost filter check removed — same reasoning as above (depends on card text wording)
}

// ─── Category D: Trigger/Action Mismatches ───────────────────────────────────

function lintTriggerAction(block, ctx, issues) {
  const { cardId, blockId, cardType } = ctx;

  // D1-D3 need card type
  if (cardType) {
    for (const trigger of walkTriggers(block.trigger)) {
      if (!trigger.keyword) continue;

      // D1: ACTIVATE_MAIN on Event cards
      if (trigger.keyword === "ACTIVATE_MAIN" && cardType === "Event") {
        issues.push(
          warn(
            cardId,
            blockId,
            "D1",
            `ACTIVATE_MAIN trigger on Event card (should be MAIN_EVENT)`,
          ),
        );
      }

      // D2: MAIN_EVENT on non-Event cards
      if (trigger.keyword === "MAIN_EVENT" && cardType !== "Event") {
        issues.push(
          warn(
            cardId,
            blockId,
            "D2",
            `MAIN_EVENT trigger on ${cardType} card (should be ACTIVATE_MAIN)`,
          ),
        );
      }

      // D3: COUNTER_EVENT on non-Event cards
      if (trigger.keyword === "COUNTER_EVENT" && cardType !== "Event") {
        issues.push(
          warn(
            cardId,
            blockId,
            "D3",
            `COUNTER_EVENT trigger on ${cardType} card (should be COUNTER)`,
          ),
        );
      }
    }
  }

  // D4: SET_REST targeting opponent without controller: "OPPONENT"
  for (const action of walkActions(block.actions)) {
    if (action.type === "SET_REST" && action.target) {
      const t = action.target;
      if (
        (t.type === "CHARACTER" || t.type === "LEADER_OR_CHARACTER") &&
        t.controller !== "OPPONENT" &&
        t.controller !== "EITHER"
      ) {
        // Only warn if there's no filter suggesting it targets opponent
        // (could be resting own character as a cost-like pattern)
      }
    }

    // D5: KO without target
    if (action.type === "KO" && !action.target && !action.target_ref) {
      issues.push(
        warn(cardId, blockId, "D5", "KO action without target or target_ref"),
      );
    }
  }
}

// ─── Category E: Cost vs Action Confusion ────────────────────────────────────

function lintCostAction(block, ctx, issues) {
  const { cardId, blockId } = ctx;
  const cat = block.category;

  if (!block.actions || block.actions.length === 0) return;

  // E1: TRASH_FROM_HAND as first action before IF_DO chain
  if (
    block.actions[0].type === "TRASH_FROM_HAND" &&
    block.actions.length > 1 &&
    block.actions[1].chain === "IF_DO"
  ) {
    issues.push(
      warn(
        cardId,
        blockId,
        "E1",
        "TRASH_FROM_HAND as first action before IF_DO — likely a cost, not an action",
      ),
    );
  }

  // E2: REST_SELF as action (not cost) in activate block
  if (cat === "activate") {
    for (const action of walkActions(block.actions)) {
      if (action.type === "REST_SELF") {
        issues.push(
          warn(
            cardId,
            blockId,
            "E2",
            "REST_SELF as action in activate block — typically a cost",
          ),
        );
      }
    }
  }

  // E3: DON_MINUS as action type
  for (const action of walkActions(block.actions)) {
    if (action.type === "DON_MINUS") {
      issues.push(
        warn(
          cardId,
          blockId,
          "E3",
          "DON_MINUS as action type — this is a cost type, not an action",
        ),
      );
    }
  }
}

// ─── Output Formatting ──────────────────────────────────────────────────────

function err(cardId, blockId, rule, message) {
  return { level: "ERROR", cardId, blockId, rule, message };
}

function warn(cardId, blockId, rule, message) {
  return { level: "WARN", cardId, blockId, rule, message };
}

function formatIssue(issue) {
  const tag = issue.level === "ERROR" ? "[ERROR]" : "[WARN] ";
  return `${tag} ${issue.cardId} effect "${issue.blockId}": ${issue.rule} — ${issue.message}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const arg = process.argv[2];
  let files;

  if (arg) {
    const resolved = path.resolve(arg);
    if (!fs.existsSync(resolved)) {
      console.error(`Error: File not found: ${resolved}`);
      process.exit(1);
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      // Lint all .ts files in the directory (skip index.ts)
      files = [];
      function scan(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            scan(path.join(dir, entry.name));
          } else if (
            entry.name.endsWith(".ts") &&
            entry.name !== "index.ts"
          ) {
            files.push(path.join(dir, entry.name));
          }
        }
      }
      scan(resolved);
    } else {
      files = [resolved];
    }
  } else {
    files = discoverSchemaFiles();
  }

  if (files.length === 0) {
    console.log("No schema files found.");
    process.exit(0);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const allIssues = [];

  for (const file of files) {
    const schemas = loadSchemasFromFile(file);
    const relPath = path.relative(SCHEMAS_DIR, file);

    for (const schema of schemas) {
      const issues = lintSchema(schema);
      for (const issue of issues) {
        issue.file = relPath;
        allIssues.push(issue);
        if (issue.level === "ERROR") totalErrors++;
        else totalWarnings++;
      }
    }
  }

  if (allIssues.length === 0) {
    console.log(
      `Lint clean — ${files.length} file(s), no semantic issues found.`,
    );
    process.exit(0);
  }

  // Group by file
  const byFile = new Map();
  for (const issue of allIssues) {
    if (!byFile.has(issue.file)) byFile.set(issue.file, []);
    byFile.get(issue.file).push(issue);
  }

  for (const [file, issues] of byFile) {
    console.log(`\n── ${file} ──`);
    // Sort: errors first, then by card ID
    issues.sort((a, b) => {
      if (a.level !== b.level) return a.level === "ERROR" ? -1 : 1;
      return (a.cardId || "").localeCompare(b.cardId || "");
    });
    for (const issue of issues) {
      console.log(formatIssue(issue));
    }
  }

  console.log(
    `\n--- ${totalErrors} error(s), ${totalWarnings} warning(s) across ${files.length} file(s) ---`,
  );

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
