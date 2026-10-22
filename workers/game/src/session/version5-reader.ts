/** Strict v5 trigger-generation reader. The projection is only a validation
 * copy; execution retains the original frame and generation boundaries. */
import { z } from "zod";
import type { EffectStackFrame } from "../types.js";
import { CONTINUATION_EFFECT_BLOCK } from "../engine/effect-stack.js";
import { Trigger } from "./version4-reader.js";

const OrderingGroup = z.strictObject({
  triggers: z.array(Trigger),
  resolvedTriggerIds: z.array(z.string()),
});
const Execution = z.strictObject({
  generations: z.array(
    z.strictObject({
      triggers: z.array(Trigger),
      orderingGroup: OrderingGroup.optional(),
    })
  ),
  collectingGenerationIndex: z.number().int().positive().optional(),
  selectedTrigger: Trigger.extend({ orderingId: z.string().min(1) }).optional(),
});

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  )
    return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  const a = Object.entries(left);
  const b = Object.entries(right);
  return (
    a.length === b.length &&
    a.every(
      ([key, value]) =>
        Object.hasOwn(right, key) && sameValue(value, Reflect.get(right, key))
    )
  );
}

// Every frame field must declare whether this owner may retain it. New frame
// continuations therefore require an explicit compatibility decision here.
const ownerFields = {
  triggerExecution: "retain",
  accumulatedEvents: "retain",
  kind: "retain",
  id: "retain",
  sourceCardInstanceId: "retain",
  controller: "retain",
  effectDescription: "retain",
  effectBlock: "block",
  phase: "phase",
  pausedAction: "null",
  remainingActions: "empty",
  resultRefs: "empty",
  validTargets: "empty",
  costs: "empty",
  costResultRefs: "empty",
  pendingTriggers: "empty",
  simultaneousTriggers: "empty",
  currentCostIndex: "zero",
  costsPaid: "true",
  oncePerTurnMarked: "true",
  eventActivation: "absent",
  playOverflow: "absent",
  pregameContinuation: "absent",
  eventActivationCompletion: "absent",
  remainingActionsController: "absent",
  returnToDeckArrangement: "absent",
  fieldToLifeTargetIds: "absent",
  giveDonIdentity: "absent",
  priorActionSucceeded: "absent",
  simultaneousGroup: "absent",
  phaseBoundaryContinuation: "absent",
  replacement: "absent",
  replacementBatch: "absent",
  battleDamage: "absent",
  effectDamage: "absent",
  costTransactionState: "absent",
  costReplacementAction: "absent",
  costReplacementChecked: "absent",
  costReplacementResolution: "absent",
  triggerOrderingGroup: "absent",
  ruleTrashForPlay: "absent",
  stateDistributionForPlay: "absent",
  batchResumeMarker: "absent",
  costArrangeStage: "absent",
  namedPlayCostTargetId: "absent",
} satisfies Record<
  keyof EffectStackFrame,
  "retain" | "block" | "phase" | "null" | "empty" | "zero" | "true" | "absent"
>;

export function triggerExecutionOwnerViolation(frame: object): string | null {
  for (const [field, policy] of Object.entries(ownerFields)) {
    const value: unknown = Reflect.get(frame, field);
    const valid =
      policy === "retain" ||
      (policy === "absent" && value === undefined) ||
      (policy === "empty" && Array.isArray(value) && value.length === 0) ||
      (policy === "zero" && value === 0) ||
      (policy === "true" && value === true) ||
      (policy === "null" && value === null) ||
      (policy === "phase" && value === "INTERRUPTED_BY_TRIGGERS") ||
      (policy === "block" && sameValue(value, CONTINUATION_EFFECT_BLOCK));
    if (!valid)
      return `is TRIGGER_EXECUTION but carries unrelated continuation work in ${field}`;
  }
  return null;
}

export function projectVersion5(
  raw: Record<string, unknown>,
  fail: (reason: string) => never
): Record<string, unknown> {
  if (!Array.isArray(raw.effectStack))
    fail("version 5 effectStack must be an array");
  const scopes = new Map<number, z.infer<typeof Execution>>();
  const frames = raw.effectStack as Record<string, unknown>[];
  const effectStack = (raw.effectStack as unknown[]).map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      fail(`effectStack[${index}] must be a frame`);
    const frame = candidate as Record<string, unknown>;
    if (frame.triggerExecution === undefined) return frame;
    const parsed = Execution.safeParse(frame.triggerExecution);
    if (!parsed.success)
      fail(`effectStack[${index}].triggerExecution: ${parsed.error.message}`);
    const violation = triggerExecutionOwnerViolation(frame);
    if (violation) fail(`effectStack[${index}] ${violation}`);
    const work = parsed.data!;
    const collector = work.collectingGenerationIndex;
    if (
      collector !== undefined &&
      (collector >= work.generations.length ||
        work.generations[collector].triggers.length === 0 ||
        work.generations[collector].orderingGroup !== undefined)
    )
      fail(`effectStack[${index}] has an invalid open trigger collector`);
    scopes.set(index, work);
    if (frame.kind !== "TRIGGER_EXECUTION")
      fail(`effectStack[${index}] trigger execution kind disagrees`);
    for (const [generationIndex, generation] of work.generations.entries()) {
      const ids = generation.triggers.map((trigger) => trigger.orderingId);
      if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
        fail(
          `effectStack[${index}].triggerExecution.generations[${generationIndex}] requires unique ordering IDs`
        );
      if (generationIndex > 0 && ids.length === 0)
        fail(`effectStack[${index}] has an empty later generation`);
      const group = generation.orderingGroup;
      if (group) {
        const groupIds = group.triggers.map((trigger) => trigger.orderingId);
        const known = new Set(groupIds);
        const controller = group.triggers[0]?.controller;
        if (
          groupIds.some((id) => !id) ||
          known.size !== groupIds.length ||
          group.triggers.some((trigger) => trigger.controller !== controller)
        )
          fail(`effectStack[${index}] has an invalid ordering group`);
        if (
          new Set(group.resolvedTriggerIds).size !==
            group.resolvedTriggerIds.length ||
          group.resolvedTriggerIds.some((id) => !known.has(id))
        )
          fail(
            `effectStack[${index}] has an unknown or repeated resolved ordering ID`
          );
        const unresolved = group.triggers.filter(
          (trigger) => !group.resolvedTriggerIds.includes(trigger.orderingId!)
        );
        const current = generation.triggers.filter(
          (trigger) => trigger.controller === controller
        );
        if (
          current.length !== unresolved.length ||
          current.some(
            (trigger) => !unresolved.some((entry) => sameValue(entry, trigger))
          )
        )
          fail(
            `effectStack[${index}] ordering group disagrees with its generation`
          );
      }
    }
    if (
      work.selectedTrigger &&
      work.generations[0]?.triggers.some(
        (trigger) => trigger.orderingId === work.selectedTrigger!.orderingId
      )
    )
      fail(`effectStack[${index}] selected trigger is still queued`);
    if (work.selectedTrigger) {
      const current = work.generations[0];
      if (!current)
        fail(
          `effectStack[${index}] selected trigger has no current generation`
        );
      const history = current.orderingGroup;
      if (
        history &&
        (!history.resolvedTriggerIds.includes(
          work.selectedTrigger.orderingId
        ) ||
          !history.triggers.some((entry) =>
            sameValue(entry, work.selectedTrigger)
          ))
      )
        fail(
          `effectStack[${index}] selected trigger disagrees with its ordering history`
        );
    }
    const { triggerExecution: _work, ...projected } = frame;
    // Validate every stored trigger's action/event content through the existing
    // strict v4 reader, without executing this flattened validation copy.
    return {
      ...projected,
      kind: "TRIGGER_DRAIN",
      pendingTriggers: [
        ...work.generations.flatMap((generation) => [
          ...generation.triggers,
          ...(generation.orderingGroup?.triggers ?? []),
        ]),
        ...(work.selectedTrigger ? [work.selectedTrigger] : []),
      ],
    };
  });
  for (const [selectionIndex, selection] of frames.entries()) {
    if (selection.phase !== "AWAITING_TRIGGER_ORDER_SELECTION") continue;
    // A selection belongs to the nearest owner below it. Historical selections
    // below every v5 scope keep their existing reader contract.
    const index = [...scopes.keys()]
      .reverse()
      .find((ownerIndex) => ownerIndex < selectionIndex);
    if (index === undefined) continue;
    const work = scopes.get(index)!;
    if (selectionIndex !== frames.length - 1)
      fail(
        `effectStack[${selectionIndex}] owned ordering selection must be the top frame`
      );
    if (selectionIndex !== index + 1)
      fail(
        `effectStack[${selectionIndex}] selection must be directly above its trigger execution owner`
      );
    const generation = work.generations[0];
    if (!generation || work.selectedTrigger)
      fail(`effectStack[${index}] selection has no current generation`);
    const turn = raw.turn as { activePlayerIndex?: unknown } | undefined;
    const player = generation.triggers.some(
      (trigger) => trigger.controller === turn?.activePlayerIndex
    )
      ? turn!.activePlayerIndex
      : generation.triggers[0]?.controller;
    const current = generation.triggers.filter(
      (trigger) => trigger.controller === player
    );
    const choices = selection.simultaneousTriggers;
    if (
      !Array.isArray(choices) ||
      choices.length !== current.length ||
      new Set(choices.map((trigger) => trigger?.orderingId)).size !==
        choices.length ||
      choices.some(
        (trigger) => !current.some((entry) => sameValue(entry, trigger))
      )
    )
      fail(`effectStack[${index}] selection disagrees with its generation`);
    const expectedGroup =
      generation.orderingGroup?.triggers[0]?.controller === player
        ? generation.orderingGroup
        : { triggers: current, resolvedTriggerIds: [] };
    if (!sameValue(selection.triggerOrderingGroup, expectedGroup))
      fail(
        `effectStack[${index}] selection ordering history disagrees with its generation`
      );
  }
  return { ...raw, schemaVersion: 4, effectStack };
}
