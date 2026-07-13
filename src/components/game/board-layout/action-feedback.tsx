"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { GameAction } from "@shared/game-types";
import type { ActionRejection } from "@/hooks/use-game-ws";

interface ActionFeedbackValue {
  rejectedInstanceId: string | null;
  sequence: number;
}

const ActionFeedbackContext = createContext<ActionFeedbackValue | null>(null);

export function getActionCardInstanceId(action: GameAction): string | null {
  switch (action.type) {
    case "PLAY_CARD":
    case "ACTIVATE_EFFECT":
    case "USE_COUNTER":
    case "USE_COUNTER_EVENT":
      return action.cardInstanceId;
    case "DECLARE_ATTACK":
      return action.attackerInstanceId;
    case "DECLARE_BLOCKER":
      return action.blockerInstanceId;
    case "ATTACH_DON":
      return action.targetInstanceId;
    case "REDISTRIBUTE_DON":
      return action.transfers[0]?.fromCardInstanceId ?? null;
    case "SELECT_TARGET":
      return action.selectedInstanceIds[0] ?? null;
    default:
      return null;
  }
}

export function ActionFeedbackProvider({
  rejection,
  children,
}: {
  rejection: ActionRejection | null;
  children: ReactNode;
}) {
  return (
    <ActionFeedbackContext.Provider
      value={
        rejection
          ? {
              rejectedInstanceId: getActionCardInstanceId(rejection.action),
              sequence: rejection.sequence,
            }
          : null
      }
    >
      {children}
    </ActionFeedbackContext.Provider>
  );
}

export function useCardRejection(instanceId: string) {
  const feedback = useContext(ActionFeedbackContext);
  return feedback?.rejectedInstanceId === instanceId
    ? feedback.sequence
    : null;
}
