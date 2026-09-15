import type { Scenario } from "../types";
import { playCharacterScenario } from "./play-character";

/** A real Leader rule runs through the playground's production pipeline. */
export const playCharacterRestedScenario: Scenario = {
  ...playCharacterScenario,
  id: "play-character-rested",
  title: "Play Character Rested",
  description:
    "Play the Character from hand under Lim. It turns sideways during arrival and stays rested. Reset to compare with reduced motion enabled.",
  cardsUsed: ["OP09-022", "OP01-025", "OP01-060"],
  initialState: {
    ...playCharacterScenario.initialState,
    players: [
      {
        ...playCharacterScenario.initialState.players[0],
        leader: {
          ...playCharacterScenario.initialState.players[0].leader,
          cardId: "OP09-022",
        },
      },
      playCharacterScenario.initialState.players[1],
    ],
  },
};
