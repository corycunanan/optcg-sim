/** Printed OP12-048 [Opponent's Turn]; qa_op12.md also explicitly permits self-protection. */
import { describe, expect, it } from "vitest";
import type { CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

for (const controller of [0, 1] as const) {
  for (const ownTurn of [true, false]) {
    for (const protectSelf of [true, false]) {
      describe(`controller ${controller}, ${ownTurn ? "own" : "opponent"} turn, protect ${protectSelf ? "self" : "ally"}`, () => {
        it.each(["RETURN_TO_HAND", "KO"] as const)(
          "gates %s replacement by the printed turn condition",
          (removal) => {
            const opponent = controller === 0 ? 1 : 0;
            const db = createTestCardDb();
            let state = createBattleReadyState(db);
            state.turn.activePlayerIndex = ownTurn ? controller : opponent;
            for (const player of state.players) {
              player.characters = padChars([]);
              player.hand = [];
            }
            const schema = getEffectSchema("OP12-048")!;
            db.set("OP12-048", {
              ...CARDS.VANILLA,
              id: "OP12-048",
              color: ["Blue"],
              types: ["Navy"],
              effectSchema: schema,
            });
            db.set("NAVY-ALLY", {
              ...CARDS.VANILLA,
              id: "NAVY-ALLY",
              color: ["Blue"],
              types: ["Navy"],
            });
            // A test-only opponent effect fires on the attack declaration on either
            // turn. Rosinante itself always uses the unmodified production schema.
            db.set("REMOVAL", {
              ...CARDS.VANILLA,
              id: "REMOVAL",
              effectSchema: {
                card_id: "REMOVAL",
                card_name: "Removal",
                card_type: "Character",
                effects: [
                  {
                    id: "remove",
                    category: "auto",
                    trigger: {
                      keyword: ownTurn
                        ? "ON_OPPONENT_ATTACK"
                        : "WHEN_ATTACKING",
                    },
                    actions: [
                      {
                        type: removal,
                        target: {
                          type: "CHARACTER",
                          controller: "OPPONENT",
                          count: { exact: 1 },
                        },
                      },
                    ],
                  },
                ],
              },
            });
            function put(
              cardId: string,
              owner: 0 | 1,
              zone: "CHARACTER" | "HAND" = "CHARACTER"
            ) {
              const card: CardInstance = {
                instanceId: `${cardId}-${owner}`,
                cardId,
                owner,
                controller: owner,
                zone,
                state: "ACTIVE",
                attachedDon: [],
                turnPlayed: 0,
              };
              if (zone === "HAND") state.players[owner].hand.push(card);
              else {
                state.players[owner].characters[
                  state.players[owner].characters.findIndex((c) => !c)
                ] = card;
                state = registerCardEnteredField(state, card, db.get(cardId)!);
              }
              return card;
            }
            function act(action: GameAction) {
              if (state.pendingPrompt) {
                const result = resumePromptLifecycle(state, action, db, {
                  drainPregame: (s) => s,
                  advanceStartOfTurn: (s) => s,
                });
                expect(result.responseRejected).toBe(false);
                state = result.state;
              } else {
                const result = runPipeline(
                  state,
                  action,
                  db,
                  state.turn.activePlayerIndex
                );
                expect(result.valid, result.error).toBe(true);
                state = result.state;
              }
            }
            const rosinante = put("OP12-048", controller);
            const target = protectSelf
              ? rosinante
              : put("NAVY-ALLY", controller);
            const fodder = put(CARDS.VANILLA.id, controller, "HAND");
            const source = put("REMOVAL", opponent);
            act({
              type: "DECLARE_ATTACK",
              attackerInstanceId: ownTurn
                ? state.players[controller].leader.instanceId
                : source.instanceId,
              targetInstanceId:
                state.players[ownTurn ? opponent : controller].leader
                  .instanceId,
            });
            // A sole legal target is resolved automatically by the pipeline.
            if (state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
              act({
                type: "SELECT_TARGET",
                selectedInstanceIds: [target.instanceId],
              });
            }
            if (ownTurn) {
              expect(state.pendingPrompt).toBeNull();
              expect(
                state.players[controller].characters.some(
                  (c) => c?.instanceId === target.instanceId
                )
              ).toBe(false);
              const destination =
                removal === "KO"
                  ? state.players[controller].trash
                  : state.players[controller].hand;
              expect(destination.some((c) => c.cardId === target.cardId)).toBe(
                true
              );
              expect(
                state.players[controller].hand.some(
                  (c) => c.instanceId === fodder.instanceId
                )
              ).toBe(true);
            } else {
              expect(state.pendingPrompt?.options.promptType).toBe(
                "OPTIONAL_EFFECT"
              );
              expect(state.pendingPrompt?.respondingPlayer).toBe(controller);
              act({ type: "PLAYER_CHOICE", choiceId: "accept" });
              if (state.pendingPrompt)
                act({
                  type: "SELECT_TARGET",
                  selectedInstanceIds: [fodder.instanceId],
                });
              expect(state.pendingPrompt).toBeNull();
              expect(
                state.players[controller].characters.some(
                  (c) => c?.instanceId === target.instanceId
                )
              ).toBe(true);
              expect(
                state.players[controller].characters.find(
                  (c) => c?.instanceId === rosinante.instanceId
                )?.state
              ).toBe("RESTED");
              expect(
                state.players[controller].trash.filter(
                  (c) => c.cardId === fodder.cardId
                )
              ).toHaveLength(1);
            }
          }
        );
      });
    }
  }
}
