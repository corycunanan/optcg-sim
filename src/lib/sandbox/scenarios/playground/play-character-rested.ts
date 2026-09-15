import type { Scenario } from "../types";
import { playCharacterScenario } from "./play-character";

/** A real Leader rule runs through the playground's production pipeline. */
export const playCharacterRestedScenario: Scenario = {
  ...playCharacterScenario,
  id: "play-character-rested",
  title: "Play Character Rested",
  description:
    "Activate Lim, add 1 DON!!, and choose Crocodile from your hand. It turns sideways during arrival and stays rested. Reset to compare with reduced motion enabled.",
  cardsUsed: ["OP09-022", "OP09-025", "OP01-060"],
  initialState: {
    ...playCharacterScenario.initialState,
    players: [
      {
        ...playCharacterScenario.initialState.players[0],
        hand: [
          {
            ...playCharacterScenario.initialState.players[0].hand[0],
            instanceId: "p0-hand-crocodile",
            cardId: "OP09-025",
          },
        ],
        leader: {
          ...playCharacterScenario.initialState.players[0].leader,
          cardId: "OP09-022",
        },
      },
      playCharacterScenario.initialState.players[1],
    ],
  },
};
