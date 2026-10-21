import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import {
  checkReplacementForKO,
  resumeReplacementBatch,
} from "../engine/replacements.js";

const ENGINE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "engine"
);
const COST_ROOT = join(ENGINE_ROOT, "effect-resolver", "cost");

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("OPT-478 resolver architecture contract", () => {
  it("uses an immutable, construction-complete runtime service bundle", () => {
    expect(Object.isFrozen(resolverExecutionServices)).toBe(true);
    expect(resolverExecutionServices).toEqual({
      withCommittedEvents: expect.any(Function),
      publishCommittedEvents: expect.any(Function),
      executeActionChain: expect.any(Function),
      executeEffectAction: expect.any(Function),
      resolveEffect: expect.any(Function),
      continueSimultaneousGroup: expect.any(Function),
      reportTriggers: expect.any(Function),
      continueHandler: expect.any(Function),
    });

    // Required service parameters are part of the runtime JS contract, not
    // erased optional callback registration.
    expect(checkReplacementForKO.length).toBe(6);
    expect(resumeReplacementBatch.length).toBe(5);
  });

  it("forbids mutable resolver dispatcher injection", () => {
    const guardedFiles = [
      join(ENGINE_ROOT, "replacements.ts"),
      join(ENGINE_ROOT, "effect-resolver", "resolver.ts"),
      join(ENGINE_ROOT, "effect-resolver", "actions", "choice.ts"),
      join(ENGINE_ROOT, "effect-resolver", "actions", "play.ts"),
    ];
    const combined = guardedFiles.map(source).join("\n");

    expect(combined).not.toMatch(
      /set(?:ChoiceDependencies|PlayDependencies|ReplacementDispatcher)|executeActionChainDispatcher/
    );
    expect(combined).not.toContain("dispatcher was not initialized");
    expect(combined).not.toMatch(/\blet\s+_?(?:execute|resolve)[A-Z]\w*\s*:/);
  });

  it("keeps the stable cost facade thin and focused modules acyclic", () => {
    const facade = source(
      join(ENGINE_ROOT, "effect-resolver", "cost-handler.ts")
    );
    expect(facade.split("\n").length).toBeLessThanOrEqual(40);

    const files = readdirSync(COST_ROOT).filter((file) => file.endsWith(".ts"));
    const graph = new Map<string, string[]>();
    for (const file of files) {
      const moduleName = file.replace(/\.ts$/, "");
      const dependencies = [
        ...source(join(COST_ROOT, file)).matchAll(/from "\.\/([^"/]+)\.js"/g),
      ]
        .map((match) => match[1])
        .filter((dependency) => files.includes(`${dependency}.ts`));
      graph.set(moduleName, dependencies);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (moduleName: string): void => {
      if (visiting.has(moduleName))
        throw new Error(`Cost dependency cycle at ${moduleName}`);
      if (visited.has(moduleName)) return;
      visiting.add(moduleName);
      for (const dependency of graph.get(moduleName) ?? []) visit(dependency);
      visiting.delete(moduleName);
      visited.add(moduleName);
    };
    for (const moduleName of graph.keys()) visit(moduleName);

    expect([...graph.keys()].sort()).toEqual([
      "feasibility",
      "named-play",
      "orchestrator",
      "payability",
      "payment",
      "prompts",
      "replaced",
      "resume",
      "targets",
      "transaction",
    ]);
  });
});

it("OPT-967 domain handlers report work and production boundaries name the common drain", () => {
  for (const file of ["battle.ts", "effect-damage.ts", "execute.ts"]) {
    const text = source(join(ENGINE_ROOT, file));
    expect(text, file).not.toMatch(
      /import\s*\{[^}]*\bresolveEffect\b[^}]*\}\s*from/
    );
    expect(text, file).not.toMatch(
      /\b(?:advanceTriggerExecution|advanceLifeTriggerExecution|drainPendingWork)\s*\(/
    );
  }
  const scans = source(join(ENGINE_ROOT, "trigger-queue.ts"));
  expect(scans).not.toMatch(
    /\b(?:advanceTriggerExecution|drainPendingWork|resolveEffect)\s*\(/
  );
  expect(scans).toContain("reportTriggerWork");
  const services = source(join(ENGINE_ROOT, "effect-resolver", "resolver.ts"));
  expect(services.indexOf("function createResolverServices")).toBeGreaterThanOrEqual(0);
  expect(
    services.slice(
      services.indexOf("function createResolverServices"),
      services.indexOf("/** Public convenience")
    )
  ).not.toMatch(/\b(?:drainPendingWork|resolveEffect)\s*\(/);
  const session = source(
    join(ENGINE_ROOT, "..", "session", "prompt-lifecycle.ts")
  );
  expect(session).toContain("resumeFromStackWork as resumeFromStack");
  expect(session).toContain("drainPendingWork");
});
