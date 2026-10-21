/** Strict v5 trigger-generation reader. The projection is only a validation
 * copy; execution retains the original frame and generation boundaries. */
import { z } from "zod";
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
    const work = parsed.data!;
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
  for (const [index, work] of scopes) {
    const selection = frames.at(-1);
    const lastScope = [...scopes.keys()].at(-1);
    if (
      lastScope !== index ||
      selection?.phase !== "AWAITING_TRIGGER_ORDER_SELECTION"
    )
      continue;
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
