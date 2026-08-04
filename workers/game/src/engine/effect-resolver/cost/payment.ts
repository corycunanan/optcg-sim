/** Fixed and automatically selected cost payment mutations. */
import type { Cost, CostResult } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import type { CostPaymentResult } from "../types.js";
import { detachDonToCostArea, setCardState, trashCharacter, trashStage } from "../card-mutations.js";
import { applyFieldDonReturn } from "../actions/don.js";
import { isProhibitedForCard } from "../../prohibitions.js";
import { matchesFilter } from "../../conditions.js";
import { transitionCard, transitionCards } from "../../zone-transition.js";
import { computeCostTargets } from "./targets.js";
import { applyCostSelection } from "./resume.js";

/**
 * Pay every fixed cost in order and aggregate the resources paid across steps.
 * Returns null when any step cannot be completed from the evolving game state.
 */
export function payCosts(
  state: GameState,
  costs: Cost[],
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): CostPaymentResult | null {
  const events: PendingEvent[] = [];
  const costResult: CostResult = {
    donRestedCount: 0,
    cardsTrashedCount: 0,
    cardsReturnedCount: 0,
    cardsPlacedToDeckCount: 0,
    charactersKoCount: 0,
    cardsTrashedInstanceIds: [],
    cardsReturnedInstanceIds: [],
    charactersKoInstanceIds: [],
  };

  let nextState = state;

  for (const cost of costs) {
    switch (cost.type) {
      case "DON_MINUS": {
        const amount = typeof cost.amount === "number" ? cost.amount : 0;
        const player = nextState.players[controller];
        const activeOnly = cost.filter?.is_active === true || cost.filter?.state === "ACTIVE";

        if (activeOnly) {
          // A card requiring active DON!! specifically pays from the cost
          // area only — attached DON!! is not active/rested cost-area DON.
          const candidates = player.donCostArea.filter((d) => d.state === "ACTIVE");
          if (candidates.length < amount) return null;
          const toReturn = candidates.slice(0, amount);
          const toReturnIds = new Set(toReturn.map((d) => d.instanceId));
          const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
          newPlayers[controller] = {
            ...player,
            donCostArea: player.donCostArea.filter((d) => !toReturnIds.has(d.instanceId)),
            donDeck: [...player.donDeck, ...toReturn.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }))],
          };
          nextState = { ...nextState, players: newPlayers };
          events.push({ type: "DON_DETACHED", playerIndex: controller, payload: { count: amount } });
          break;
        }

        // OPT-440: DON!! −X pays from the whole field — cost area + DON!!
        // attached to the Leader and Characters (Comprehensive Rules 8-3-1-6 /
        // 10-2-10-1) — matching exactly what isCostPayable predicts. Before
        // this, payCosts could only take cost-area DON!!, so an offered
        // DON!!−X [Trigger] trashed the life card and then fizzled on the cost.
        //
        // Deterministic auto-pick: cost area first (array order, the
        // historical preference), then attached DON!! — Leader first, then
        // Characters in field order. The rules let the player select any
        // field DON!!, and which card loses its +1000 buff can matter;
        // prompting through the cost path (as FORCE_OPPONENT_DON_RETURN does
        // in actions/don.ts) is deferred because the trigger-reveal cost path
        // resolves synchronously. Documented in the OPT-440 tests.
        const attachedSources = [
          ...(player.leader.attachedDon.length > 0
            ? [{ cardInstanceId: player.leader.instanceId, cap: player.leader.attachedDon.length }]
            : []),
          ...player.characters.flatMap((c) =>
            c && c.attachedDon.length > 0
              ? [{ cardInstanceId: c.instanceId, cap: c.attachedDon.length }]
              : [],
          ),
        ];
        const attachedTotal = attachedSources.reduce((s, a) => s + a.cap, 0);
        if (player.donCostArea.length + attachedTotal < amount) return null;

        const fromCostArea = Math.min(amount, player.donCostArea.length);
        // applyFieldDonReturn removes actives-first then resteds by count;
        // deriving the counts from the array-order prefix keeps the removed
        // set identical to the historical slice(0, fromCostArea) behavior.
        const prefix = player.donCostArea.slice(0, fromCostArea);
        const costActive = prefix.filter((d) => d.state === "ACTIVE").length;
        const costRested = fromCostArea - costActive;

        let shortfall = amount - fromCostArea;
        const attached: { cardInstanceId: string; count: number }[] = [];
        for (const source of attachedSources) {
          if (shortfall <= 0) break;
          const take = Math.min(source.cap, shortfall);
          attached.push({ cardInstanceId: source.cardInstanceId, count: take });
          shortfall -= take;
        }

        const applied = applyFieldDonReturn(nextState, controller, { costActive, costRested, attached });
        nextState = applied.state;
        events.push(...applied.events);
        break;
      }

      case "DON_REST": {
        const amount = cost.amount === "ANY_NUMBER"
          ? nextState.players[controller].donCostArea.filter((d) => d.state === "ACTIVE").length
          : typeof cost.amount === "number" ? cost.amount : 0;

        if (amount === 0 && cost.amount !== "ANY_NUMBER") return null;

        const p = nextState.players[controller];
        const activeDon = p.donCostArea.filter((d) => d.state === "ACTIVE");
        if (activeDon.length < amount) return null;

        let rested = 0;
        const newDonCostArea = p.donCostArea.map((d) => {
          if (d.state === "ACTIVE" && rested < amount) {
            rested++;
            return { ...d, state: "RESTED" as const };
          }
          return d;
        });

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, donCostArea: newDonCostArea };
        nextState = { ...nextState, players: newPlayers };
        costResult.donRestedCount += rested;
        break;
      }

      case "REST_SELF": {
        // A target-bearing REST_SELF rests the targeted card, not the source —
        // the schema convention for "rest your Leader" costs (OP04-081/094 etc.).
        if (cost.target?.type === "YOUR_LEADER") {
          const leader = nextState.players[controller].leader;
          if (leader.state !== "ACTIVE") return null;
          if (isProhibitedForCard(nextState, leader.instanceId, "CANNOT_BE_RESTED", _cardDb)) {
            return null;
          }
          nextState = setCardState(nextState, leader.instanceId, "RESTED");
          events.push({
            type: "CARD_STATE_CHANGED",
            playerIndex: controller,
            payload: { targetInstanceId: leader.instanceId, newState: "RESTED" },
          });
          break;
        }
        if (!sourceCardInstanceId) return null;
        const player = nextState.players[controller];
        const source = player.leader.instanceId === sourceCardInstanceId
          ? player.leader
          : player.characters.find((card) => card?.instanceId === sourceCardInstanceId)
            ?? (player.stage?.instanceId === sourceCardInstanceId ? player.stage : null);
        if (!source || source.state !== "ACTIVE") return null;
        // OPT-250: if the source is under CANNOT_BE_RESTED, the cost cannot
        // be paid — the entire effect fails (qa_op13.md:77-79).
        if (isProhibitedForCard(nextState, sourceCardInstanceId, "CANNOT_BE_RESTED", _cardDb)) {
          return null;
        }
        nextState = setCardState(nextState, sourceCardInstanceId, "RESTED");
        events.push({
          type: "CARD_STATE_CHANGED",
          playerIndex: controller,
          payload: { targetInstanceId: sourceCardInstanceId, newState: "RESTED" },
        });
        break;
      }

      case "TRASH_SELF": {
        if (!sourceCardInstanceId) return null;
        const result =
          trashCharacter(nextState, sourceCardInstanceId, controller, "cost") ??
          trashStage(nextState, sourceCardInstanceId, "cost");
        if (!result) return null;
        nextState = result.state;
        events.push(...result.events);
        costResult.cardsTrashedCount += 1;
        costResult.cardsTrashedInstanceIds.push(sourceCardInstanceId);
        break;
      }

      case "TRASH_FROM_HAND": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        if (p.hand.length < amount) return null;

        // Auto-select cards to trash (in real impl, player chooses)
        // For now, take from the end of hand
        let trashable = p.hand;
        if (cost.filter) {
          trashable = trashable.filter((c) =>
            matchesFilter(c, cost.filter!, _cardDb, nextState, undefined, undefined, controller),
          );
        }
        if (trashable.length < amount) return null;

        const toTrash = trashable.slice(0, amount);
        const moved = transitionCards(nextState, toTrash.map((c) => c.instanceId), "TRASH", { position: "TOP" });
        nextState = moved.state;
        costResult.cardsTrashedCount += moved.transitions.length;
        costResult.cardsTrashedInstanceIds.push(...moved.transitions.map((transition) => transition.fact.newInstanceId));
        events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: moved.transitions.length, reason: "cost", from: "HAND" } });
        break;
      }

      case "LIFE_TO_HAND": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const position = cost.position ?? "TOP";
        if (position === "TOP_OR_BOTTOM") return null; // Needs player selection
        const p = nextState.players[controller];
        if (p.life.length < amount) return null;

        const removed = position === "TOP" ? p.life.slice(0, amount) : p.life.slice(-amount);
        const moved = transitionCards(nextState, removed.map((card) => card.instanceId), "HAND");
        nextState = moved.state;
        events.push({ type: "CARD_ADDED_TO_HAND_FROM_LIFE", playerIndex: controller, payload: { count: amount } });
        // OPT-240: life exits publish CARD_REMOVED_FROM_LIFE (executeLifeToHand
        // already does; the cost path was missing it).
        for (const transition of moved.transitions) {
          events.push({ type: "CARD_REMOVED_FROM_LIFE", playerIndex: controller, payload: { cardInstanceId: transition.fact.oldInstanceId, newCardInstanceId: transition.fact.newInstanceId } });
        }
        break;
      }

      case "TRASH_FROM_LIFE": {
        // "Trash N from the top of your Life cards" is deterministic — the
        // player never picks WHICH life card, only whether to pay (the
        // optional-effect prompt). OPT-259 (F6): not damage, never fires
        // [Trigger].
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const position = cost.position ?? "TOP";
        if (position === "TOP_OR_BOTTOM") return null; // Needs player selection
        const p = nextState.players[controller];
        if (p.life.length < amount) return null;

        const removed = position === "TOP" ? p.life.slice(0, amount) : p.life.slice(-amount);
        const moved = transitionCards(nextState, removed.map((card) => card.instanceId), "TRASH", { position: "TOP" });
        nextState = moved.state;
        costResult.cardsTrashedCount += moved.transitions.length;
        costResult.cardsTrashedInstanceIds.push(...moved.transitions.map((transition) => transition.fact.newInstanceId));
        events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: moved.transitions.length, reason: "cost", from: "LIFE" } });
        // OPT-240: any life exit publishes CARD_REMOVED_FROM_LIFE so
        // Kalgara/Bonney-style watchers fire on cost payments too.
        for (const transition of moved.transitions) {
          events.push({ type: "CARD_REMOVED_FROM_LIFE", playerIndex: controller, payload: { cardInstanceId: transition.fact.oldInstanceId, newCardInstanceId: transition.fact.newInstanceId } });
        }
        break;
      }

      case "TURN_LIFE_FACE_UP": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        // Find face-down life cards (from top)
        const faceDownIndices: number[] = [];
        for (let i = 0; i < p.life.length && faceDownIndices.length < amount; i++) {
          if (p.life[i].face === "DOWN") faceDownIndices.push(i);
        }
        if (faceDownIndices.length < amount) return null;

        const newLife = p.life.map((card, i) =>
          faceDownIndices.includes(i) ? { ...card, face: "UP" as const } : card,
        );
        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, life: newLife };
        nextState = { ...nextState, players: newPlayers };
        events.push({ type: "LIFE_CARD_TURNED_FACE_UP", playerIndex: controller, payload: { count: amount } });
        break;
      }

      case "TURN_LIFE_FACE_DOWN": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        // Find face-up life cards
        const faceUpIndices: number[] = [];
        for (let i = 0; i < p.life.length && faceUpIndices.length < amount; i++) {
          if (p.life[i].face === "UP") faceUpIndices.push(i);
        }
        if (faceUpIndices.length < amount) return null;

        const newLife = p.life.map((card, i) =>
          faceUpIndices.includes(i) ? { ...card, face: "DOWN" as const } : card,
        );
        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, life: newLife };
        nextState = { ...nextState, players: newPlayers };
        events.push({ type: "LIFE_CARD_TURNED_FACE_DOWN", playerIndex: controller, payload: { count: amount } });
        break;
      }

      case "REST_DON": {
        // Alias for DON_REST — rest N active DON in cost area
        const amount = cost.amount === "ANY_NUMBER"
          ? nextState.players[controller].donCostArea.filter((d) => d.state === "ACTIVE").length
          : typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        const activeDon = p.donCostArea.filter((d) => d.state === "ACTIVE");
        if (activeDon.length < amount) return null;

        let rested = 0;
        const newDonCostArea = p.donCostArea.map((d) => {
          if (d.state === "ACTIVE" && rested < amount) {
            rested++;
            return { ...d, state: "RESTED" as const };
          }
          return d;
        });

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, donCostArea: newDonCostArea };
        nextState = { ...nextState, players: newPlayers };
        costResult.donRestedCount += rested;
        break;
      }

      case "PLACE_FROM_TRASH_TO_DECK": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];

        // Auto-pay fallback: takes the first N matching trash cards in array
        // order. The interactive flow (choose which cards + "in any order"
        // arrangement) lives in payCostsWithSelection (OPT-371); this path
        // only runs when there is no real choice or via direct payCosts calls.
        let candidates = p.trash;
        if (cost.filter) {
          candidates = candidates.filter((c) =>
            matchesFilter(c, cost.filter!, _cardDb, nextState, undefined, undefined, controller),
          );
        }
        if (candidates.length < amount) return null;

        const toMove = candidates.slice(0, amount);
        // OPT-372: honor cost.position (deck index 0 = top). TOP_OR_BOTTOM is
        // resolved to a concrete position by payCostsWithSelection before this
        // fallback runs; a raw payCosts caller defaults to BOTTOM.
        const moved = transitionCards(nextState, toMove.map((c) => c.instanceId), "DECK", {
          position: cost.position === "TOP" ? "TOP" : "BOTTOM",
        });
        nextState = moved.state;
        costResult.cardsPlacedToDeckCount += moved.transitions.length;
        break;
      }

      case "LEADER_POWER_REDUCTION": {
        // This is tracked as a temporary power modifier on the leader
        // For cost payment, we just verify the leader exists
        const p = nextState.players[controller];
        if (!p.leader) return null;
        // Power reduction is applied as an active effect by the caller
        break;
      }

      case "GIVE_OPPONENT_DON": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const p = nextState.players[controller];
        const opp = controller === 0 ? 1 : 0;
        const unattached = p.donCostArea.filter((d) => !d.attachedTo);
        if (unattached.length < amount) return null;

        const toGive = unattached.slice(0, amount);
        const toGiveIds = new Set(toGive.map((d) => d.instanceId));
        const remaining = p.donCostArea.filter((d) => !toGiveIds.has(d.instanceId));
        const given = toGive.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }));

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, donCostArea: remaining };
        newPlayers[opp as 0 | 1] = { ...nextState.players[opp as 0 | 1], donCostArea: [...nextState.players[opp as 0 | 1].donCostArea, ...given] };
        nextState = { ...nextState, players: newPlayers };
        break;
      }

      case "VARIABLE_DON_RETURN": {
        // Return a variable number of DON from field to DON deck (like DON_MINUS but amount varies)
        const amount = typeof cost.amount === "number" ? cost.amount : 0;
        if (amount === 0) break;
        const p = nextState.players[controller];
        const unattached = p.donCostArea.filter((d) => !d.attachedTo);
        if (unattached.length < amount) return null;

        const toReturn = unattached.slice(0, amount);
        const toReturnIds = new Set(toReturn.map((d) => d.instanceId));
        const remaining = p.donCostArea.filter((d) => !toReturnIds.has(d.instanceId));
        const returned = toReturn.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }));

        const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
        newPlayers[controller] = { ...p, donCostArea: remaining, donDeck: [...p.donDeck, ...returned] };
        nextState = { ...nextState, players: newPlayers };
        break;
      }

      case "PLACE_STAGE_TO_DECK": {
        const p = nextState.players[controller];
        if (!p.stage) return null;
        // Printed restrictions ("place 1 of your cost-1 Stages...") ride on
        // cost.filter — a non-matching Stage cannot pay (OPT-453 review).
        if (cost.filter && !matchesFilter(p.stage, cost.filter, _cardDb, nextState, undefined, undefined, controller)) {
          return null;
        }

        const stage = p.stage;
        const moved = transitionCard(nextState, stage.instanceId, "DECK", { position: "BOTTOM" });
        if (!moved) return null;
        nextState = moved.state;
        events.push({ type: "CARD_RETURNED_TO_DECK", playerIndex: controller, payload: { cardInstanceId: stage.instanceId, newCardInstanceId: moved.fact.newInstanceId, cardId: stage.cardId } });
        break;
      }

      case "TRASH_OWN_STAGE": {
        const p = nextState.players[controller];
        if (!p.stage) return null;
        if (cost.filter) {
          if (!matchesFilter(p.stage, cost.filter, _cardDb, nextState, undefined, undefined, controller)) return null;
        }
        const stageId = p.stage.instanceId;
        const result = trashStage(nextState, stageId, "cost");
        if (!result) return null;
        nextState = result.state;
        events.push(...result.events);
        costResult.cardsTrashedCount += 1;
        costResult.cardsTrashedInstanceIds.push(stageId);
        break;
      }

      case "RETURN_ATTACHED_DON_TO_COST": {
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        if (!sourceCardInstanceId) return null;
        const newState = detachDonToCostArea(nextState, sourceCardInstanceId, amount);
        if (!newState) return null;
        nextState = newState;
        break;
      }

      case "PLACE_SELF_TO_DECK": {
        // OPT-454: "place this Character at the bottom of the owner's deck" —
        // the cost is fixed to the source card (rules 8-3-1/8-3-1-7: a
        // bystander can never pay a "this Character" cost). Auto-pays with
        // no selection prompt, via the canonical field-exit transition.
        if (!sourceCardInstanceId) return null;
        const p = nextState.players[controller];
        if (!p.characters.some((c) => c?.instanceId === sourceCardInstanceId)) return null;
        const applied = applyCostSelection(
          nextState,
          { type: "PLACE_OWN_CHARACTER_TO_DECK", amount: 1, position: cost.position ?? "BOTTOM" },
          [sourceCardInstanceId],
          controller,
        );
        nextState = applied.state;
        events.push(...applied.events);
        costResult.cardsPlacedToDeckCount += 1;
        break;
      }

      case "PLACE_SELF_AND_HAND_TO_DECK": {
        if (!sourceCardInstanceId) return null;
        // Move source card + specified hand cards to deck bottom.
        // For auto-pay, just move the source card. Uses the canonical
        // PLACE_OWN_CHARACTER_TO_DECK transition (OPT-453): fresh deck
        // instance, field-exit cleanup, CARD_RETURNED_TO_DECK event.
        const p = nextState.players[controller];
        if (!p.characters.some((c) => c?.instanceId === sourceCardInstanceId)) return null;
        const applied = applyCostSelection(
          nextState,
          { type: "PLACE_OWN_CHARACTER_TO_DECK", amount: 1, position: "BOTTOM" },
          [sourceCardInstanceId],
          controller,
        );
        nextState = applied.state;
        events.push(...applied.events);
        break;
      }

      case "PLACE_SELF_AND_TRASH_TO_DECK": {
        // OPT-431: defensive auto-pay fallback — normal flow goes through
        // payCostsWithSelection (selection + arrange). Move the source card
        // and the first matching trash cards to the deck in default order.
        if (!sourceCardInstanceId) return null;
        const amt = typeof cost.amount === "number" ? cost.amount : 1;
        const candidates = computeCostTargets(nextState, cost, controller, _cardDb, sourceCardInstanceId);
        if (candidates.length < amt) return null;
        const p = nextState.players[controller];
        if (!p.characters.some((c) => c?.instanceId === sourceCardInstanceId)) return null;
        const applied = applyCostSelection(
          nextState,
          cost,
          [sourceCardInstanceId, ...candidates.slice(0, amt)],
          controller,
        );
        nextState = applied.state;
        events.push(...applied.events);
        costResult.cardsPlacedToDeckCount += 1 + amt;
        break;
      }

      case "PLAY_NAMED_CARD_FROM_HAND": {
        // Play a specific named card from hand as part of the cost
        const p = nextState.players[controller];
        const cardName = cost.card_name;
        if (!cardName) return null;
        const handIdx = p.hand.findIndex((c) => {
          const data = _cardDb.get(c.cardId);
          return data && data.name === cardName;
        });
        if (handIdx === -1) return null;
        // Card will be played by the action chain — just verify it exists
        break;
      }

      default:
        // Unrecognized cost type — skip
        break;
    }
  }

  return { state: nextState, events, costResult };
}
