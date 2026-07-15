"use client";

import type {
  ActiveEffect,
  CardDb,
  GameAction,
  GameEvent,
  PlayerState,
  PromptOptions,
  TurnState,
} from "@shared/game-types";
import { BoardLayout } from "../board-layout";
import type { InteractionMode } from "../board-layout/interaction-mode";
import type {
  AcceptedGameUpdate,
  ActionRejection,
} from "@/hooks/use-game-ws";
import { useBoardScale } from "../scaled-board";

export interface BoardState {
  me: PlayerState | null;
  opp: PlayerState | null;
  myIndex: 0 | 1 | null;
  turn: TurnState | null;
  cardDb: CardDb;
  isMyTurn: boolean;
  battlePhase: string | null;
  connectionStatus: string;
  eventLog: GameEvent[];
  activeEffects: ActiveEffect[];
  activePrompt: PromptOptions | null;
  activePromptId: string | null;
  matchClosed: boolean;
  canUndo: boolean;
  actionRejection?: ActionRejection | null;
  acceptedUpdate?: AcceptedGameUpdate | null;
  promptRespondingPlayer?: 0 | 1 | null;
  interactionMode?: InteractionMode;
}

export interface BoardDispatch {
  onAction: (action: GameAction) => void;
  onLeave: () => void;
}

export interface BoardProps {
  state: BoardState;
  dispatch: BoardDispatch;
}

export function Board({ state, dispatch }: BoardProps) {
  const { scale, designWidth, designHeight } = useBoardScale();
  // Solitaire flips `myIndex` between 0 and 1, swapping `me`/`opp` to entirely
  // different player data. Keying on `myIndex` remounts the visual-transition
  // hooks (useFieldArrivals, useCardTransitions, useHandOrder), so all-new
  // instanceIds aren't misread as arrivals (which would hide hand cards and
  // replay summon-pop animations). The fade-to-black covers the remount.
  return (
    <BoardLayout
      key={state.myIndex ?? 0}
      {...state}
      onAction={dispatch.onAction}
      onLeave={dispatch.onLeave}
      viewportSize={{ width: designWidth, height: designHeight }}
      outerScale={scale}
    />
  );
}
