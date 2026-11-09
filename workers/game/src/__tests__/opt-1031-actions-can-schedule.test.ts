import { describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import { EFFECT_SOURCE_SNAPSHOT_REF, getNestedActions } from "../engine/effect-types.js";
import { actionsCanSchedule, prepareResumeProvenance } from "../engine/effect-resolver/resume-provenance.js";
import type { GameState } from "../types.js";

// OPT-1031: an APPLY_PROHIBITION conditional_override.action is never executed
// by the block that carries it; it only names what the prohibition still
// allows. It must not make the block look like it can schedule work.
const scheduledOverride: Action = {
  type: "SCHEDULE_ACTION",
  params: { timing: "END_OF_THIS_TURN", action: { type: "SET_DON_ACTIVE", params: { amount: 1 } } },
} as Action;

const prohibitionWithScheduledOverride = {
  type: "APPLY_PROHIBITION",
  target: { type: "ALL_OPPONENT_CHARACTERS" },
  params: { prohibition_type: "CANNOT_ATTACK", conditional_override: { action: scheduledOverride } },
  duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
} as Action;

describe("OPT-1031 actionsCanSchedule and APPLY_PROHIBITION overrides", () => {
  it("ignores a SCHEDULE_ACTION that only appears as a prohibition override", () => {
    expect(actionsCanSchedule([prohibitionWithScheduledOverride])).toBe(false);
  });

  it("ignores an override that wraps a SCHEDULE_ACTION in a choice", () => {
    const wrapped = {
      ...prohibitionWithScheduledOverride,
      params: { prohibition_type: "CANNOT_ATTACK", conditional_override: {
        action: { type: "PLAYER_CHOICE", params: { options: [[scheduledOverride]] } },
      } },
    } as Action;
    expect(actionsCanSchedule([wrapped])).toBe(false);
  });

  it("still counts real SCHEDULE_ACTIONs at the top level and inside executed branches", () => {
    expect(actionsCanSchedule([scheduledOverride])).toBe(true);
    expect(actionsCanSchedule([{ type: "PLAYER_CHOICE", params: { options: [[], [scheduledOverride]] } } as Action])).toBe(true);
    expect(actionsCanSchedule([prohibitionWithScheduledOverride, scheduledOverride])).toBe(true);
  });

  it("keeps the override visible to static walkers through getNestedActions", () => {
    expect(getNestedActions(prohibitionWithScheduledOverride)).toEqual([scheduledOverride]);
  });

  it("does not upgrade a schema 9 state for a block whose only schedule is an override", () => {
    const state = {
      status: "IN_PROGRESS",
      schemaVersion: 9,
      costSemanticsVersion: 8,
      effectStack: [],
      scheduledActions: [],
    } as unknown as GameState;
    const refs: [string, never][] = [[EFFECT_SOURCE_SNAPSHOT_REF, {} as never]];
    const prepared = prepareResumeProvenance(state, "owner", refs, [prohibitionWithScheduledOverride]);
    expect(prepared.state).toBe(state);
    expect(prepared.refs).toBe(refs);
    // Control: the same state with a real SCHEDULE_ACTION is upgraded.
    expect(prepareResumeProvenance(state, "owner", refs, [scheduledOverride]).state.schemaVersion).toBe(10);
  });
});
