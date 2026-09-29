/**
 * OPT-893 — `ACTION_TARGET_PROMPT_KIND` must agree with the handlers.
 *
 * Optional-action validation treats an omitted target count as "the selection
 * prompt already allows 0" only for TARGET_COUNT actions. This suite re-derives
 * that set from the resolver's source: a handler registered in ACTION_HANDLERS
 * is TARGET_COUNT exactly when its body (or a same-file helper it calls) asks
 * `needsPlayerTargetSelection(action.target, …)` — directly or through a
 * same-file helper that forwards its `action.target` argument there — and
 * prompts through `buildSelectTargetPrompt`. A new or changed handler that
 * drifts from the table fails here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_TARGET_PROMPT_KIND,
  type TargetPromptKind,
} from "../engine/effect-resolver/target-prompt-actions.js";
import {
  ACTION_TYPES_WITHOUT_RESOLVER_HANDLER,
  ALL_ACTION_TYPES,
  type ActionType,
} from "../engine/effect-types.js";
import { listRegisteredActionTypes } from "../engine/effect-resolver/resolver.js";

const resolverDir = resolve(import.meta.dirname, "../engine/effect-resolver");

function handlerNames(): Map<string, string> {
  const source = readFileSync(resolve(resolverDir, "resolver.ts"), "utf8");
  const start = source.indexOf("const ACTION_HANDLERS");
  const end = source.indexOf("\n};", start);
  const block = source.slice(start, end);
  const names = new Map<string, string>();
  // `TYPE: module.executeX,`, `TYPE: executeX,`, or `TYPE: (...) => module.executeX(...)`.
  const entry = /\b([A-Z][A-Z_]+):\s*(?:\([^)]*\)\s*=>\s*)?(?:\w+\.)?(execute\w+)/g;
  for (const match of block.matchAll(entry)) names.set(match[1], match[2]);
  return names;
}

/** Top-level function bodies across the resolver's action modules, by file. */
function functionBodies(): Map<string, { file: string; body: string }> {
  const files = [
    ...readdirSync(resolve(resolverDir, "actions")).map((f) => resolve(resolverDir, "actions", f)),
    resolve(resolverDir, "resolver.ts"),
  ].filter((f) => f.endsWith(".ts"));
  const bodies = new Map<string, { file: string; body: string }>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const starts = [...source.matchAll(/^(?:export )?(?:async )?function (\w+)\(/gm)];
    starts.forEach((match, i) => {
      const next = starts[i + 1]?.index ?? source.length;
      bodies.set(match[1], { file, body: source.slice(match.index, next) });
    });
  }
  return bodies;
}

/** Split a parameter or argument list on top-level commas. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if ("([{<".includes(ch)) depth++;
    else if (")]}>".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Declared parameter names of a function body captured by `functionBodies`. */
function parameterNames(body: string): string[] {
  const open = body.indexOf("(");
  let depth = 0;
  let end = open;
  for (let i = open; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")" && --depth === 0) {
      end = i;
      break;
    }
  }
  return splitTopLevel(body.slice(open + 1, end)).map((p) => p.trim().match(/^(\w+)/)?.[1] ?? "");
}

/**
 * Whether `body` asks `needsPlayerTargetSelection` about `action.target`,
 * directly or through a same-file helper that receives `action.target` and
 * passes that parameter on to `needsPlayerTargetSelection` (OPT-885's
 * `any_number` wrapper in removal.ts is one such helper).
 */
function asksTargetSelection(
  body: string,
  file: string,
  bodies: ReturnType<typeof functionBodies>,
): boolean {
  if (/needsPlayerTargetSelection\(\s*action\.target\b/.test(body)) return true;
  for (const call of body.matchAll(/\b(\w+)\(([^()]*?)\baction\.target\b(?!\.|\?\.)/g)) {
    const helper = bodies.get(call[1]);
    if (!helper || helper.file !== file) continue;
    const position = splitTopLevel(call[2]).length;
    const param = parameterNames(helper.body)[position];
    if (param && new RegExp(`needsPlayerTargetSelection\\(\\s*${param}\\b(?!\\.|\\?\\.)`).test(helper.body)) {
      return true;
    }
  }
  return false;
}

function derivedKind(handler: string, bodies: ReturnType<typeof functionBodies>): TargetPromptKind {
  const own = bodies.get(handler);
  if (!own) throw new Error(`handler ${handler} not found in effect-resolver sources`);
  // Follow one level of same-file delegation (ADD_TO_LIFE -> executeAddToLifeFromTrash).
  const text = [own.body];
  for (const call of own.body.matchAll(/\b(execute\w+)\(/g)) {
    const callee = bodies.get(call[1]);
    if (call[1] !== handler && callee?.file === own.file) text.push(callee.body);
  }
  return text.some((body) => asksTargetSelection(body, own.file, bodies)) &&
    /buildSelectTargetPrompt\(/.test(text.join("\n"))
    ? "TARGET_COUNT"
    : "OTHER";
}

describe("OPT-893 action target-prompt classification", () => {
  it("classifies every ActionType", () => {
    expect(Object.keys(ACTION_TARGET_PROMPT_KIND).sort()).toEqual([...ALL_ACTION_TYPES].sort());
  });

  it("matches the handler source registered for each action type", () => {
    const names = handlerNames();
    const bodies = functionBodies();
    expect([...names.keys()].sort()).toEqual(listRegisteredActionTypes());
    const drift: string[] = [];
    for (const [type, handler] of names) {
      const expected = derivedKind(handler, bodies);
      if (ACTION_TARGET_PROMPT_KIND[type as ActionType] !== expected) {
        drift.push(`${type} (${handler}): table ${ACTION_TARGET_PROMPT_KIND[type as ActionType]}, source ${expected}`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("classifies action types without a resolver handler as OTHER", () => {
    for (const type of ACTION_TYPES_WITHOUT_RESOLVER_HANDLER) {
      expect(ACTION_TARGET_PROMPT_KIND[type]).toBe("OTHER");
    }
  });
});
