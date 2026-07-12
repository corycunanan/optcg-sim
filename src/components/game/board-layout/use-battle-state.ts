"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  const [selectedBlocker, setSelectedBlocker] = useState<{
    battlePhase: string | null;
    id: string | null;
  }>({ battlePhase: null, id: null });
  const selectedBlockerId =
    selectedBlocker.battlePhase === battlePhase ? selectedBlocker.id : null;
  const setSelectedBlockerId = useCallback(
    (id: string | null) => setSelectedBlocker({ battlePhase, id }),
    [battlePhase],
  );

  useEffect(() => {
    if (!inBlockStep) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedBlockerId(null);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-blocker-selection], [data-blocker-selection-control]")) {
        return;
      }
      setSelectedBlockerId(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [inBlockStep, setSelectedBlockerId]);

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
