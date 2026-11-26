import { describe, expect, it } from "vitest";
import type { CardInstance, DonInstance, PlayerState } from "@shared/game-types";
import { donReturnFlight, refreshStandUp } from "@/lib/motion";
import { diffRefresh, planRefreshWave, standUpDelays } from "./refresh-wave";

function don(instanceId: string, state: "ACTIVE" | "RESTED", attachedTo: string | null = null): DonInstance {
  return { instanceId, state, attachedTo } as DonInstance;
}

function card(
  instanceId: string,
  state: "ACTIVE" | "RESTED",
  attachedDon: DonInstance[] = []
): CardInstance {
  return { instanceId, cardId: "OP01-001", state, attachedDon } as unknown as CardInstance;
}

function player(parts: {
  leader: CardInstance;
  characters?: (CardInstance | null)[];
  stage?: CardInstance | null;
  donCostArea?: DonInstance[];
}): PlayerState {
  return {
    leader: parts.leader,
    characters: parts.characters ?? [null, null, null, null, null],
    stage: parts.stage ?? null,
    donCostArea: parts.donCostArea ?? [],
  } as unknown as PlayerState;
}

describe("diffRefresh", () => {
  it("lists returning DON!! Leader first, then Characters by slot, and every card that stood up", () => {
    const before = player({
      leader: card("L", "RESTED", [don("d1", "ACTIVE", "L")]),
      characters: [
        card("c0", "RESTED", [don("d2", "ACTIVE", "c0"), don("d3", "ACTIVE", "c0")]),
        null,
        card("c2", "ACTIVE"),
      ],
      stage: card("s", "RESTED"),
      donCostArea: [don("d4", "RESTED"), don("d5", "ACTIVE")],
    });
    const after = player({
      leader: card("L", "ACTIVE"),
      characters: [card("c0", "ACTIVE"), null, card("c2", "ACTIVE")],
      stage: card("s", "ACTIVE"),
      donCostArea: ["d4", "d5", "d1", "d2", "d3"].map((id) => don(id, "ACTIVE")),
    });

    const diff = diffRefresh(before, after);

    expect(diff?.returns).toEqual([
      { donInstanceId: "d1", cardInstanceId: "L" },
      { donInstanceId: "d2", cardInstanceId: "c0" },
      { donInstanceId: "d3", cardInstanceId: "c0" },
    ]);
    // c2 and d5 were already active, so they do not stand up again.
    expect(diff?.standing).toEqual(["L", "c0", "s", "d4", "d1", "d2", "d3"]);
  });

  it("leaves a card held rested by a prohibition out of the stand-up", () => {
    const before = player({ leader: card("L", "RESTED"), characters: [card("c0", "RESTED")] });
    const after = player({ leader: card("L", "ACTIVE"), characters: [card("c0", "RESTED")] });
    expect(diffRefresh(before, after)?.standing).toEqual(["L"]);
  });

  it("is null when nothing moves (a player's first turn)", () => {
    const board = player({ leader: card("L", "ACTIVE") });
    expect(diffRefresh(board, board)).toBeNull();
  });
});

describe("planRefreshWave", () => {
  it("staggers the returns 30ms apart, then stands cards up 60ms apart after a short gap", () => {
    const plan = planRefreshWave(3, 4);
    expect(plan.returnDelaysMs).toEqual([0, 30, 60]);
    const returnsEnd = 60 + donReturnFlight.durationMs;
    expect(plan.standStartMs).toBe(returnsEnd + refreshStandUp.gapMs);
    expect(plan.standStaggerMs).toBe(60);
    expect(plan.durationMs).toBe(plan.standStartMs + 3 * 60 + 180);
  });

  it("stands up at once when no DON!! return", () => {
    const plan = planRefreshWave(0, 2);
    expect(plan.returnDelaysMs).toEqual([]);
    expect(plan.standStartMs).toBe(0);
    expect(plan.durationMs).toBe(60 + 180);
  });

  it("caps the stand-up spread for a full cost area", () => {
    const plan = planRefreshWave(0, 16);
    expect(plan.standStaggerMs * 15).toBe(refreshStandUp.maxSpreadMs);
    expect(plan.standStaggerMs).toBeLessThan(60);
  });
});

describe("standUpDelays", () => {
  it("orders by screen x, left to right", () => {
    const x: Record<string, number> = { a: 300, b: 100, c: 200 };
    const delays = standUpDelays(["a", "b", "c"], (id) => x[id], 60);
    expect(delays.get("b")).toBe(0);
    expect(delays.get("c")).toBeCloseTo(0.06);
    expect(delays.get("a")).toBeCloseTo(0.12);
  });

  it("puts unmeasured ids last, in their given order", () => {
    const delays = standUpDelays(["u1", "m", "u2"], (id) => (id === "m" ? 5 : null), 60);
    expect([...delays.keys()]).toEqual(["m", "u1", "u2"]);
  });
});
