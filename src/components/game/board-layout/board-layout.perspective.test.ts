import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
  PlayerState,
  ServerMessage,
} from "@shared/game-types";
import { mintGameToken } from "@/lib/game/token";
import {
  CARDS,
  createTestPayload,
} from "@engine/__tests__/factories.js";
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

class WatchThroughSocket {
  readonly sent: string[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];
  private attachment: unknown;

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class WatchThroughDurableObjectState {
  private readonly data = new Map<string, unknown>();
  private readonly sockets: WebSocket[] = [];
  private readonly tags = new Map<WebSocket, string[]>();

  readonly storage = {
    get: async <T,>(key: string): Promise<T | undefined> =>
      this.data.get(key) as T | undefined,
    put: async (
      keyOrEntries: string | Record<string, unknown>,
      value?: unknown,
    ): Promise<void> => {
      if (typeof keyOrEntries === "string") {
        this.data.set(keyOrEntries, value);
        return;
      }
      for (const [key, entry] of Object.entries(keyOrEntries)) {
        this.data.set(key, entry);
      }
    },
    setAlarm: vi.fn(async (): Promise<void> => undefined),
    deleteAlarm: vi.fn(async (): Promise<void> => undefined),
  };

  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    this.sockets.push(ws);
    this.tags.set(ws, tags ?? []);
  }

  getWebSockets(tag?: string): WebSocket[] {
    return tag
      ? this.sockets.filter((socket) => this.tags.get(socket)?.includes(tag))
      : this.sockets;
  }

  getTags(ws: WebSocket): string[] {
    return this.tags.get(ws) ?? [];
  }
}

class WatchThroughResponse {
  readonly status: number;
  readonly webSocket: unknown;
  private readonly body: BodyInit | null;

  constructor(
    body: BodyInit | null = null,
    init: ResponseInit & { webSocket?: unknown } = {},
  ) {
    this.body = body;
    this.status = init.status ?? 200;
    this.webSocket = init.webSocket;
  }

  async text(): Promise<string> {
    return this.body === null ? "" : String(this.body);
  }
}

type WatchThroughTransport = {
  accept(playerIndex: 0 | 1, ws: WebSocket): void;
  broadcast(message: ServerMessage): void;
  scheduleDisconnect(playerIndex: 0 | 1): void;
};

type WatchThroughSession = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  transport: WatchThroughTransport;
  fetch(request: Request): Promise<Response>;
  webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void>;
  webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void>;
};

type SpectatorWatch = {
  socket: WatchThroughSocket;
  cursor: number;
  currentState: GameState | null;
};

function parseWatchMessages(socket: WatchThroughSocket): ServerMessage[] {
  return socket.sent.map((payload) => JSON.parse(payload) as ServerMessage);
}

function assertSpectatorInformationAndAffordanceInvariants(
  state: GameState,
  cardDb: Map<string, CardData>,
): void {
  for (const [playerIndex, player] of state.players.entries()) {
    expect(player.hand.every((card) => card.cardId !== "hidden")).toBe(true);
    expect(
      player.hand.every((card) => !card.instanceId.startsWith("hidden-")),
    ).toBe(true);
    expect(player.deck.every((card) => card.cardId === "hidden")).toBe(true);
    expect(player.deck.map((card) => card.instanceId)).toEqual(
      player.deck.map(
        (_, index) => `hidden-${playerIndex}-deck-${index}`,
      ),
    );
    for (const [lifeIndex, card] of player.life.entries()) {
      if (card.face !== "DOWN") continue;
      expect(card).toMatchObject({
        cardId: "hidden",
        instanceId: `hidden-${playerIndex}-life-${lifeIndex}`,
      });
    }
  }

  const deckIds = state.players.flatMap((player) =>
    player.deck.map((card) => card.instanceId),
  );
  expect(new Set(deckIds).size).toBe(deckIds.length);

  const onAction = vi.fn();
  renderComposition(0, {
    me: state.players[0],
    opp: state.players[1],
    myIndex: null,
    turn: state.turn,
    cardDb: Object.fromEntries(cardDb),
    isMyTurn: false,
    battlePhase: state.turn.battleSubPhase,
    eventLog: state.eventLog,
    activeEffects: state.activeEffects,
    effectAvailability: state.effectAvailability,
    activePrompt: state.pendingPrompt?.options ?? null,
    activePromptId: state.pendingPrompt?.promptId ?? null,
    promptRespondingPlayer:
      state.promptRespondingPlayer ??
      state.pendingPrompt?.respondingPlayer ??
      null,
    onAction,
    matchClosed: state.status !== "IN_PROGRESS",
    canUndo: true,
    interactionMode: "spectator",
  });

  expect(
    renderer!.root.findByProps({ "data-testid": "mid-zone" }).props,
  ).toMatchObject({
    "data-active-prompt": "none",
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
    renderer!.root
      .findByProps({ "data-testid": "navbar-concede-probe" })
      .props.onClick();
    renderer!.root.findByProps({ "data-testid": "mid-zone" }).props.onClick();
  });
  expect(onAction).not.toHaveBeenCalled();

  // OPT-575 deliberately tracks target-selection keyboard handlers and ARIA
  // semantics that bypass today's suppression contract; do not assert them here.
  act(() => renderer?.unmount());
  renderer = null;
}

function consumeAndAssertSpectatorStates(
  watch: SpectatorWatch,
  cardDb: Map<string, CardData>,
  expectState = true,
): GameState | null {
  const messages = parseWatchMessages(watch.socket).slice(watch.cursor);
  watch.cursor += messages.length;
  const states = messages.flatMap((message) =>
    message.type === "game:state" || message.type === "game:update"
      ? [message.state]
      : [],
  );
  if (expectState) expect(states.length).toBeGreaterThan(0);
  for (const state of states) {
    assertSpectatorInformationAndAffordanceInvariants(state, cardDb);
    watch.currentState = state;
  }
  return watch.currentState;
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

describe("OPT-566 full spectated-game watch-through", () => {
  it("watches pregame through game over with production admission, exact bootstrap parity, and invariant-safe real UI states", async () => {
    const sessionPath = "../../../../workers/game/src/GameSession.ts";
    const transportPath = "../../../../workers/game/src/session/transport.ts";
    const { GameSession } = (await import(
      /* @vite-ignore */ sessionPath
    )) as {
      GameSession: new (state: unknown, env: unknown) => unknown;
    };
    const {
      SPECTATOR_GAME_ENDED_CLOSE_CODE,
      SPECTATOR_GAME_ENDED_CLOSE_REASON,
    } = (await import(/* @vite-ignore */ transportPath)) as {
      SPECTATOR_GAME_ENDED_CLOSE_CODE: number;
      SPECTATOR_GAME_ENDED_CLOSE_REASON: string;
    };

    let latestPair: [WatchThroughSocket, WatchThroughSocket] | null = null;
    vi.stubGlobal("Response", WatchThroughResponse);
    vi.stubGlobal(
      "WebSocketPair",
      function Pair(this: Record<number, WatchThroughSocket>) {
        latestPair = [new WatchThroughSocket(), new WatchThroughSocket()];
        this[0] = latestPair[0];
        this[1] = latestPair[1];
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    const durableState = new WatchThroughDurableObjectState();
    const session = new GameSession(durableState, {
      GAME_WORKER_SECRET: "watch-through-secret",
      NEXTJS_URL: "https://app.example.test",
    }) as WatchThroughSession;
    const payload = createTestPayload();
    payload.testPriorityRolls = [6, 1];
    payload.player2.testOrder = {
      ...payload.player2.testOrder!,
      life: [
        CARDS.VANILLA.id,
        CARDS.VANILLA.id,
        CARDS.VANILLA.id,
        CARDS.VANILLA.id,
        CARDS.TRIGGER.id,
      ],
    };

    const initResponse = await session.fetch(
      new Request(`https://worker.example.test/game/${payload.gameId}/init`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(initResponse.status).toBe(200);
    expect(session.gameState.pregame?.phase).toBe("PRIORITY_CHOICE");

    const playerSockets = [
      new WatchThroughSocket(),
      new WatchThroughSocket(),
    ] as const;
    session.transport.accept(
      0,
      playerSockets[0] as unknown as WebSocket,
    );
    session.transport.accept(
      1,
      playerSockets[1] as unknown as WebSocket,
    );

    let spectatorJti = 0;
    const productionUpgrade = async (
      userId: string,
      displayName: string,
    ): Promise<WatchThroughSocket> => {
      const token = await mintGameToken(userId, "watch-through-secret", {
        gameId: session.gameState.id,
        jti: `watch-through-${spectatorJti++}`,
        role: "spectator",
        spectatorDisplayName: displayName,
      });
      latestPair = null;
      const response = await session.fetch(
        new Request(
          `https://worker.example.test/game/${session.gameState.id}/ws?token=${encodeURIComponent(token)}`,
          { headers: { Upgrade: "websocket" } },
        ),
      );
      expect(response.status).toBe(101);
      expect(latestPair).not.toBeNull();
      return latestPair![1];
    };

    let firstWatch: SpectatorWatch = {
      socket: await productionUpgrade("spectator-one", "Nami"),
      cursor: 0,
      currentState: null,
    };
    consumeAndAssertSpectatorStates(firstWatch, session.cardDb);

    const activeWatches: SpectatorWatch[] = [firstWatch];
    const drive = async (
      playerIndex: 0 | 1,
      action: GameAction,
    ): Promise<GameState> => {
      const playerCursor = playerSockets[playerIndex].sent.length;
      await session.webSocketMessage(
        playerSockets[playerIndex] as unknown as WebSocket,
        JSON.stringify({ type: "game:action", action }),
      );
      const playerReplies = parseWatchMessages(playerSockets[playerIndex]).slice(
        playerCursor,
      );
      expect(
        playerReplies.some(
          (message) =>
            message.type === "action:rejected" ||
            message.type === "game:error",
        ),
      ).toBe(false);
      for (const watch of activeWatches) {
        consumeAndAssertSpectatorStates(watch, session.cardDb);
      }
      const current = activeWatches[0].currentState;
      expect(current).not.toBeNull();
      for (const watch of activeWatches.slice(1)) {
        expect(watch.currentState).toEqual(current);
      }
      return current!;
    };

    await drive(0, {
      type: "PLAYER_CHOICE",
      choiceId: "FIRST",
      promptId: session.gameState.pendingPrompt?.promptId,
    });
    await drive(0, {
      type: "PLAYER_CHOICE",
      choiceId: "REDRAW",
      promptId: session.gameState.pendingPrompt?.promptId,
    });
    let current = await drive(1, {
      type: "PLAYER_CHOICE",
      choiceId: "KEEP",
      promptId: session.gameState.pendingPrompt?.promptId,
    });
    expect(current.pregame).toBeNull();
    expect(current.turn).toMatchObject({
      number: 1,
      activePlayerIndex: 0,
      phase: "MAIN",
    });

    current = await drive(0, { type: "ADVANCE_PHASE" });
    expect(current.turn).toMatchObject({
      number: 1,
      activePlayerIndex: 1,
      phase: "MAIN",
    });
    current = await drive(1, { type: "ADVANCE_PHASE" });
    expect(current.turn).toMatchObject({
      number: 2,
      activePlayerIndex: 0,
      phase: "MAIN",
    });

    const secondWatch: SpectatorWatch = {
      socket: await productionUpgrade("spectator-two", "Robin"),
      cursor: 0,
      currentState: null,
    };
    consumeAndAssertSpectatorStates(secondWatch, session.cardDb);
    expect(secondWatch.currentState).toEqual(firstWatch.currentState);
    activeWatches.push(secondWatch);

    const presenceBeforeReconnect = structuredClone(session.gameState.players);
    const scheduleDisconnect = vi.spyOn(
      session.transport,
      "scheduleDisconnect",
    );
    firstWatch.socket.close(1006, "network lost");
    await session.webSocketClose(
      firstWatch.socket as unknown as WebSocket,
      1006,
      "network lost",
    );
    const reconnectedFirstWatch: SpectatorWatch = {
      socket: await productionUpgrade("spectator-one", "Nami"),
      cursor: 0,
      currentState: null,
    };
    consumeAndAssertSpectatorStates(reconnectedFirstWatch, session.cardDb);
    expect(reconnectedFirstWatch.currentState).toEqual(
      secondWatch.currentState,
    );
    expect(session.gameState.players).toEqual(presenceBeforeReconnect);
    expect(scheduleDisconnect).not.toHaveBeenCalled();
    expect(
      session.gameState.players.map((player) => ({
        connected: player.connected,
        awayReason: player.awayReason,
        rejoinDeadlineAt: player.rejoinDeadlineAt,
      })),
    ).toEqual(
      presenceBeforeReconnect.map((player) => ({
        connected: player.connected,
        awayReason: player.awayReason,
        rejoinDeadlineAt: player.rejoinDeadlineAt,
      })),
    );
    firstWatch = reconnectedFirstWatch;
    activeWatches[0] = firstWatch;

    const deniedMessageCounts = activeWatches.map(
      (watch) => watch.socket.sent.length,
    );
    session.transport.broadcast({
      type: "game:undo",
      playerIndex: 0,
      canUndo: false,
    });
    expect(
      activeWatches.map((watch) => watch.socket.sent.length),
    ).toEqual(deniedMessageCounts);

    current = await drive(0, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: session.gameState.players[0].leader.instanceId,
      targetInstanceId: session.gameState.players[1].leader.instanceId,
    });
    expect(current.turn.battleSubPhase).toBe("BLOCK_STEP");
    current = await drive(1, { type: "PASS" });
    expect(current.turn.battleSubPhase).toBe("COUNTER_STEP");
    current = await drive(1, { type: "PASS" });
    expect(current.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    expect(current.turn.battle?.pendingTriggerLifeCard?.cardId).toBe(
      CARDS.TRIGGER.id,
    );
    current = await drive(1, {
      type: "REVEAL_TRIGGER",
      reveal: true,
      promptId: session.gameState.pendingPrompt?.promptId,
    });
    expect(current.turn.battle).toBeNull();
    expect(
      current.eventLog.some(
        (event) =>
          event.type === "TRIGGER_ACTIVATED" &&
          event.payload.cardId === CARDS.TRIGGER.id,
      ),
    ).toBe(true);

    await drive(1, { type: "CONCEDE" });
    for (const watch of activeWatches) {
      const delivered = parseWatchMessages(watch.socket);
      expect(delivered).toContainEqual({
        type: "game:over",
        winner: 0,
        reason: "Player 2 conceded",
      });
      expect(watch.socket.closed).toContainEqual({
        code: SPECTATOR_GAME_ENDED_CLOSE_CODE,
        reason: SPECTATOR_GAME_ENDED_CLOSE_REASON,
      });
    }
  });
});
