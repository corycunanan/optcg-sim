import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardInstance, PlayerState } from "@shared/game-types";
import { BoardLayout, type BoardLayoutProps } from "./board-layout";

vi.mock("@/components/ui", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./field-card", () => ({
  PlayerFieldCard: ({
    card,
    zoneKey,
  }: {
    card: CardInstance;
    zoneKey: string;
  }) =>
    React.createElement("div", {
      "data-field": "bottom",
      "data-instance-id": card.instanceId,
      "data-zone-key": zoneKey,
    }),
  OpponentFieldCard: ({
    card,
    zoneKey,
  }: {
    card: CardInstance;
    zoneKey: string;
  }) =>
    React.createElement("div", {
      "data-field": "top",
      "data-instance-id": card.instanceId,
      "data-zone-key": zoneKey,
    }),
}));

vi.mock("./life-zone", () => ({
  LifeZone: ({
    life,
    zoneKey,
  }: {
    life: PlayerState["life"];
    zoneKey: string;
  }) =>
    React.createElement("div", {
      "data-life-instance-ids": life
        .map((card) => card.instanceId)
        .join(","),
      "data-life-zone-key": zoneKey,
    }),
}));

vi.mock("./hand-layer", () => ({ HandLayer: () => null }));
vi.mock("./deck-pile", () => ({ DeckPile: () => null }));
vi.mock("./don-zone", () => ({ DonZone: () => null }));
vi.mock("./trash-zone", () => ({ DroppableTrashZone: () => null }));
vi.mock("./drop-zones", () => ({
  DroppableCharSlot: () => null,
  DroppableOwnField: () => null,
  DroppableStageZone: () => null,
}));
vi.mock("./empty-slot", () => ({ EmptySlot: () => null }));
vi.mock("./zone-ref", () => ({ ZoneRef: () => null }));
vi.mock("./board-navbar", () => ({ BoardNavbar: () => null }));
vi.mock("./mid-zone", () => ({
  MidZone: ({
    activePrompt,
    canUndo,
    onAction,
  }: {
    activePrompt: { promptType: string } | null;
    canUndo: boolean;
    onAction: (action: { type: "PASS" }) => void;
  }) =>
    React.createElement("button", {
      "data-testid": "mid-zone",
      "data-active-prompt": activePrompt?.promptType ?? "none",
      "data-can-undo": String(canUndo),
      onClick: () => onAction({ type: "PASS" }),
    }),
}));
vi.mock("./board-modals", () => ({
  BoardModals: ({
    activePrompt,
  }: {
    activePrompt: { promptType: string } | null;
  }) =>
    React.createElement("div", {
      "data-testid": "board-modals",
      "data-active-prompt": activePrompt?.promptType ?? "none",
    }),
}));
vi.mock("./board-drag-overlay", () => ({ BoardDragOverlay: () => null }));
vi.mock("./card-animation-layer", () => ({ CardAnimationLayer: () => null }));
vi.mock("../spotlight-overlay", () => ({ SpotlightOverlay: () => null }));

function makeCard(playerIndex: 0 | 1, role: "leader" | "character"): CardInstance {
  return {
    instanceId: `player-${playerIndex}-${role}`,
    cardId: `TEST-${playerIndex}-${role}`,
    zone: role === "leader" ? "LEADER" : "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: playerIndex,
    owner: playerIndex,
  };
}

function makePlayer(playerIndex: 0 | 1): PlayerState {
  return {
    playerId: `player-${playerIndex}`,
    leader: makeCard(playerIndex, "leader"),
    characters: [makeCard(playerIndex, "character"), null, null, null, null],
    stage: null,
    donCostArea: [],
    hand: [],
    deck: [],
    trash: [],
    donDeck: [],
    life: Array.from({ length: playerIndex + 1 }, (_, index) => ({
      instanceId: `player-${playerIndex}-life-${index}`,
      cardId: `TEST-${playerIndex}-life-${index}`,
      face: "DOWN" as const,
    })),
    removedFromGame: [],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: null,
    donArtUrl: null,
  };
}

const players = [makePlayer(0), makePlayer(1)] as const;
const baseProps = {
  me: players[0],
  opp: players[1],
  myIndex: 0,
  turn: null,
  cardDb: {},
  isMyTurn: false,
  battlePhase: null,
  connectionStatus: "connected",
  eventLog: [],
  activeEffects: [],
  activePrompt: null,
  activePromptId: null,
  onAction: () => {},
  onLeave: () => {},
  matchClosed: false,
  canUndo: false,
  interactionMode: "spectator",
  viewportSize: { width: 1920, height: 1080 },
  outerScale: 1,
} satisfies Omit<BoardLayoutProps, "bottomPlayerIndex">;

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

function renderComposition(
  bottomPlayerIndex: 0 | 1,
  overrides: Partial<BoardLayoutProps> = {},
) {
  act(() => {
    renderer = create(
      React.createElement(BoardLayout, {
        ...baseProps,
        ...overrides,
        bottomPlayerIndex,
      }),
    );
  });
  if (!renderer) throw new Error("BoardLayout renderer did not mount");

  return {
    bottomCardIds: renderer.root
      .findAllByProps({ "data-field": "bottom" })
      .map((node) => node.props["data-instance-id"])
      .sort(),
    topCardIds: renderer.root
      .findAllByProps({ "data-field": "top" })
      .map((node) => node.props["data-instance-id"])
      .sort(),
    bottomLife: renderer.root.findByProps({ "data-life-zone-key": "p-life" }),
    topLife: renderer.root.findByProps({ "data-life-zone-key": "o-life" }),
  };
}

describe("BoardLayout bottom-player perspective", () => {
  it("swaps rendered field content and zone keys when the anchor changes", () => {
    const player0Bottom = renderComposition(0);
    expect(player0Bottom.bottomCardIds).toEqual([
      "player-0-character",
      "player-0-leader",
    ]);
    expect(player0Bottom.topCardIds).toEqual([
      "player-1-character",
      "player-1-leader",
    ]);
    expect(player0Bottom.bottomLife.props["data-life-instance-ids"]).toBe(
      "player-0-life-0",
    );
    expect(player0Bottom.topLife.props["data-life-instance-ids"]).toBe(
      "player-1-life-0,player-1-life-1",
    );

    act(() => renderer?.unmount());
    renderer = null;

    const player1Bottom = renderComposition(1);
    expect(player1Bottom.bottomCardIds).toEqual([
      "player-1-character",
      "player-1-leader",
    ]);
    expect(player1Bottom.topCardIds).toEqual([
      "player-0-character",
      "player-0-leader",
    ]);
    expect(player1Bottom.bottomLife.props["data-life-instance-ids"]).toBe(
      "player-1-life-0,player-1-life-1",
    );
    expect(player1Bottom.topLife.props["data-life-instance-ids"]).toBe(
      "player-0-life-0",
    );
  });

  it("removes spectator prompt and mid-zone action affordances", () => {
    const onAction = vi.fn();
    renderComposition(0, {
      onAction,
      canUndo: true,
      activePrompt: {
        promptType: "OPTIONAL_EFFECT",
        effectDescription: "Use the optional effect?",
      },
    });

    expect(
      renderer!.root.findByProps({ "data-testid": "mid-zone" }).props,
    ).toMatchObject({
      "data-active-prompt": "none",
      "data-can-undo": "false",
    });
    expect(
      renderer!.root.findByProps({ "data-testid": "board-modals" }).props[
        "data-active-prompt"
      ],
    ).toBe("none");

    act(() => {
      renderer!.root.findByProps({ "data-testid": "mid-zone" }).props.onClick();
    });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("keeps response-only sandbox prompts available while suppressing non-prompt affordances", () => {
    const onAction = vi.fn();
    renderComposition(0, {
      interactionMode: "responseOnly",
      onAction,
      canUndo: true,
      activePrompt: {
        promptType: "OPTIONAL_EFFECT",
        effectDescription: "Use the optional effect?",
      },
    });

    expect(
      renderer!.root.findByProps({ "data-testid": "mid-zone" }).props,
    ).toMatchObject({
      "data-active-prompt": "OPTIONAL_EFFECT",
      "data-can-undo": "false",
    });
    expect(
      renderer!.root.findByProps({ "data-testid": "board-modals" }).props[
        "data-active-prompt"
      ],
    ).toBe("OPTIONAL_EFFECT");

    act(() => {
      renderer!.root.findByProps({ "data-testid": "mid-zone" }).props.onClick();
    });
    expect(onAction).toHaveBeenCalledWith({ type: "PASS" });
  });
});

