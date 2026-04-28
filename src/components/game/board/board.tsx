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
  matchClosed: boolean;
  canUndo: boolean;
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
  return (
    <BoardLayout
      {...state}
      onAction={dispatch.onAction}
      onLeave={dispatch.onLeave}
      viewportSize={{ width: designWidth, height: designHeight }}
      outerScale={scale}
    />
  );
}
