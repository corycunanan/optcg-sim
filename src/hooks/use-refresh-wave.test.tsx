import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardInstance, DonInstance, GameEvent, PlayerState } from "@shared/game-types";
import type { ZonePositionRegistry } from "@/contexts/zone-position-context";
import { planRefreshWave } from "@/lib/game/refresh-wave";
import { refreshStandUp } from "@/lib/motion";
import {
  holdRested,
  useRefreshWave,
  type PlayersByIndex,
  type RefreshWaveView,
} from "./use-refresh-wave";

function don(instanceId: string, state: "ACTIVE" | "RESTED", attachedTo: string | null = null): DonInstance {
  return { instanceId, state, attachedTo } as DonInstance;
}

function card(instanceId: string, state: "ACTIVE" | "RESTED", attachedDon: DonInstance[] = []): CardInstance {
  return { instanceId, cardId: "OP01-001", state, attachedDon } as unknown as CardInstance;
}

function player(leader: CardInstance, characters: (CardInstance | null)[], donCostArea: DonInstance[]): PlayerState {
  return { leader, characters, stage: null, donCostArea } as unknown as PlayerState;
}

// End of the opponent's turn: a rested Leader with one DON!!, a rested
// Character with two, and one rested DON!! in the cost area.
const before = player(
  card("L", "RESTED", [don("d1", "ACTIVE", "L")]),
  [card("c0", "RESTED", [don("d2", "ACTIVE", "c0"), don("d3", "ACTIVE", "c0")])],
  [don("d4", "RESTED")],
);
// After the Refresh Phase: everything stands, the DON!! are in the cost area.
const after = player(
  card("L", "ACTIVE"),
  [card("c0", "ACTIVE")],
  ["d4", "d1", "d2", "d3"].map((id) => don(id, "ACTIVE")),
);

const refreshEnd: GameEvent = {
  type: "PHASE_CHANGED",
  playerIndex: 0,
  timestamp: 10,
  payload: { from: "REFRESH", to: "DRAW" },
};
const earlier: GameEvent = {
  type: "PHASE_CHANGED",
  playerIndex: 1,
  timestamp: 5,
  payload: { from: "MAIN", to: "END" },
};

const registry: ZonePositionRegistry = {
  register: () => {},
  unregister: () => {},
  getRect: (zoneKey) =>
    ({ left: zoneKey === "p-leader" ? 400 : 100, width: 112, top: 0, height: 112 }) as DOMRect,
  registerCard: () => {},
  unregisterCard: () => {},
  getCardZone: (id) => (id === "L" ? "p-leader" : id === "c0" ? "p-char-0" : null),
};

const probe: { view: RefreshWaveView | null } = { view: null };
function Probe({ eventLog, players }: { eventLog: GameEvent[]; players: PlayersByIndex }) {
  const result = useRefreshWave(eventLog, players, 0, registry);
  React.useLayoutEffect(() => {
    probe.view = result;
  });
  return null;
}

let renderer: ReactTestRenderer | null = null;
async function render(eventLog: GameEvent[], players: PlayersByIndex) {
  await act(async () => {
    const element = <Probe eventLog={eventLog} players={players} />;
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  probe.view = null;
  vi.useRealTimers();
});

describe("useRefreshWave", () => {
  it("does not replay history present on mount", async () => {
    await render([earlier, refreshEnd], [after, null]);
    expect(probe.view?.transitions).toEqual([]);
    expect(probe.view?.display(after)).toBe(after);
  });

  it("flies attached DON!! back, holds the board rested, then stands it up", async () => {
    await render([earlier], [before, null]);
    await render([earlier, refreshEnd], [after, null]);

    // One don-return flight per attached DON!!, 30ms apart, each passing
    // beneath the card it leaves.
    expect(probe.view?.transitions.map((t) => [t.kind, t.instanceId, t.targetInstanceId, t.fromZoneKey, t.toZoneKey, t.delay])).toEqual([
      ["don-return", "d1", "L", "p-leader", "p-don", 0],
      ["don-return", "d2", "c0", "p-char-0", "p-don", 0.03],
      ["don-return", "d3", "c0", "p-char-0", "p-don", 0.06],
    ]);
    expect(probe.view?.hiddenDonIds).toEqual(new Set(["d1", "d2", "d3"]));
    // Badges still count the DON!! that have not left yet.
    expect(probe.view?.donCountAdjustments).toEqual(new Map([["L", 1], ["c0", 2]]));
    // Everything that refreshed is drawn rested until the stand-up.
    const held = probe.view!.display(after)!;
    expect(held.leader.state).toBe("RESTED");
    expect(held.characters[0]?.state).toBe("RESTED");
    expect(held.donCostArea.map((d) => d.state)).toEqual(["RESTED", "RESTED", "RESTED", "RESTED"]);
    expect(probe.view?.standDelays).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(31);
    });
    // d1 and d2 have left: L shows 0 under it, c0 one.
    expect(probe.view?.donCountAdjustments).toEqual(new Map([["c0", 1]]));

    // A landed token reveals its DON!!.
    await act(async () => {
      probe.view!.removeTransition(probe.view!.transitions[0].id);
    });
    expect(probe.view?.hiddenDonIds).toEqual(new Set(["d2", "d3"]));

    // The stand-up waits for every returning DON!! to land, then a short gap.
    await act(async () => {
      for (const t of [...probe.view!.transitions]) probe.view!.removeTransition(t.id);
    });
    expect(probe.view?.hiddenDonIds).toBeNull();
    expect(probe.view?.display(after)?.leader.state).toBe("RESTED");
    await act(async () => {
      vi.advanceTimersByTime(refreshStandUp.gapMs);
    });
    expect(probe.view?.donCountAdjustments).toBeNull();
    expect(probe.view?.standDelays?.get("L")).toBe(0);
    // Left to right by x: c0 (100) first, then L (400); DON!! (no rect) last.
    expect(probe.view!.display(after)!.characters[0]?.state).toBe("ACTIVE");
    expect(probe.view!.display(after)!.leader.state).toBe("RESTED");
    const stagger = planRefreshWave(3, 6).standStaggerMs;
    await act(async () => {
      vi.advanceTimersByTime(stagger);
    });
    expect(probe.view!.display(after)!.leader.state).toBe("ACTIVE");
    expect(probe.view!.display(after)!.donCostArea.map((d) => d.state)).toEqual([
      "RESTED", "RESTED", "RESTED", "RESTED",
    ]);
    await act(async () => {
      vi.advanceTimersByTime(stagger * 4 + 400);
    });
    expect(probe.view?.display(after)).toBe(after);
    expect(probe.view?.standDelays).toBeNull();
  });

  it("stands up on the refresh beat when no DON!! were attached", async () => {
    const restedOnly = player(card("L", "RESTED"), [], []);
    const refreshed = player(card("L", "ACTIVE"), [], []);
    await render([earlier], [restedOnly, null]);
    await render([earlier, refreshEnd], [refreshed, null]);
    expect(probe.view?.transitions).toEqual([]);
    expect(probe.view?.display(refreshed)?.leader.state).toBe("RESTED");
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(probe.view?.display(refreshed)).toBe(refreshed);
  });

  it("ignores updates that do not end a Refresh Phase", async () => {
    await render([earlier], [before, null]);
    const other: GameEvent = { ...earlier, timestamp: 11 };
    await render([earlier, other], [after, null]);
    expect(probe.view?.transitions).toEqual([]);
    expect(probe.view?.display(after)).toBe(after);
  });
});

describe("holdRested", () => {
  it("draws only the held cards and DON!! rested", () => {
    const shown = holdRested(after, new Set(["L", "d4"]));
    expect(shown.leader.state).toBe("RESTED");
    expect(shown.characters[0]?.state).toBe("ACTIVE");
    expect(shown.donCostArea.map((d) => d.state)).toEqual(["RESTED", "ACTIVE", "ACTIVE", "ACTIVE"]);
  });
});
