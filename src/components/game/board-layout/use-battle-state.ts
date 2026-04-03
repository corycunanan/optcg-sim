"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CardDb,
  CardInstance,
  PlayerState,
  TurnState,
} from "@shared/game-types";
import type { BattleInfo } from "./mid-zone";

export interface BattleState {
  phase: string;
  inBattle: boolean;
  canEndPhase: boolean;
  isDefender: boolean;
  canPass: boolean;
  canDragCounter: boolean;
  inBlockStep: boolean;
  canInteract: boolean;
  battle: TurnState["battle"] | null;
  battleInfo: BattleInfo | null;
  selectedBlockerId: string | null;
  setSelectedBlockerId: (id: string | null) => void;
}

export function useBattleState(
  me: PlayerState | null,
  opp: PlayerState | null,
  myIndex: 0 | 1 | null,
  turn: TurnState | null,
  cardDb: CardDb,
  isMyTurn: boolean,
  battlePhase: string | null,
  matchClosed: boolean,
): BattleState {
  const phase = turn?.phase ?? "";
  const inBattle = !!battlePhase;
  const canEndPhase = !matchClosed && isMyTurn && !inBattle && phase === "MAIN";

  const isDefender = !isMyTurn && myIndex !== null && turn?.activePlayerIndex !== myIndex;
  const canPass = !matchClosed && isDefender && battlePhase === "COUNTER_STEP";
  const canDragCounter = !matchClosed && isDefender && battlePhase === "COUNTER_STEP";
  const inBlockStep = !matchClosed && isDefender && battlePhase === "BLOCK_STEP";
  const canInteract = isMyTurn && phase === "MAIN" && !inBattle && !matchClosed;
  const battle = turn?.battle ?? null;

  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedBlockerId(null);
  }, [battlePhase]);

  const battleInfo: BattleInfo | null = useMemo(() => {
    if (!battle || !me || !opp) return null;
    const allCards: (CardInstance | null)[] = [
      me.leader, opp.leader,
      ...me.characters, ...opp.characters,
    ];
    const attackerCard = allCards.find((c) => c?.instanceId === battle.attackerInstanceId);
    const defenderCard = allCards.find((c) => c?.instanceId === battle.targetInstanceId);
    return {
      attackerName: attackerCard ? cardDb[attackerCard.cardId]?.name ?? "?" : "?",
      attackerPower: battle.attackerPower,
      defenderName: defenderCard ? cardDb[defenderCard.cardId]?.name ?? "?" : "?",
      defenderPower: battle.defenderPower,
      counterPowerAdded: battle.counterPowerAdded,
      battleSubPhase: battlePhase ?? "",
    };
  }, [battle, me, opp, cardDb, battlePhase]);

  return {
    phase,
    inBattle,
    canEndPhase,
    isDefender,
    canPass,
    canDragCounter,
    inBlockStep,
    canInteract,
    battle,
    battleInfo,
    selectedBlockerId,
    setSelectedBlockerId,
  };
}
