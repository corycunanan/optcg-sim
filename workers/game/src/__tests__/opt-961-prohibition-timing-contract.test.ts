/**
 * OPT-961 round 1, finding C — PROHIBITION_FEASIBILITY_TIMING must match the
 * engine's matchers.
 *
 * Each prohibition type is applied to every field card of both players with
 * cause ANY. The probes below call the table-independent matchers that
 * decide declarations (pipeline step 2, `checkProhibitions`) and cost
 * payments (`isRemovalProhibited` with the cost cause, the CANNOT_BE_RESTED
 * cost check, `isCardPlayProhibitedByEffect`, and the qa_op02.md:24-26 Life
 * to hand reading). A type classified ACTIVATION must be enforced by at least
 * one probe; a type classified RESOLUTION must veto none of them. The
 * consumers that read the table (`activationProhibitionVeto`,
 * `isCostMovementProhibited`, `isLifeToHandProhibited`) are covered by
 * opt-864-activation-prohibitions.test.ts and
 * opt-961-protected-field-exit-costs.test.ts. Life-to-hand cost and effect-action
 * gating, including replacement feasibility, share isLifeToHandProhibited;
 * opt-984-life-to-hand-prohibition.test.ts covers resolution and replacements.
 */
import { describe, expect, it } from "vitest";
import type { GameAction } from "../types.js";
import {
  PROHIBITION_FEASIBILITY_TIMING,
  type ProhibitionType,
  type RuntimeProhibition,
} from "../engine/effect-types.js";
import {
  checkProhibitions,
  isCardPlayProhibitedByEffect,
  isProhibitedForCard,
  isRemovalProhibited,
  type RemovalAction,
} from "../engine/prohibitions.js";
import { rig } from "./opt-960-rig.js";

const P0 = 0 as const;
const P1 = 1 as const;

function probe(type: ProhibitionType): string[] {
  const r = rig();
  const own = r.put("OPT961-C-OWN", P0, "CHARACTER");
  const handChar = r.put("OPT961-C-HAND-CHAR", P0, "HAND");
  const handEvent = r.put("OPT961-C-HAND-EVENT", P0, "HAND", {
    data: { type: "Event", cost: 1, power: null, effectText: "[Main] Draw 1 card." },
  });
  const opp = r.put("OPT961-C-OPP", P1, "CHARACTER");
  const fieldIds = [
    r.state.players[P0].leader.instanceId,
    own.instanceId,
    r.state.players[P1].leader.instanceId,
    opp.instanceId,
  ];
  const prohibition: RuntimeProhibition = {
    id: `opt961-c-${type}`,
    sourceCardInstanceId: r.state.players[P1].leader.instanceId,
    sourceEffectBlockId: "opt961-c",
    prohibitionType: type,
    scope: { cause: "ANY" },
    duration: { type: "THIS_TURN" },
    controller: P1,
    appliesTo: [...fieldIds, handChar.instanceId, handEvent.instanceId],
    usesRemaining: null,
  };
  const state = { ...r.state, prohibitions: [prohibition] };
  const vetoes: string[] = [];

  const declarations: Array<[string, GameAction]> = [
    ["ACTIVATE_EFFECT", { type: "ACTIVATE_EFFECT", cardInstanceId: own.instanceId, effectId: "any" }],
    ["PLAY_CARD character", { type: "PLAY_CARD", cardInstanceId: handChar.instanceId }],
    ["PLAY_CARD event", { type: "PLAY_CARD", cardInstanceId: handEvent.instanceId }],
    ["DECLARE_ATTACK", { type: "DECLARE_ATTACK", attackerInstanceId: own.instanceId, targetInstanceId: r.state.players[P1].leader.instanceId }],
    ["DECLARE_BLOCKER", { type: "DECLARE_BLOCKER", blockerInstanceId: own.instanceId }],
    ["USE_COUNTER", { type: "USE_COUNTER", cardInstanceId: handChar.instanceId, counterTargetInstanceId: own.instanceId }],
    ["ATTACH_DON", { type: "ATTACH_DON", targetInstanceId: own.instanceId, count: 1 }],
  ];
  for (const [name, action] of declarations) {
    if (checkProhibitions(state, action, r.db, P0)) vetoes.push(`declaration ${name}`);
  }
  const movements: RemovalAction[] = ["KO", "TRASH", "RETURN_TO_HAND", "RETURN_TO_DECK", "TO_LIFE"];
  for (const action of movements) {
    if (isRemovalProhibited(state, own.instanceId, { action, cause: "COST", causingController: P0 }, r.db)) {
      vetoes.push(`cost movement ${action}`);
    }
  }
  if (isProhibitedForCard(state, own.instanceId, "CANNOT_BE_RESTED", r.db, { cause: "COST", causingController: P0 })) {
    vetoes.push("rest cost");
  }
  if (isCardPlayProhibitedByEffect(state, handChar.instanceId, r.db)) vetoes.push("named-play cost");
  // qa_op02.md:24-26: a player-level Life-to-hand prohibition stops the cost.
  if (state.prohibitions.some((p) => p.prohibitionType === "CANNOT_ADD_LIFE_TO_HAND")) {
    vetoes.push("Life to hand cost");
  }
  return vetoes;
}

describe("OPT-961 PROHIBITION_FEASIBILITY_TIMING matches the engine's matchers", () => {
  const types = Object.keys(PROHIBITION_FEASIBILITY_TIMING) as ProhibitionType[];

  it.each(types)("%s", (type) => {
    const vetoes = probe(type);
    if (PROHIBITION_FEASIBILITY_TIMING[type] === "ACTIVATION") {
      expect(vetoes, `${type} is ACTIVATION but no declaration or cost matcher enforces it`).not.toEqual([]);
    } else {
      expect(vetoes, `${type} is RESOLUTION but vetoes at activation`).toEqual([]);
    }
  });
});
