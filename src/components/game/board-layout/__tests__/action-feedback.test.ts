import { describe, expect, it } from "vitest";
import { getActionCardInstanceId } from "../action-feedback";

describe("getActionCardInstanceId", () => {
  it("locates hand and field cards that initiated rejected actions", () => {
    expect(
      getActionCardInstanceId({ type: "PLAY_CARD", cardInstanceId: "hand-1" }),
    ).toBe("hand-1");
    expect(
      getActionCardInstanceId({
        type: "DECLARE_ATTACK",
        attackerInstanceId: "leader-1",
        targetInstanceId: "leader-2",
      }),
    ).toBe("leader-1");
    expect(
      getActionCardInstanceId({
        type: "ACTIVATE_EFFECT",
        cardInstanceId: "stage-1",
        effectId: "main",
      }),
    ).toBe("stage-1");
  });

  it("uses the affected card for DON feedback and ignores cardless actions", () => {
    expect(
      getActionCardInstanceId({
        type: "ATTACH_DON",
        targetInstanceId: "character-1",
        count: 1,
      }),
    ).toBe("character-1");
    expect(getActionCardInstanceId({ type: "ADVANCE_PHASE" })).toBeNull();
  });
});
