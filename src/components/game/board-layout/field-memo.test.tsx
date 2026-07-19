import React, { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardDb, CardInstance, PlayerState } from "@shared/game-types";
import { useFieldArrivals } from "@/hooks/use-field-arrivals";
import type { DragPayload } from "./constants";
import { OpponentField } from "./opponent-field";
import { PlayerField } from "./player-field";

vi.mock("@/hooks/use-field-arrivals", () => ({
  useFieldArrivals: vi.fn(() => new Set<string>()),
}));

vi.mock("../card", () => ({ Card: () => null }));
vi.mock("./deck-pile", () => ({ DeckPile: () => null }));
vi.mock("./don-zone", () => ({ DonZone: () => null }));
vi.mock("./drop-zones", () => ({
  DroppableCharSlot: () => null,
  DroppableOwnField: () => null,
  DroppableStageZone: () => null,
}));
vi.mock("./empty-slot", () => ({ EmptySlot: () => null }));
vi.mock("./field-card", () => ({
  OpponentFieldCard: () => null,
  PlayerFieldCard: ({
    card,
    selected,
    onSelect,
  }: {
    card: CardInstance;
    selected?: boolean;
    onSelect?: () => void;
  }) => (
    <button
      data-testid={`field-card-${card.instanceId}`}
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
    />
  ),
}));
vi.mock("./life-zone", () => ({ LifeZone: () => null }));
vi.mock("./trash-zone", () => ({ DroppableTrashZone: () => null }));
vi.mock("./zone-ref", () => ({ ZoneRef: () => null }));

const cardDb = {
  "OP01-001": {
    type: "Character",
    keywords: { blocker: true },
  },
} as unknown as CardDb;
const onAction = vi.fn();
const onOpponentPreview = vi.fn();
const onPlayerPreview = vi.fn();

const blocker = {
  instanceId: "blocker-1",
  cardId: "OP01-001",
  zone: "CHARACTER",
  state: "ACTIVE",
  attachedDon: [],
  turnPlayed: null,
  controller: 0,
  owner: 0,
} as CardInstance;

const player = {
  characters: [blocker, null, null, null, null],
  stage: null,
  donCostArea: [],
  hand: [],
  deck: [],
  trash: [],
  donDeck: [],
  life: [],
  removedFromGame: [],
  connected: true,
  awayReason: null,
  rejoinDeadlineAt: null,
  sleeveUrl: null,
  donArtUrl: null,
} as unknown as PlayerState;

function OpponentHarness() {
  const [, setUnrelatedState] = useState(0);
  const [winnerPulseIds, setWinnerPulseIds] = useState<Set<string>>(
    () => new Set(),
  );

  return (
    <>
      <button
        data-testid="opponent-unrelated"
        onClick={() => setUnrelatedState((value) => value + 1)}
      />
      <button
        data-testid="opponent-pulse"
        onClick={() => setWinnerPulseIds(new Set(["winner-1"]))}
      />
      <OpponentField
        opp={null}
        cardDb={cardDb}
        activeDragType={null}
        refreshWave={false}
        onPreviewZone={onOpponentPreview}
        winnerPulseIds={winnerPulseIds}
      />
    </>
  );
}

const handDrag = {
  type: "hand-card",
  card: {
    instanceId: "hand-1",
    cardId: "OP01-001",
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  },
} as DragPayload;

function PlayerHarness() {
  const [, setUnrelatedState] = useState(0);
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(
    null,
  );

  return (
    <>
      <button
        data-testid="player-unrelated"
        onClick={() => setUnrelatedState((value) => value + 1)}
      />
      <button
        data-testid="player-drag"
        onClick={() => setActiveDrag(handDrag)}
      />
      <PlayerField
        me={player}
        cardDb={cardDb}
        activeDragType={activeDrag?.type ?? null}
        activeDrag={activeDrag}
        refreshWave={false}
        canInteract={false}
        canActivateMain={false}
        canDragCounter={false}
        inBlockStep
        selectedBlockerId={selectedBlockerId}
        setSelectedBlockerId={setSelectedBlockerId}
        onAction={onAction}
        onPreviewZone={onPlayerPreview}
      />
    </>
  );
}

let renderer: ReactTestRenderer | null = null;

function renderHarness(element: React.ReactElement): ReactTestRenderer {
  let mounted: ReactTestRenderer | null = null;
  act(() => {
    mounted = create(element);
    renderer = mounted;
  });
  if (!mounted) throw new Error("Field harness did not mount");
  return mounted;
}

beforeEach(() => {
  vi.mocked(useFieldArrivals).mockClear();
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("field memo boundaries", () => {
  it("skips an unrelated parent render but preserves opponent pulse updates", () => {
    const mounted = renderHarness(<OpponentHarness />);
    expect(useFieldArrivals).toHaveBeenCalledTimes(1);

    const unrelatedControl = mounted.root.findByProps({
      "data-testid": "opponent-unrelated",
    });
    const pulseControl = mounted.root.findByProps({
      "data-testid": "opponent-pulse",
    });

    act(() => unrelatedControl.props.onClick());
    expect(useFieldArrivals).toHaveBeenCalledTimes(1);

    act(() => pulseControl.props.onClick());
    expect(useFieldArrivals).toHaveBeenCalledTimes(2);
  });

  it("skips an unrelated parent render but preserves player drag updates", () => {
    const mounted = renderHarness(<PlayerHarness />);
    expect(useFieldArrivals).toHaveBeenCalledTimes(1);

    const unrelatedControl = mounted.root.findByProps({
      "data-testid": "player-unrelated",
    });
    const dragControl = mounted.root.findByProps({
      "data-testid": "player-drag",
    });

    act(() => unrelatedControl.props.onClick());
    expect(useFieldArrivals).toHaveBeenCalledTimes(1);

    act(() => dragControl.props.onClick());
    expect(useFieldArrivals).toHaveBeenCalledTimes(2);
  });

  it("re-renders the player field when blocker selection changes", () => {
    const mounted = renderHarness(<PlayerHarness />);
    const blockerControl = mounted.root.findByProps({
      "data-testid": "field-card-blocker-1",
    });
    expect(blockerControl.props["data-selected"]).toBe("false");

    act(() => blockerControl.props.onClick());

    expect(useFieldArrivals).toHaveBeenCalledTimes(2);
    expect(
      mounted.root.findByProps({
        "data-testid": "field-card-blocker-1",
      }).props["data-selected"],
    ).toBe("true");
  });
});
