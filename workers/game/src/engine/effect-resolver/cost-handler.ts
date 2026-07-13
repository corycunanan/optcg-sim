/**
 * Cost payment logic — auto-payable and player-selection costs.
 */

import type {
  ChoiceCost,
  Cost,
  CostResult,
  EffectBlock,
  SimpleCost,
  TargetFilter,
} from "../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  PendingEvent,
  PendingPromptState,
  PlayerState,
  EffectStackFrame,
} from "../../types.js";
import { generateFrameId, pushFrame } from "../effect-stack.js";
import { isEngineTerminated } from "../engine-limits.js";
import type { CostPaymentResult, CostSelectionResult } from "./types.js";
import {
  detachDonToCostArea,
  setCardState,
  trashCharacter,
  trashStage,
} from "./card-mutations.js";
import { costResultToEntries } from "./types.js";
import { applyFieldDonReturn } from "./actions/don.js";
import { isProhibitedForCard } from "../prohibitions.js";
import { matchesFilter } from "../conditions.js";
import { checkReplacementForKO, checkReplacementForRemoval } from "../replacements.js";
import { transitionCard, transitionCards } from "../zone-transition.js";

// ─── payCosts (auto-payable) ─────────────────────────────────────────────────

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
        costResult.donRestedCount = rested;
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
        costResult.cardsTrashedCount = 1;
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
        costResult.cardsTrashedCount = moved.transitions.length;
        costResult.cardsTrashedInstanceIds.push(...moved.transitions.map((transition) => transition.fact.newInstanceId));
        events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: moved.transitions.length, reason: "cost" } });
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
        events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: moved.transitions.length, reason: "cost" } });
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
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
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
        costResult.donRestedCount = rested;
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
          { type: "PLACE_OWN_CHARACTER_TO_DECK", amount: 1, position: cost.position ?? "BOTTOM" } as Cost,
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
          { type: "PLACE_OWN_CHARACTER_TO_DECK", amount: 1, position: "BOTTOM" } as Cost,
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

// ─── Cost Payment with Player Selection ───────────────────────────────────────

const SELECTION_COST_TYPES: Set<string> = new Set([
  "TRASH_FROM_HAND",
  "KO_OWN_CHARACTER",
  "RETURN_OWN_CHARACTER_TO_HAND",
  "PLACE_OWN_CHARACTER_TO_DECK",
  "PLACE_HAND_TO_DECK",
  "REST_CARDS",
  "REST_NAMED_CARD",
  "TRASH_OWN_CHARACTER",
  "REVEAL_FROM_HAND",
  "CHOOSE_ONE_COST",
  "PLACE_FROM_TRASH_TO_DECK",
  "PLACE_SELF_AND_TRASH_TO_DECK",
  "PLACE_SELF_AND_HAND_TO_DECK",
  "ADD_OWN_CHARACTER_TO_LIFE",
]);

export function costNeedsPlayerSelection(cost: Cost): boolean {
  if (cost.type === "LIFE_TO_HAND" && (cost as SimpleCost).position === "TOP_OR_BOTTOM") return true;
  // Life is an ordered hidden zone — the only choice a life cost can offer is
  // top-vs-bottom (OP03-109). Fixed positions auto-pay in payCosts.
  if (cost.type === "TRASH_FROM_LIFE") return (cost as SimpleCost).position === "TOP_OR_BOTTOM";
  return SELECTION_COST_TYPES.has(cost.type);
}

function resolveAmount(cost: SimpleCost, fallback = 1): number {
  return typeof cost.amount === "number" ? cost.amount : fallback;
}

function getRestCostCandidates(player: PlayerState, filter?: TargetFilter): CardInstance[] {
  const explicitType = filter?.card_type;
  const cardTypes = explicitType
    ? new Set((Array.isArray(explicitType) ? explicitType : [explicitType]).map((t) => t.toUpperCase()))
    : null;
  const includeCharacters = !cardTypes || cardTypes.has("CHARACTER");
  const includeLeader = cardTypes?.has("LEADER") ?? false;
  const includeStage = cardTypes?.has("STAGE") ?? false;

  return [
    ...(includeLeader ? [player.leader] : []),
    ...(includeCharacters ? player.characters.filter((c): c is CardInstance => c !== null) : []),
    ...(includeStage && player.stage ? [player.stage] : []),
  ];
}

/**
 * Determine whether a single cost is payable in the current state.
 * Pure predicate — no state mutation.
 */
export function isCostPayable(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): boolean {
  if (cost.type === "CHOICE") {
    return (cost as ChoiceCost).options.some((branch) =>
      branch.every((c) => isCostPayable(state, c, controller, cardDb, sourceCardInstanceId)),
    );
  }

  if (cost.type === "CHOOSE_ONE_COST") {
    const opts = (cost as SimpleCost).options ?? [];
    return opts.some((o) => isCostPayable(state, o, controller, cardDb, sourceCardInstanceId));
  }

  // OPT-431: the self half of the compound cost is fixed to the source card —
  // payable only when the source is on the field AND enough matching trash
  // cards exist for the other half.
  if (cost.type === "PLACE_SELF_AND_TRASH_TO_DECK") {
    if (!sourceCardInstanceId) return false;
    const onField = state.players[controller].characters
      .some((c) => c?.instanceId === sourceCardInstanceId);
    if (!onField) return false;
    const targets = computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId);
    return targets.length >= resolveAmount(cost as SimpleCost);
  }

  if (cost.type === "PLACE_SELF_AND_HAND_TO_DECK") {
    if (!sourceCardInstanceId || state.players[controller].stage?.instanceId !== sourceCardInstanceId) return false;
    return computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId).length >= 1;
  }

  if (costNeedsPlayerSelection(cost)) {
    if ((cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE") &&
        (cost as SimpleCost).position === "TOP_OR_BOTTOM") {
      return state.players[controller].life.length >= resolveAmount(cost as SimpleCost);
    }
    const targets = computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId);
    const amt = cost.type === "REST_CARDS" && (cost as SimpleCost).amount === "ANY_NUMBER"
      ? 1
      : resolveAmount(cost as SimpleCost);
    return targets.length >= amt;
  }

  const player = state.players[controller];
  const simple = cost as SimpleCost;

  switch (cost.type) {
    case "DON_MINUS": {
      const amt = resolveAmount(simple, 0);
      if (simple.filter?.is_active === true || simple.filter?.state === "ACTIVE") {
        return player.donCostArea.filter((d) => d.state === "ACTIVE").length >= amt;
      }
      const allFieldDon = [
        ...player.donCostArea,
        ...player.leader.attachedDon,
        ...player.characters.filter(Boolean).flatMap((c) => c!.attachedDon),
      ];
      return allFieldDon.length >= amt;
    }

    case "DON_REST":
    case "REST_DON": {
      if (simple.amount === "ANY_NUMBER") return true;
      const amt = resolveAmount(simple);
      if (amt === 0) return false;
      return player.donCostArea.filter((d) => d.state === "ACTIVE").length >= amt;
    }

    case "VARIABLE_DON_RETURN": {
      const amt = resolveAmount(simple, 0);
      if (amt === 0) return true;
      return player.donCostArea.filter((d) => !d.attachedTo).length >= amt;
    }

    case "REST_SELF": {
      // A target-bearing REST_SELF rests the targeted card, not the source —
      // the schema convention for "rest your Leader" costs (OP04-081/094 etc.).
      // Payable iff that card is active and not prohibited from resting.
      if (simple.target?.type === "YOUR_LEADER") {
        const leader = player.leader;
        if (leader.state !== "ACTIVE") return false;
        return !isProhibitedForCard(state, leader.instanceId, "CANNOT_BE_RESTED", cardDb);
      }
      // OPT-250: a source under CANNOT_BE_RESTED can't pay this cost
      // (qa_op13.md:77-79 — [Activate: Main] rest-self effects are gated).
      if (!sourceCardInstanceId) return false;
      const source = player.leader.instanceId === sourceCardInstanceId
        ? player.leader
        : player.characters.find((card) => card?.instanceId === sourceCardInstanceId)
          ?? (player.stage?.instanceId === sourceCardInstanceId ? player.stage : null);
      if (!source || source.state !== "ACTIVE") return false;
      if (isProhibitedForCard(state, sourceCardInstanceId, "CANNOT_BE_RESTED", cardDb)) return false;
      return true;
    }

    case "TRASH_SELF": {
      if (!sourceCardInstanceId) return false;
      for (let pIdx = 0; pIdx < 2; pIdx++) {
        const p = state.players[pIdx as 0 | 1];
        if (p.characters.some((c) => c?.instanceId === sourceCardInstanceId)) return true;
        if (p.stage?.instanceId === sourceCardInstanceId) return true;
      }
      return false;
    }

    case "PLACE_SELF_TO_DECK": {
      // OPT-454: payable only while the source Character is on the field.
      if (!sourceCardInstanceId) return false;
      return player.characters.some((c) => c?.instanceId === sourceCardInstanceId);
    }

    case "LIFE_TO_HAND":
    case "TRASH_FROM_LIFE": {
      const amt = resolveAmount(simple);
      return player.life.length >= amt;
    }

    case "TURN_LIFE_FACE_UP": {
      const amt = resolveAmount(simple);
      return player.life.filter((l) => l.face === "DOWN").length >= amt;
    }

    case "TURN_LIFE_FACE_DOWN": {
      const amt = resolveAmount(simple);
      return player.life.filter((l) => l.face === "UP").length >= amt;
    }

    case "LEADER_POWER_REDUCTION":
      return !!player.leader;

    case "GIVE_OPPONENT_DON": {
      const amt = resolveAmount(simple);
      return player.donCostArea.filter((d) => !d.attachedTo).length >= amt;
    }

    case "PLACE_STAGE_TO_DECK": {
      if (!player.stage) return false;
      if (!simple.filter) return true;
      return matchesFilter(player.stage, simple.filter, cardDb, state, undefined, undefined, controller);
    }

    case "TRASH_OWN_STAGE": {
      if (!player.stage) return false;
      if (!simple.filter) return true;
      return matchesFilter(player.stage, simple.filter, cardDb, state, undefined, undefined, controller);
    }

    case "RETURN_ATTACHED_DON_TO_COST": {
      if (!sourceCardInstanceId) return false;
      const amt = resolveAmount(simple);
      for (let pIdx = 0; pIdx < 2; pIdx++) {
        const p = state.players[pIdx as 0 | 1];
        const charIdx = p.characters.findIndex((c) => c?.instanceId === sourceCardInstanceId);
        if (charIdx !== -1) return p.characters[charIdx]!.attachedDon.length >= amt;
        if (p.leader?.instanceId === sourceCardInstanceId) return p.leader.attachedDon.length >= amt;
      }
      return false;
    }

    case "PLAY_NAMED_CARD_FROM_HAND": {
      const cardName = simple.card_name;
      if (!cardName) return false;
      return player.hand.some((c) => {
        const data = cardDb.get(c.cardId);
        return data && data.name === cardName;
      });
    }

    default:
      return true;
  }
}

/**
 * Pay costs iteratively. Auto-payable costs are paid inline.
 * Selection-based costs push a stack frame and return a prompt.
 */
export function payCostsWithSelection(
  state: GameState,
  costs: Cost[],
  startIndex: number,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
  effectBlock: EffectBlock,
): CostSelectionResult {
  const events: PendingEvent[] = [];
  let nextState = state;
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

  // Use a mutable copy so CHOOSE_ONE_COST auto-select can replace the slot.
  const workingCosts = [...costs];
  for (let i = startIndex; i < workingCosts.length; i++) {
    const cost = workingCosts[i];

    // CHOOSE_ONE_COST — present payable options to the player.
    if (cost.type === "CHOOSE_ONE_COST") {
      const options = cost.options ?? [];
      const payableIndices: number[] = [];
      for (let oi = 0; oi < options.length; oi++) {
        if (isCostPayable(nextState, options[oi], controller, cardDb, sourceCardInstanceId)) {
          payableIndices.push(oi);
        }
      }

      if (payableIndices.length === 0) {
        return { state: nextState, events, cannotPay: true };
      }

      if (payableIndices.length === 1) {
        // Auto-select: replace slot and retry this index.
        workingCosts[i] = options[payableIndices[0]];
        i--;
        continue;
      }

      const frameId = generateFrameId(nextState);
      nextState = frameId.state;
      const frame: EffectStackFrame = {
        id: frameId.id,
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets: payableIndices.map((oi) => String(oi)),
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);
      if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };

      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "Choose a cost to pay",
          choices: payableIndices.map((oi) => ({
            id: String(oi),
            label: getCostLabel(options[oi]),
          })),
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    // CHOICE — branching cost paths; each option is a full Cost[].
    if (cost.type === "CHOICE") {
      const choiceCost = cost as ChoiceCost;
      const payableBranchIndices: number[] = [];
      for (let bi = 0; bi < choiceCost.options.length; bi++) {
        const branchPayable = choiceCost.options[bi].every((c) =>
          isCostPayable(nextState, c, controller, cardDb, sourceCardInstanceId),
        );
        if (branchPayable) payableBranchIndices.push(bi);
      }

      if (payableBranchIndices.length === 0) {
        return { state: nextState, events, cannotPay: true };
      }

      if (payableBranchIndices.length === 1) {
        const branch = choiceCost.options[payableBranchIndices[0]];
        workingCosts.splice(i, 1, ...branch);
        i--;
        continue;
      }

      const frameId = generateFrameId(nextState);
      nextState = frameId.state;
      const frame: EffectStackFrame = {
        id: frameId.id,
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets: payableBranchIndices.map((bi) => String(bi)),
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);
      if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };

      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "Select how to pay the cost",
          choices: payableBranchIndices.map((bi) => ({
            id: String(bi),
            label: choiceCost.labels?.[bi] ?? deriveBranchLabel(choiceCost.options[bi]),
          })),
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    // OPT-371: PLACE_FROM_TRASH_TO_DECK — the player chooses WHICH trash
    // cards go back, and for multi-card costs also their ORDER ("in any
    // order"). Selection is skipped when the trash offers no choice, and
    // ordering is skipped when the block shuffles the deck afterward
    // (e.g. OP05-080) or for a single card.
    let autoPayTrashToDeck = false;
    if (cost.type === "PLACE_FROM_TRASH_TO_DECK") {
      const amount = resolveAmount(cost as SimpleCost);
      const validTargets = computeCostTargets(nextState, cost, controller, cardDb, sourceCardInstanceId);
      if (validTargets.length < amount) {
        return { state: nextState, events, cannotPay: true };
      }

      // OPT-372: TOP_OR_BOTTOM — the player picks the destination first;
      // the resume handler pins the choice on the cost and re-enters this
      // flow with a concrete position (mirrors CHOOSE_ONE_COST slot
      // replacement, LIFE_TO_HAND-style Top/Bottom choices).
      if (cost.position === "TOP_OR_BOTTOM") {
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets: ["TOP", "BOTTOM"],
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        return {
          state: nextState,
          events,
          pendingPrompt: {
            options: {
              promptType: "PLAYER_CHOICE",
              effectDescription: "Choose top or bottom of your deck for the placed cards",
              choices: [
                { id: "0", label: "Top" },
                { id: "1", label: "Bottom" },
              ],
            },
            respondingPlayer: controller,
            resumeContext: frame.id,
          },
        };
      }

      const needsSelection = validTargets.length > amount;
      const needsArrange = amount > 1 && !blockShufflesDeck(effectBlock);

      if (!needsSelection && needsArrange) {
        // Every candidate is forced — go straight to the arrange prompt.
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets,
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
          costArrangeStage: true,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        return {
          state: nextState,
          events,
          pendingPrompt: buildTrashToDeckArrangePrompt(
            nextState, validTargets, controller, frame.id,
            cost.position === "TOP" ? "TOP" : "BOTTOM",
          ),
        };
      }
      // No choice and order is moot — pay automatically below.
      autoPayTrashToDeck = !needsSelection;
      // needsSelection → generic SELECT_TARGET prompt below; the arrange
      // step (if any) is chained by the resume handler after selection.
    }

    // OPT-431/OPT-430: PLACE_SELF_AND_TRASH_TO_DECK — "place this Character
    // and N [matching] from your trash at the bottom of your deck in any
    // order" (OP10-026/027). The self half is fixed to the source card; the
    // player selects WHICH trash cards, then orders the whole group (self +
    // trash) in a single arrange prompt per Comprehensive Rule 3-1-7.
    if (cost.type === "PLACE_SELF_AND_TRASH_TO_DECK" || cost.type === "PLACE_SELF_AND_HAND_TO_DECK") {
      const amount = resolveAmount(cost as SimpleCost);
      const player = nextState.players[controller];
      const sourceOnField = cost.type === "PLACE_SELF_AND_HAND_TO_DECK"
        ? player.stage?.instanceId === sourceCardInstanceId
        : player.characters.some((c) => c?.instanceId === sourceCardInstanceId);
      if (!sourceOnField) {
        return { state: nextState, events, cannotPay: true };
      }
      const trashCandidates = computeCostTargets(nextState, cost, controller, cardDb, sourceCardInstanceId);
      if (trashCandidates.length < amount) {
        return { state: nextState, events, cannotPay: true };
      }

      const needsSelection = trashCandidates.length > amount;
      const needsArrange = !blockShufflesDeck(effectBlock);

      if (needsSelection) {
        // Stage 1: pick the trash cards. The arrange stage (self + picks)
        // is chained by the resume handler.
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets: trashCandidates,
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        const pendingPrompt: PendingPromptState = {
          options: {
            promptType: "SELECT_TARGET",
            validTargets: trashCandidates,
            countMin: amount,
            countMax: amount,
            effectDescription: getCostLabel(cost),
            ctaLabel: getCostCtaLabel(cost),
            cards: getCostCards(nextState, cost, trashCandidates, controller),
          },
          respondingPlayer: controller,
          resumeContext: frame.id,
        };
        return { state: nextState, events, pendingPrompt };
      }

      const group = [sourceCardInstanceId, ...trashCandidates];
      if (needsArrange) {
        // Every trash candidate is forced — go straight to ordering the
        // full group (always 2+ cards: self + trash).
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets: group,
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
          costArrangeStage: true,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        return {
          state: nextState,
          events,
          pendingPrompt: buildTrashToDeckArrangePrompt(
            nextState, group, controller, frame.id,
            cost.position === "TOP" ? "TOP" : "BOTTOM",
          ),
        };
      }

      // Block shuffles afterward — order is moot, pay in default order.
      const applied = applyCostSelection(nextState, cost, group, controller);
      nextState = applied.state;
      events.push(...applied.events);
      costResult.cardsPlacedToDeckCount += group.length;
      continue;
    }

    if (!autoPayTrashToDeck && costNeedsPlayerSelection(cost)) {
      // Special handling for life costs with TOP_OR_BOTTOM — use PLAYER_CHOICE
      if ((cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE") &&
          (cost as SimpleCost).position === "TOP_OR_BOTTOM") {
        const p = nextState.players[controller];
        if (p.life.length === 0) {
          return { state: nextState, events, cannotPay: true };
        }

        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets: ["TOP", "BOTTOM"],
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };

        const pendingPrompt: PendingPromptState = {
          options: {
            promptType: "PLAYER_CHOICE",
            effectDescription: cost.type === "TRASH_FROM_LIFE"
              ? "Choose top or bottom of your Life cards to trash"
              : "Choose top or bottom of your Life cards to add to your hand",
            choices: [
              { id: "0", label: "Top" },
              { id: "1", label: "Bottom" },
            ],
          },
          respondingPlayer: controller,
          resumeContext: frame.id,
        };
        return { state: nextState, events, pendingPrompt };
      }

      // Build valid targets for this cost
      const validTargets = computeCostTargets(nextState, cost, controller, cardDb, sourceCardInstanceId);
      const amount = typeof (cost as SimpleCost).amount === "number" ? ((cost as SimpleCost).amount as number) : 1;

      if (validTargets.length < amount) {
        return { state: nextState, events, cannotPay: true };
      }

      // Push stack frame for cost selection
      const frameId = generateFrameId(nextState);
      nextState = frameId.state;
      const frame: EffectStackFrame = {
        id: frameId.id,
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets,
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);
      if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };

      const costLabel = getCostLabel(cost);
      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "SELECT_TARGET",
          validTargets,
          countMin: amount,
          countMax: amount,
          effectDescription: costLabel,
          ctaLabel: getCostCtaLabel(cost),
          cards: getCostCards(nextState, cost, validTargets, controller),
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    // Fixed-source field exits have no selection prompt, but replacement
    // effects may still suspend their payment (Rule 8-3-1-7). Park the same
    // cost frame used by selectable payments so decline can resume exactly.
    const fixedExitTarget = (() => {
      if (["TRASH_SELF", "PLACE_SELF_TO_DECK", "PLACE_SELF_AND_HAND_TO_DECK"].includes(cost.type)) {
        return sourceCardInstanceId;
      }
      if (["PLACE_STAGE_TO_DECK", "TRASH_OWN_STAGE"].includes(cost.type)) {
        return nextState.players[controller].stage?.instanceId;
      }
      return undefined;
    })();
    if (fixedExitTarget) {
      let replacement = cost.type === "KO_OWN_CHARACTER"
        ? checkReplacementForKO(nextState, fixedExitTarget, "effect", controller, cardDb)
        : checkReplacementForRemoval(nextState, fixedExitTarget, controller, cardDb);
      if (cost.type === "KO_OWN_CHARACTER" && !replacement.replaced && !replacement.pendingPrompt) {
        replacement = checkReplacementForRemoval(nextState, fixedExitTarget, controller, cardDb);
      }
      nextState = replacement.state;
      events.push(...replacement.events);
      if (replacement.pendingPrompt) {
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id, sourceCardInstanceId, controller, effectBlock,
          phase: "AWAITING_COST_SELECTION", pausedAction: null,
          remainingActions: effectBlock.actions ?? [], resultRefs: [], validTargets: [],
          costs: workingCosts, currentCostIndex: i, costsPaid: false,
          oncePerTurnMarked: false, costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [], simultaneousTriggers: [], accumulatedEvents: events,
          costReplacementAction: { type: "PLAYER_CHOICE", choiceId: "__PAY_FIXED_COST__" },
          costReplacementChecked: true,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        return { state: nextState, events, pendingPrompt: replacement.pendingPrompt };
      }
      if (replacement.replaced) {
        return { state: nextState, events, cannotPay: true };
      }
    }

    // Auto-payable cost — use existing payCosts for this single cost
    const singleResult = payCosts(nextState, [cost], controller, cardDb, sourceCardInstanceId);
    if (!singleResult) {
      return { state: nextState, events, cannotPay: true };
    }
    nextState = singleResult.state;
    events.push(...singleResult.events);
    costResult.donRestedCount += singleResult.costResult.donRestedCount;
    costResult.cardsTrashedCount += singleResult.costResult.cardsTrashedCount;
    costResult.cardsReturnedCount += singleResult.costResult.cardsReturnedCount;
    costResult.cardsPlacedToDeckCount += singleResult.costResult.cardsPlacedToDeckCount;
    costResult.charactersKoCount += singleResult.costResult.charactersKoCount;
    costResult.cardsTrashedInstanceIds.push(...singleResult.costResult.cardsTrashedInstanceIds);
    costResult.cardsReturnedInstanceIds.push(...singleResult.costResult.cardsReturnedInstanceIds);
    costResult.charactersKoInstanceIds.push(...singleResult.costResult.charactersKoInstanceIds);
  }

  return { state: nextState, events, costResult };
}

// ─── Cost helpers ─────────────────────────────────────────────────────────────

/**
 * True when the effect block shuffles the deck after its costs resolve —
 * ordering the placed cards is moot in that case (OPT-371, e.g. OP05-080).
 */
export function blockShufflesDeck(block: EffectBlock): boolean {
  return (block.actions ?? []).some((a) => a.type === "SHUFFLE_DECK");
}

/**
 * ARRANGE_TOP_CARDS prompt over the cards being placed by a
 * PLACE_FROM_TRASH_TO_DECK or PLACE_SELF_AND_TRASH_TO_DECK cost.
 * maxKeep 0 = pure reorder (no pick step). Cards may come from the trash or
 * the field (the self half of the compound cost, OPT-430).
 */
export function buildTrashToDeckArrangePrompt(
  state: GameState,
  cardIds: string[],
  controller: 0 | 1,
  frameId: string,
  position: "TOP" | "BOTTOM" = "BOTTOM",
): PendingPromptState {
  const p = state.players[controller];
  const byId = new Map([
    ...p.trash.map((c) => [c.instanceId, c] as const),
    ...p.hand.map((c) => [c.instanceId, c] as const),
    ...(p.characters.filter(Boolean) as CardInstance[]).map((c) => [c.instanceId, c] as const),
    ...(p.stage ? [[p.stage.instanceId, p.stage] as const] : []),
  ]);
  const cards = cardIds
    .map((id) => byId.get(id))
    .filter((c): c is CardInstance => c !== undefined);
  return {
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards,
      effectDescription: `Place the cards at the ${position === "TOP" ? "top" : "bottom"} of your deck in any order`,
      // Drives the modal's single destination button: "Place at Bottom" when
      // true, "Place on Top" when false.
      canSendToBottom: position !== "TOP",
      validTargets: [],
      maxKeep: 0,
    },
    respondingPlayer: controller,
    resumeContext: frameId,
  };
}

export function computeCostTargets(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): string[] {
  const player = state.players[controller];

  // OPT-432: honor filter.exclude_self on cost candidates — printed costs
  // like OP05-056's "1 of your Characters other than this Character" must
  // never offer the effect's source. matchesFilter cannot enforce this on
  // the cost path (it never receives the source), so it is applied here.
  const dropSelf = (ids: string[]): string[] =>
    (cost as SimpleCost).filter?.exclude_self && sourceCardInstanceId
      ? ids.filter((id) => id !== sourceCardInstanceId)
      : ids;

  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "PLACE_HAND_TO_DECK":
    case "PLACE_SELF_AND_HAND_TO_DECK":
    case "REVEAL_FROM_HAND": {
      let candidates = player.hand;
      if (cost.filter) {
        candidates = candidates.filter((c) =>
          matchesFilter(c, cost.filter!, cardDb, state, undefined, undefined, controller),
        );
      }
      return dropSelf(candidates.map((c) => c.instanceId));
    }

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER":
    case "RETURN_OWN_CHARACTER_TO_HAND":
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "ADD_OWN_CHARACTER_TO_LIFE": {
      let candidates = player.characters.filter(Boolean) as CardInstance[];
      if (cost.filter) {
        candidates = candidates.filter((c) =>
          matchesFilter(c, cost.filter!, cardDb, state, undefined, undefined, controller),
        );
      }
      return dropSelf(candidates.map((c) => c.instanceId));
    }

    case "PLACE_FROM_TRASH_TO_DECK":
    // OPT-431: the selectable half of the compound cost is the trash side
    // only — the self half is fixed to the source card and never offered.
    case "PLACE_SELF_AND_TRASH_TO_DECK": {
      let candidates = player.trash;
      if (cost.filter) {
        candidates = candidates.filter((c) =>
          matchesFilter(c, cost.filter!, cardDb, state, undefined, undefined, controller),
        );
      }
      return dropSelf(candidates.map((c) => c.instanceId));
    }

    case "REST_CARDS": {
      // OPT-250: characters under CANNOT_BE_RESTED cannot satisfy a rest cost
      // (qa_op13.md:85-87 — "cannot become rested by the effects of other cards").
      const candidates = getRestCostCandidates(player, cost.filter);
      return candidates
        .filter((c) => c.state === "ACTIVE")
        .filter((c) => !isProhibitedForCard(state, c.instanceId, "CANNOT_BE_RESTED", cardDb))
        .filter((c) => !cost.filter || matchesFilter(c, cost.filter, cardDb, state, undefined, undefined, controller))
        .map((c) => c.instanceId);
    }

    case "REST_NAMED_CARD": {
      const candidates: string[] = [];
      const nameFilter = cost.filter?.name;
      // Include matching active characters
      for (const c of player.characters) {
        if (!c || c.state !== "ACTIVE") continue;
        if (isProhibitedForCard(state, c.instanceId, "CANNOT_BE_RESTED", cardDb)) continue;
        if (nameFilter) {
          const data = cardDb.get(c.cardId);
          if (!data || data.name !== nameFilter) continue;
        }
        candidates.push(c.instanceId);
      }
      // Include leader if active and matches name filter
      if (player.leader.state === "ACTIVE" &&
          !isProhibitedForCard(state, player.leader.instanceId, "CANNOT_BE_RESTED", cardDb)) {
        if (nameFilter) {
          const leaderData = cardDb.get(player.leader.cardId);
          if (leaderData && leaderData.name === nameFilter) {
            candidates.push(player.leader.instanceId);
          }
        } else {
          candidates.push(player.leader.instanceId);
        }
      }
      return candidates;
    }

    case "CHOOSE_ONE_COST":
      // Targets are computed per-option after selection; no aggregate list.
      return [];

    default:
      return [];
  }
}

export function getCostLabel(cost: Cost): string {
  const amount = typeof (cost as SimpleCost).amount === "number" ? ((cost as SimpleCost).amount as number) : 1;
  switch (cost.type) {
    case "TRASH_FROM_HAND": return `Choose ${amount} card(s) from hand to trash as cost`;
    case "KO_OWN_CHARACTER": return `Choose ${amount} character(s) to KO as cost`;
    case "RETURN_OWN_CHARACTER_TO_HAND": return `Choose ${amount} character(s) to return to hand as cost`;
    case "PLACE_OWN_CHARACTER_TO_DECK": return `Choose ${amount} character(s) to place on deck as cost`;
    case "ADD_OWN_CHARACTER_TO_LIFE": return `Choose ${amount} character(s) to add to your Life cards as cost`;
    case "TRASH_FROM_LIFE": return `Choose ${amount} life card(s) to trash as cost`;
    case "PLACE_HAND_TO_DECK": return `Choose ${amount} card(s) to place on deck as cost`;
    case "PLACE_FROM_TRASH_TO_DECK": return `Choose ${amount} card(s) from your trash to place in your deck as cost`;
    case "PLACE_SELF_AND_TRASH_TO_DECK": return `Choose ${amount} card(s) from your trash to place in your deck with this Character as cost`;
    case "PLACE_SELF_AND_HAND_TO_DECK": return "Choose 1 card from your hand to place in your deck with this Stage as cost";
    case "REST_CARDS": return `Choose ${amount} card(s) to rest as cost`;
    case "TRASH_OWN_CHARACTER": return `Choose ${amount} character(s) to trash as cost`;
    case "REVEAL_FROM_HAND": return `Choose ${amount} card(s) from hand to reveal as cost`;
    case "CHOOSE_ONE_COST": return "Choose a cost to pay";
    default: return "Select card(s) as cost";
  }
}

export function deriveBranchLabel(branch: Cost[]): string {
  return branch.map((c) => getCostLabel(c)).join(" + ");
}

export function getCostCtaLabel(cost: Cost): string {
  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "TRASH_OWN_CHARACTER":
    case "TRASH_FROM_LIFE": return "Trash";
    case "KO_OWN_CHARACTER": return "KO";
    case "RETURN_OWN_CHARACTER_TO_HAND": return "Return";
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "PLACE_HAND_TO_DECK":
    case "PLACE_FROM_TRASH_TO_DECK":
    case "PLACE_SELF_AND_TRASH_TO_DECK": return "Place on Deck";
    case "PLACE_SELF_AND_HAND_TO_DECK": return "Place on Deck";
    case "ADD_OWN_CHARACTER_TO_LIFE": return "Add to Life";
    case "REST_CARDS":
    case "REST_NAMED_CARD": return "Rest";
    case "REVEAL_FROM_HAND": return "Reveal";
    default: return "Confirm";
  }
}

export function getCostCards(
  state: GameState,
  cost: Cost,
  validTargets: string[],
  controller: 0 | 1,
): CardInstance[] {
  const player = state.players[controller];
  const targetSet = new Set(validTargets);

  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "PLACE_HAND_TO_DECK":
    case "REVEAL_FROM_HAND":
      return player.hand.filter((c) => targetSet.has(c.instanceId));

    case "PLACE_FROM_TRASH_TO_DECK":
      return player.trash.filter((c) => targetSet.has(c.instanceId));

    case "PLACE_SELF_AND_TRASH_TO_DECK":
      // Selection stage offers trash candidates only; the self half is fixed.
      return player.trash.filter((c) => targetSet.has(c.instanceId));

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER":
    case "RETURN_OWN_CHARACTER_TO_HAND":
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "ADD_OWN_CHARACTER_TO_LIFE":
    case "REST_CARDS":
    case "REST_NAMED_CARD": {
      const cards = player.characters.filter((c): c is CardInstance => c !== null && targetSet.has(c.instanceId));
      if (targetSet.has(player.leader.instanceId)) {
        cards.push(player.leader);
      }
      if (player.stage && targetSet.has(player.stage.instanceId)) {
        cards.push(player.stage);
      }
      return cards;
    }

    default:
      return [];
  }
}

export function promptTypeToPhase(promptType: string): EffectStackFrame["phase"] {
  switch (promptType) {
    case "OPTIONAL_EFFECT": return "AWAITING_OPTIONAL_RESPONSE";
    case "SELECT_TARGET": return "AWAITING_TARGET_SELECTION";
    case "REDISTRIBUTE_DON": return "AWAITING_TARGET_SELECTION";
    case "ARRANGE_TOP_CARDS": return "AWAITING_ARRANGE_CARDS";
    case "PLAYER_CHOICE": return "AWAITING_PLAYER_CHOICE";
    default: return "AWAITING_TARGET_SELECTION";
  }
}

// ─── applyCostSelection ──────────────────────────────────────────────────────

/**
 * Result of applying one cost selection. `events` carries field-exit events
 * (OPT-453, e.g. CARD_RETURNED_TO_DECK) so pipeline consumers and observers
 * see them; the corresponding registry cleanup has already been applied to
 * `state` inline.
 */
export interface AppliedCostSelection {
  state: GameState;
  events: PendingEvent[];
}

export function applyCostSelection(
  state: GameState,
  cost: Cost,
  selectedIds: string[],
  controller: 0 | 1,
): AppliedCostSelection {
  const p = state.players[controller];
  const selectedSet = new Set(selectedIds);

  switch (cost.type) {
    case "TRASH_FROM_HAND": {
      const toTrash = p.hand.filter((c) => selectedSet.has(c.instanceId));
      const moved = transitionCards(state, toTrash.map((c) => c.instanceId), "TRASH", { position: "TOP" });
      return { state: moved.state, events: [] };
    }

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER": {
      const toRemove = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const moved = transitionCards(state, toRemove.map((c) => c.instanceId), "TRASH", { position: "TOP" });
      return { state: moved.state, events: [] };
    }

    case "RETURN_OWN_CHARACTER_TO_HAND": {
      const toReturn = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const moved = transitionCards(state, toReturn.map((c) => c.instanceId), "HAND");
      return { state: moved.state, events: [] };
    }

    case "PLACE_HAND_TO_DECK":
    case "PLACE_OWN_CHARACTER_TO_DECK": {
      if (cost.type === "PLACE_HAND_TO_DECK") {
        const toPlace = p.hand.filter((c) => selectedSet.has(c.instanceId));
        const position = cost.position === "TOP" ? "TOP" : "BOTTOM";
        const moved = transitionCards(state, toPlace.map((c) => c.instanceId), "DECK", { position });
        return { state: moved.state, events: [] };
      } else {
        const toPlace = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
        const position = cost.position === "TOP" ? "TOP" : "BOTTOM";
        const moved = transitionCards(state, toPlace.map((c) => c.instanceId), "DECK", { position });
        const events: PendingEvent[] = moved.transitions.map((transition) => ({
            type: "CARD_RETURNED_TO_DECK",
            playerIndex: controller,
            payload: { cardInstanceId: transition.fact.oldInstanceId, newCardInstanceId: transition.fact.newInstanceId, cardId: transition.fact.cardId, position },
          }));
        return { state: moved.state, events };
      }
    }

    case "PLACE_FROM_TRASH_TO_DECK": {
      // selectedIds arrive in final order (arranged top→bottom of the placed
      // group when the arrange step ran; selection order otherwise).
      // OPT-372: honor cost.position (deck index 0 = top); TOP_OR_BOTTOM is
      // resolved to a concrete position before payment reaches this point.
      const moved = transitionCards(state, selectedIds, "DECK", {
        position: cost.position === "TOP" ? "TOP" : "BOTTOM",
      });
      return { state: moved.state, events: [] };
    }

    case "PLACE_SELF_AND_TRASH_TO_DECK": {
      // OPT-430/431: selectedIds arrive in final arranged top→bottom order
      // and mix zones — the source Character (field) plus trash cards. Move
      // each from its own zone, preserving the interleaved order.
      const fieldIds = new Set(
        p.characters.flatMap((c) => c && selectedSet.has(c.instanceId) ? [c.instanceId] : []),
      );
      const moved = transitionCards(state, selectedIds, "DECK", {
        position: cost.position === "TOP" ? "TOP" : "BOTTOM",
      });
      const events: PendingEvent[] = moved.transitions
        .filter((transition) => fieldIds.has(transition.fact.oldInstanceId))
        .map((transition) => ({
          type: "CARD_RETURNED_TO_DECK",
          playerIndex: controller,
          payload: {
            cardInstanceId: transition.fact.oldInstanceId,
            newCardInstanceId: transition.fact.newInstanceId,
            cardId: transition.fact.cardId,
            position: cost.position === "TOP" ? "TOP" : "BOTTOM",
          },
        }));
      return { state: moved.state, events };
    }

    case "PLACE_SELF_AND_HAND_TO_DECK": {
      const stage = p.stage && selectedSet.has(p.stage.instanceId) ? p.stage : null;
      if (!stage) return { state, events: [] };
      const moved = transitionCards(state, selectedIds, "DECK", { position: "BOTTOM" });
      const stageTransition = moved.transitions.find((transition) => transition.fact.oldInstanceId === stage.instanceId);
      return {
        state: moved.state,
        events: stageTransition ? [{
          type: "CARD_RETURNED_TO_DECK",
          playerIndex: controller,
          payload: { cardInstanceId: stage.instanceId, newCardInstanceId: stageTransition.fact.newInstanceId, cardId: stage.cardId, position: "BOTTOM" },
        }] : [],
      };
    }

    case "ADD_OWN_CHARACTER_TO_LIFE": {
      // OPT-455: "add 1 of your Characters ... to the top of your Life cards
      // face-up" (ST13-001). Canonical field exit: the Life card is a NEW
      // instance (rules 3-1-6, matching executeAddToLifeFromField), attached
      // DON returns rested, and the old field instance's registrations are
      // cleaned up inline.
      const toMove = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const face = (cost as SimpleCost).face ?? "UP";
      const position = (cost as SimpleCost).position ?? "TOP";
      const moved = transitionCards(state, toMove.map((c) => c.instanceId), "LIFE", {
        position: position === "BOTTOM" ? "BOTTOM" : "TOP",
        lifeFace: face,
      });
      return { state: moved.state, events: [] };
    }

    case "REST_CARDS":
    case "REST_NAMED_CARD": {
      const newChars = p.characters.map((c) =>
        c !== null && selectedSet.has(c.instanceId) ? { ...c, state: "RESTED" as const } : c,
      );
      const newLeader = selectedSet.has(p.leader.instanceId)
        ? { ...p.leader, state: "RESTED" as const }
        : p.leader;
      const newStage = p.stage && selectedSet.has(p.stage.instanceId)
        ? { ...p.stage, state: "RESTED" as const }
        : p.stage;
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, leader: newLeader, characters: newChars, stage: newStage };
      return { state: { ...state, players: newPlayers }, events: [] };
    }

    default:
      return { state, events: [] };
  }
}
