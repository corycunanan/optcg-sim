import { describe, it, expect } from "vitest";
import { validateClientMessage } from "../util/validate.js";

// OPT-187: WebSocket action params must be shape-validated with Zod before
// reaching the pipeline. These tests pin each variant of the GameAction union
// plus envelope handling.

describe("validateClientMessage — envelope", () => {
  it("accepts game:leave", () => {
    expect(validateClientMessage({ type: "game:leave" })).toEqual({ type: "game:leave" });
  });

  it("rejects null", () => {
    expect(() => validateClientMessage(null)).toThrow(/Invalid ClientMessage/);
  });

  it("rejects non-object", () => {
    expect(() => validateClientMessage("hello")).toThrow(/Invalid ClientMessage/);
  });

  it("rejects unknown envelope type", () => {
    expect(() => validateClientMessage({ type: "game:hack" })).toThrow(/Invalid ClientMessage/);
  });

  it("rejects game:action without action", () => {
    expect(() => validateClientMessage({ type: "game:action" })).toThrow(/Invalid ClientMessage/);
  });

  it("rejects game:action with unknown action type", () => {
    expect(() =>
      validateClientMessage({ type: "game:action", action: { type: "HACK" } }),
    ).toThrow(/Invalid ClientMessage/);
  });

  it("rejects extra keys at envelope level", () => {
    expect(() =>
      validateClientMessage({ type: "game:leave", extra: "injected" }),
    ).toThrow(/Invalid ClientMessage/);
  });
});

const wrap = (action: unknown) => ({ type: "game:action", action });

describe("validateClientMessage — no-param actions", () => {
  it.each(["ADVANCE_PHASE", "PASS", "CONCEDE", "UNDO"])("accepts %s", (type) => {
    expect(validateClientMessage(wrap({ type }))).toBeTruthy();
  });

  it("rejects extra params on no-param actions", () => {
    expect(() => validateClientMessage(wrap({ type: "PASS", smuggled: 1 }))).toThrow();
  });
});

describe("validateClientMessage — PLAY_CARD", () => {
  it("accepts with cardInstanceId only", () => {
    expect(validateClientMessage(wrap({ type: "PLAY_CARD", cardInstanceId: "c1" }))).toBeTruthy();
  });

  it("accepts with optional position", () => {
    expect(
      validateClientMessage(wrap({ type: "PLAY_CARD", cardInstanceId: "c1", position: 0 })),
    ).toBeTruthy();
  });

  it("rejects empty cardInstanceId", () => {
    expect(() => validateClientMessage(wrap({ type: "PLAY_CARD", cardInstanceId: "" }))).toThrow();
  });

  it("rejects non-string cardInstanceId", () => {
    expect(() => validateClientMessage(wrap({ type: "PLAY_CARD", cardInstanceId: 42 }))).toThrow();
  });

  it("rejects negative position", () => {
    expect(() =>
      validateClientMessage(wrap({ type: "PLAY_CARD", cardInstanceId: "c1", position: -1 })),
    ).toThrow();
  });

  it("rejects non-integer position", () => {
    expect(() =>
      validateClientMessage(wrap({ type: "PLAY_CARD", cardInstanceId: "c1", position: 1.5 })),
    ).toThrow();
  });
});

describe("validateClientMessage — ATTACH_DON", () => {
  it("accepts valid payload", () => {
    expect(
      validateClientMessage(wrap({ type: "ATTACH_DON", targetInstanceId: "t1", count: 2 })),
    ).toBeTruthy();
  });

  it("rejects count <= 0", () => {
    expect(() =>
      validateClientMessage(wrap({ type: "ATTACH_DON", targetInstanceId: "t1", count: 0 })),
    ).toThrow();
  });

  it("rejects missing count", () => {
    expect(() =>
      validateClientMessage(wrap({ type: "ATTACH_DON", targetInstanceId: "t1" })),
    ).toThrow();
  });
});

describe("validateClientMessage — ACTIVATE_EFFECT", () => {
  it("accepts valid payload", () => {
    expect(
      validateClientMessage(wrap({ type: "ACTIVATE_EFFECT", cardInstanceId: "c1", effectId: "e1" })),
    ).toBeTruthy();
  });

  it("rejects missing effectId", () => {
    expect(() =>
      validateClientMessage(wrap({ type: "ACTIVATE_EFFECT", cardInstanceId: "c1" })),
    ).toThrow();
  });
});

describe("validateClientMessage — DECLARE_ATTACK", () => {
  it("accepts valid payload", () => {
    expect(
      validateClientMessage(
        wrap({ type: "DECLARE_ATTACK", attackerInstanceId: "a1", targetInstanceId: "t1" }),
      ),
    ).toBeTruthy();
  });

  it("rejects missing target", () => {
    expect(() =>
      validateClientMessage(wrap({ type: "DECLARE_ATTACK", attackerInstanceId: "a1" })),
    ).toThrow();
  });
});

describe("validateClientMessage — DECLARE_BLOCKER / USE_COUNTER / USE_COUNTER_EVENT", () => {
  it("accepts DECLARE_BLOCKER", () => {
    expect(
      validateClientMessage(wrap({ type: "DECLARE_BLOCKER", blockerInstanceId: "b1" })),
    ).toBeTruthy();
  });

  it("accepts USE_COUNTER", () => {
    expect(
      validateClientMessage(
        wrap({ type: "USE_COUNTER", cardInstanceId: "c1", counterTargetInstanceId: "t1" }),
      ),
    ).toBeTruthy();
  });

  it("accepts USE_COUNTER_EVENT", () => {
    expect(
      validateClientMessage(
        wrap({ type: "USE_COUNTER_EVENT", cardInstanceId: "c1", counterTargetInstanceId: "t1" }),
      ),
    ).toBeTruthy();
  });

  it("rejects USE_COUNTER missing counterTargetInstanceId", () => {
    expect(() =>
      validateClientMessage(wrap({ type: "USE_COUNTER", cardInstanceId: "c1" })),
    ).toThrow();
  });
});

describe("validateClientMessage — REVEAL_TRIGGER", () => {
  it("accepts reveal: true", () => {
    expect(validateClientMessage(wrap({ type: "REVEAL_TRIGGER", reveal: true }))).toBeTruthy();
  });

  it("rejects non-boolean reveal", () => {
    expect(() => validateClientMessage(wrap({ type: "REVEAL_TRIGGER", reveal: "yes" }))).toThrow();
  });
});

describe("validateClientMessage — ARRANGE_TOP_CARDS", () => {
  it("accepts valid payload", () => {
    expect(
      validateClientMessage(
        wrap({
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: "k1",
          orderedInstanceIds: ["a", "b"],
          destination: "top",
        }),
      ),
    ).toBeTruthy();
  });

  it("accepts empty orderedInstanceIds", () => {
    expect(
      validateClientMessage(
        wrap({
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: "k1",
          orderedInstanceIds: [],
          destination: "bottom",
        }),
      ),
    ).toBeTruthy();
  });

  it("rejects invalid destination", () => {
    expect(() =>
      validateClientMessage(
        wrap({
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: "k1",
          orderedInstanceIds: [],
          destination: "middle",
        }),
      ),
    ).toThrow();
  });

  it("rejects orderedInstanceIds of wrong type", () => {
    expect(() =>
      validateClientMessage(
        wrap({
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: "k1",
          orderedInstanceIds: [1, 2],
          destination: "top",
        }),
      ),
    ).toThrow();
  });
});

describe("validateClientMessage — SELECT_TARGET", () => {
  it("accepts payload with ids", () => {
    expect(
      validateClientMessage(wrap({ type: "SELECT_TARGET", selectedInstanceIds: ["a", "b"] })),
    ).toBeTruthy();
  });

  it("accepts empty selectedInstanceIds (optional selections)", () => {
    expect(
      validateClientMessage(wrap({ type: "SELECT_TARGET", selectedInstanceIds: [] })),
    ).toBeTruthy();
  });

  it("rejects empty string in array", () => {
    expect(() =>
      validateClientMessage(wrap({ type: "SELECT_TARGET", selectedInstanceIds: ["a", ""] })),
    ).toThrow();
  });

  it("rejects missing field", () => {
    expect(() => validateClientMessage(wrap({ type: "SELECT_TARGET" }))).toThrow();
  });
});

describe("validateClientMessage — REDISTRIBUTE_DON", () => {
  it("accepts valid transfers", () => {
    expect(
      validateClientMessage(
        wrap({
          type: "REDISTRIBUTE_DON",
          transfers: [
            { fromCardInstanceId: "a", donInstanceId: "d1", toCardInstanceId: "b" },
            { fromCardInstanceId: "c", donInstanceId: "d2", toCardInstanceId: "d" },
          ],
        }),
      ),
    ).toBeTruthy();
  });

  it("rejects transfer with missing field", () => {
    expect(() =>
      validateClientMessage(
        wrap({
          type: "REDISTRIBUTE_DON",
          transfers: [{ fromCardInstanceId: "a", toCardInstanceId: "b" }],
        }),
      ),
    ).toThrow();
  });

  it("rejects transfers with extra keys", () => {
    expect(() =>
      validateClientMessage(
        wrap({
          type: "REDISTRIBUTE_DON",
          transfers: [
            {
              fromCardInstanceId: "a",
              donInstanceId: "d1",
              toCardInstanceId: "b",
              rogue: "x",
            },
          ],
        }),
      ),
    ).toThrow();
  });
});

describe("validateClientMessage — PLAYER_CHOICE / MANUAL_EFFECT", () => {
  it("accepts PLAYER_CHOICE", () => {
    expect(validateClientMessage(wrap({ type: "PLAYER_CHOICE", choiceId: "ok" }))).toBeTruthy();
  });

  it("rejects empty choiceId", () => {
    expect(() => validateClientMessage(wrap({ type: "PLAYER_CHOICE", choiceId: "" }))).toThrow();
  });

  it("accepts MANUAL_EFFECT", () => {
    expect(
      validateClientMessage(wrap({ type: "MANUAL_EFFECT", description: "do a thing" })),
    ).toBeTruthy();
  });

  it("rejects MANUAL_EFFECT with empty description", () => {
    expect(() =>
      validateClientMessage(wrap({ type: "MANUAL_EFFECT", description: "" })),
    ).toThrow();
  });
});

describe("validateClientMessage — extra-key rejection", () => {
  it("rejects PLAY_CARD with injected field", () => {
    expect(() =>
      validateClientMessage(
        wrap({ type: "PLAY_CARD", cardInstanceId: "c1", __proto__: { hacked: true } }),
      ),
    ).toThrow();
  });
});
