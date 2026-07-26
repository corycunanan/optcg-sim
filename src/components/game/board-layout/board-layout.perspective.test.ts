import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardInstance, PlayerState } from "@shared/game-types";
import { BoardLayout, type BoardLayoutProps } from "./board-layout";

vi.mock("@/components/ui", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./use-battle-state", () => ({
  useBattleState: () => ({
    battle: null,
    battleInfo: null,
    canDragCounter: true,
    canEndPhase: true,
    canInteract: true,
    canPass: true,
    inBattle: false,
    inBlockStep: true,
    isDefender: false,
    phase: "MAIN",
    selectedBlockerId: null,
    setSelectedBlockerId: vi.fn(),
  }),
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

vi.mock("./player-field", () => ({
  PlayerField: ({
    me,
    canInteract,
    canActivateMain,
    canDragCounter,
    inBlockStep,
  }: {
    me: PlayerState | null;
    canInteract: boolean;
    canActivateMain: boolean;
    canDragCounter: boolean;
    inBlockStep: boolean;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement("div", {
        "data-testid": "player-field",
        "data-can-interact": String(canInteract),
        "data-can-activate-main": String(canActivateMain),
        "data-can-drag-counter": String(canDragCounter),
        "data-in-block-step": String(inBlockStep),
      }),
      React.createElement("div", {
        "data-life-instance-ids": (me?.life ?? [])
          .map((card) => card.instanceId)
          .join(","),
        "data-life-zone-key": "p-life",
      }),
      ...[me?.leader, ...(me?.characters ?? [])]
        .filter((card): card is CardInstance => !!card)
        .map((card) =>
          React.createElement("div", {
            key: card.instanceId,
            "data-field": "bottom",
            "data-instance-id": card.instanceId,
          }),
        ),
    ),
}));

vi.mock("./hand-layer", () => ({
  HandLayer: ({
    cards,
    zoneKey,
    enableDrag,
  }: {
    cards: CardInstance[];
    zoneKey: string;
    enableDrag?: boolean;
  }) =>
    React.createElement("div", {
      "data-hand-zone-key": zoneKey,
      "data-hand-card-ids": cards.map((card) => card.cardId).join(","),
      "data-hand-instance-ids": cards
        .map((card) => card.instanceId)
        .join(","),
      "data-hand-drag-enabled": String(!!enableDrag),
    }),
}));
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
vi.mock("./board-navbar", () => ({
  BoardNavbar: ({ onConcede }: { onConcede: () => void }) =>
    React.createElement("button", {
      "data-testid": "navbar-concede-probe",
      onClick: onConcede,
    }),
}));
vi.mock("./mid-zone", () => ({
  MidZone: ({
    activePrompt,
    blockerMode,
    canEndPhase,
    canPass,
    canUndo,
    onAction,
  }: {
    activePrompt: { promptType: string } | null;
    blockerMode?: unknown;
    canEndPhase: boolean;
    canPass: boolean;
    canUndo: boolean;
    onAction: (action: { type: "PASS" }) => void;
  }) =>
    React.createElement("button", {
      "data-testid": "mid-zone",
      "data-active-prompt": activePrompt?.promptType ?? "none",
      "data-blocker-mode": String(!!blockerMode),
      "data-can-end-phase": String(canEndPhase),
      "data-can-pass": String(canPass),
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
vi.mock("./board-drag-overlay", () => ({
  BoardDragOverlay: () =>
    React.createElement("div", { "data-testid": "board-drag-overlay" }),
}));
vi.mock("./card-animation-layer", () => ({ CardAnimationLayer: () => null }));
vi.mock("../spotlight-overlay", () => ({
  SpotlightOverlay: () =>
    React.createElement("div", { "data-testid": "spotlight-overlay" }),
}));

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

function makeHandCard(
  playerIndex: 0 | 1,
  instanceId: string,
  cardId: string,
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: playerIndex,
    owner: playerIndex,
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

  it("suppresses every ordinary spectator affordance regardless of board anchor", () => {
    for (const bottomPlayerIndex of [0, 1] as const) {
      renderComposition(bottomPlayerIndex, { canUndo: true });

      expect(
        renderer!.root.findByProps({ "data-testid": "mid-zone" }).props,
      ).toMatchObject({
        "data-blocker-mode": "false",
        "data-can-end-phase": "false",
        "data-can-pass": "false",
        "data-can-undo": "false",
      });
      expect(
        renderer!.root.findByProps({ "data-testid": "player-field" }).props,
      ).toMatchObject({
        "data-can-interact": "false",
        "data-can-activate-main": "false",
        "data-can-drag-counter": "false",
        "data-in-block-step": "false",
      });

      act(() => renderer?.unmount());
      renderer = null;
    }
  });

  it("passes both spectator hands through in received order for either anchor", () => {
    const player0 = {
      ...players[0],
      hand: [
        makeHandCard(0, "p0-hand-a", "OP01-001"),
        makeHandCard(0, "p0-hand-b", "OP01-002"),
      ],
    };
    const player1 = {
      ...players[1],
      hand: [
        makeHandCard(1, "p1-hand-a", "OP02-001"),
        makeHandCard(1, "p1-hand-b", "OP02-002"),
      ],
    };

    for (const bottomPlayerIndex of [0, 1] as const) {
      renderComposition(bottomPlayerIndex, {
        me: player0,
        opp: player1,
        myIndex: null,
      });

      const bottomHand = renderer!.root.findByProps({
        "data-hand-zone-key": "p-hand",
      });
      const topHand = renderer!.root.findByProps({
        "data-hand-zone-key": "o-hand",
      });
      const expectedBottom = bottomPlayerIndex === 0 ? player0 : player1;
      const expectedTop = bottomPlayerIndex === 0 ? player1 : player0;

      expect(bottomHand.props["data-hand-card-ids"]).toBe(
        expectedBottom.hand.map((card) => card.cardId).join(","),
      );
      expect(bottomHand.props["data-hand-instance-ids"]).toBe(
        expectedBottom.hand.map((card) => card.instanceId).join(","),
      );
      expect(topHand.props["data-hand-card-ids"]).toBe(
        expectedTop.hand.map((card) => card.cardId).join(","),
      );
      expect(topHand.props["data-hand-instance-ids"]).toBe(
        expectedTop.hand.map((card) => card.instanceId).join(","),
      );
      expect(bottomHand.props["data-hand-drag-enabled"]).toBe("false");
      expect(topHand.props["data-hand-drag-enabled"]).toBe("false");

      act(() => renderer?.unmount());
      renderer = null;
    }
  });

  it("preserves the seated player real/hidden hand projection", () => {
    const player0 = {
      ...players[0],
      hand: [makeHandCard(0, "p0-hand", "OP01-001")],
    };
    const player1 = {
      ...players[1],
      hand: [makeHandCard(1, "hidden-1-hand-0", "hidden")],
    };

    renderComposition(0, {
      me: player0,
      opp: player1,
      myIndex: 0,
      interactionMode: "full",
    });

    expect(
      renderer!.root.findByProps({ "data-hand-zone-key": "p-hand" }).props[
        "data-hand-card-ids"
      ],
    ).toBe("OP01-001");
    expect(
      renderer!.root.findByProps({ "data-hand-zone-key": "o-hand" }).props[
        "data-hand-card-ids"
      ],
    ).toBe("hidden");
  });

  it("preserves every ordinary affordance in full interaction mode", () => {
    renderComposition(0, { interactionMode: "full", canUndo: true });

    expect(
      renderer!.root.findByProps({ "data-testid": "mid-zone" }).props,
    ).toMatchObject({
      "data-blocker-mode": "true",
      "data-can-end-phase": "true",
      "data-can-pass": "true",
      "data-can-undo": "true",
    });
    expect(
      renderer!.root.findByProps({ "data-testid": "player-field" }).props,
    ).toMatchObject({
      "data-can-interact": "true",
      "data-can-activate-main": "true",
      "data-can-drag-counter": "true",
      "data-in-block-step": "true",
    });
  });

  it("routes Concede through the spectator dispatch guard", () => {
    const onAction = vi.fn();
    renderComposition(0, { onAction });

    act(() => {
      renderer!.root
        .findByProps({ "data-testid": "navbar-concede-probe" })
        .props.onClick();
    });

    expect(onAction).not.toHaveBeenCalled();
  });

  it("preserves Concede dispatch in full interaction mode", () => {
    const onAction = vi.fn();
    renderComposition(0, { interactionMode: "full", onAction });

    act(() => {
      renderer!.root
        .findByProps({ "data-testid": "navbar-concede-probe" })
        .props.onClick();
    });

    expect(onAction).toHaveBeenCalledWith({ type: "CONCEDE" });
  });

  it("blocks the spectator prompt modal at the board routing choke point", () => {
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
      renderer!.root.findAllByProps({ "data-testid": "board-modals" }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ "data-testid": "spotlight-overlay" }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ "data-testid": "board-drag-overlay" }),
    ).toHaveLength(0);

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
    expect(
      renderer!.root.findAllByProps({ "data-testid": "spotlight-overlay" }),
    ).toHaveLength(1);
    expect(
      renderer!.root.findAllByProps({ "data-testid": "board-drag-overlay" }),
    ).toHaveLength(1);

    act(() => {
      renderer!.root.findByProps({ "data-testid": "mid-zone" }).props.onClick();
    });
    expect(onAction).toHaveBeenCalledWith({ type: "PASS" });
  });
});
