import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import type { CardInstance, GameEvent, LifeCard } from "@shared/game-types";
import { FLIP_SECONDS } from "@/lib/game/card-motion";
import {
  receivedHandsByPlayerIndex,
  useCardTransitions,
  type CardTransition,
} from "./use-card-transitions";

// Hook-level coverage for OPT-1054: the flip assignment, the concurrency
// cap and the Life face lookup all happen inside the hook's event effect.

function handCard(instanceId: string, cardId: string): CardInstance {
  return {
    instanceId,
    cardId,
    owner: 0,
    controller: 0,
    zone: "HAND",
    attachedDon: [],
  } as unknown as CardInstance;
}

function draw(timestamp: number, instanceId: string): GameEvent {
  return {
    type: "CARD_DRAWN",
    playerIndex: 0,
    timestamp,
    payload: { cardId: "OP01-001", cardInstanceId: instanceId },
  } as unknown as GameEvent;
}

interface ProbeProps {
  eventLog: GameEvent[];
  hand: CardInstance[];
  life?: LifeCard[];
}

function Probe({ eventLog, hand, life }: ProbeProps) {
  const receivedHands = receivedHandsByPlayerIndex(hand, [], 0);
  const { transitions } = useCardTransitions(
    eventLog,
    0,
    false,
    null,
    null,
    receivedHands,
    life,
  );
  return <output>{JSON.stringify(transitions)}</output>;
}

let renderer: ReactTestRenderer | null = null;
async function render(props: ProbeProps) {
  await act(async () => {
    if (renderer) renderer.update(<Probe {...props} />);
    else renderer = create(<Probe {...props} />);
    await Promise.resolve();
  });
  latest = JSON.parse(
    renderer!.root.findByType("output").children.join("") || "[]",
  ) as CardTransition[];
}

let latest: CardTransition[] = [];
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  latest = [];
});

describe("useCardTransitions flips (OPT-1054)", () => {
  it("flips only the top card of a multi-card draw", async () => {
    await render({ eventLog: [], hand: [] });
    const hand = [handCard("d-1", "OP01-001"), handCard("d-2", "OP01-002")];
    await render({ eventLog: [draw(1, "d-1"), draw(2, "d-2")], hand });
    expect(latest.map((t) => t.flip)).toEqual(["turn", "under"]);
    expect(latest[1].pileFlipAt).toBeCloseTo(
      (latest[0].delay ?? 0) + FLIP_SECONDS,
    );
  });

  it("keeps the flipping top card when a big draw hits the cap", async () => {
    await render({ eventLog: [], hand: [] });
    const ids = Array.from({ length: 10 }, (_, i) => `big-${i}`);
    const hand = ids.map((id) => handCard(id, "OP01-001"));
    await render({ eventLog: ids.map((id, i) => draw(i + 1, id)), hand });
    expect(latest).toHaveLength(8);
    expect(latest.filter((t) => t.flip === "turn")).toHaveLength(1);
    expect(latest[0].flip).toBe("turn");
    for (const t of latest.slice(1)) {
      expect(t.flip).toBe("under");
      expect(t.pileFlipAt).toBeCloseTo((latest[0].delay ?? 0) + FLIP_SECONDS);
    }
  });

  it.each([
    ["UP", false, undefined],
    ["DOWN", true, "turn"],
  ] as const)(
    "reads a %s Life card's side from the Life zone it left",
    async (face, sourceFaceDown, flip) => {
      const lifeCard: LifeCard = { instanceId: "life-1", cardId: "OP01-003", face };
      await render({ eventLog: [], hand: [], life: [lifeCard] });
      await render({
        eventLog: [
          {
            type: "CARD_ADDED_TO_HAND_FROM_LIFE",
            playerIndex: 0,
            timestamp: 1,
            payload: { cardId: "OP01-003", cardInstanceId: "life-1" },
          } as unknown as GameEvent,
        ],
        // The same update removes the card from Life.
        hand: [handCard("life-1", "OP01-003")],
        life: [],
      });
      expect(latest).toHaveLength(1);
      expect(latest[0].sourceFaceDown).toBe(sourceFaceDown);
      expect(latest[0].flip).toBe(flip);
    },
  );
});
