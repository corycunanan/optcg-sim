"use client";

/**
 * OPT-366: pre-game overlay. Mounts above the scaled board whenever the
 * shared GameState carries a non-null `pregame`. Routes between three
 * sub-views based on the pregame phase:
 *
 *   - PriorityRollDisplay (PRIORITY_ROLLING / PRIORITY_CHOICE)
 *     · Animates the two d6 values from the priority decision.
 *     · For the priority decider, surfaces FirstOrSecondChoice on top.
 *     · Other player sees a waiting state.
 *
 *   - MulliganModal (MULLIGAN_DECISIONS)
 *     · Shows the responding player's opening hand with Keep / Redraw buttons.
 *     · Other player sees a waiting state.
 *
 * Server-side phases (HAND_DEAL, LIFE_PLACEMENT, START_OF_GAME_FX) drain in
 * one tick on the worker so the overlay typically does not render them. If a
 * client briefly sees them (e.g. a slow network frame), it shows a generic
 * "preparing the game" placeholder.
 */

import type { CardDb, GameAction, GameState, PromptOptions } from "@shared/game-types";
import { PriorityRollDisplay } from "./priority-roll-display";
import { FirstOrSecondChoice } from "./first-or-second-modal";
import { MulliganModal } from "./mulligan-modal";

interface PregameOverlayProps {
  pregame: NonNullable<GameState["pregame"]>;
  myIndex: 0 | 1 | null;
  myHand: GameState["players"][0]["hand"];
  cardDb: CardDb;
  activePrompt: PromptOptions | null;
  onAction: (action: GameAction) => void;
}

export function PregameOverlay({
  pregame,
  myIndex,
  myHand,
  cardDb,
  activePrompt,
  onAction,
}: PregameOverlayProps) {
  const phase = pregame.phase;

  if (phase === "PRIORITY_ROLLING" || phase === "PRIORITY_CHOICE") {
    return (
      <PriorityRollDisplay
        rolls={pregame.priorityRolls}
        priorityDeciderIndex={pregame.priorityDeciderIndex}
        myIndex={myIndex}
      >
        {phase === "PRIORITY_CHOICE" &&
          pregame.priorityDeciderIndex !== null &&
          activePrompt?.promptType === "PLAYER_CHOICE" &&
          activePrompt.effectDescription === "PREGAME_FIRST_OR_SECOND" &&
          myIndex === pregame.priorityDeciderIndex && (
            <FirstOrSecondChoice onAction={onAction} />
          )}
      </PriorityRollDisplay>
    );
  }

  if (phase === "MULLIGAN_DECISIONS") {
    const isMyTurn =
      activePrompt?.promptType === "PLAYER_CHOICE"
      && activePrompt.effectDescription === "PREGAME_MULLIGAN"
      && myIndex !== null;
    return (
      <MulliganModal
        isResponder={isMyTurn}
        myHand={myHand}
        cardDb={cardDb}
        onAction={onAction}
      />
    );
  }

  // HAND_DEAL / START_OF_GAME_FX / LIFE_PLACEMENT / DONE — usually transient.
  return (
    <div className="bg-gb-board/85 fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm">
      <div className="text-gb-text-bright text-lg font-bold">
        Preparing the game…
      </div>
    </div>
  );
}
