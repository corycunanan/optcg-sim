/**
 * Block Step candidate surface (OPT-834).
 *
 * The defending player's cards that could legally be declared as a Blocker
 * right now: the same validation + prohibition gates the pipeline applies to
 * DECLARE_BLOCKER, evaluated for the Leader and every Character. A Leader is a
 * candidate only when it holds an effective [Blocker] (e.g. granted by
 * OP16-048 to an all-names Leader).
 */

import type { CardData, CardInstance, GameState } from "../types.js";
import { validate } from "./validation.js";
import { checkProhibitions } from "./prohibitions.js";

export function getBlockerCandidateIds(
  state: GameState,
  cardDb: Map<string, CardData>,
): string[] {
  if (state.turn.battleSubPhase !== "BLOCK_STEP") return [];
  const defender = state.turn.activePlayerIndex === 0 ? 1 : 0;
  const player = state.players[defender];
  const cards: CardInstance[] = [
    player.leader,
    ...player.characters.filter((c): c is CardInstance => c !== null),
  ];
  return cards
    .filter((card) => {
      const action = { type: "DECLARE_BLOCKER" as const, blockerInstanceId: card.instanceId };
      return (
        validate(state, action, cardDb, defender) === null &&
        checkProhibitions(state, action, cardDb, defender) === null
      );
    })
    .map((card) => card.instanceId);
}
