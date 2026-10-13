/**
 * OPT-962 review finding B: an End Phase expiry belongs to the step of the
 * player who controls the effect (rule 6-6-1-2, rule_comprehensive.md:619-620:
 * step 1 invalidates "the turn player's effects", step 2 "the non-turn
 * player's effects"), not to the player a prohibition restricts.
 *
 * | Clause | When evaluated | Observable |
 * |---|---|---|
 * | OP09-081 Teach (docs/cards/OP-09.md:554): "[Activate: Main] You may trash 1 card from your hand: Your opponent's [On Play] effects are negated until the end of your opponent's next turn." | p0 activates on p0's turn; the negation is p0's effect and ends in p1's End Phase in p0's step (step 2: p0 is the non-turn player). | While p0's step-2 obligation is parked on its prompt the negation is present; after the hand-off it is gone. |
 * | OP01-085 Mr.3 (docs/cards/OP-01.md): "… cannot attack until the end of your opponent's next turn." APPLY_PROHIBITION family: the authored action on a synthetic [Activate: Main] carrier. | Same timing: p0's prohibition ends at p0's step 2 in p1's End Phase. | Same observation. |
 */

import { describe, expect, it } from "vitest";
import type { GameState } from "../types.js";
import type { RuntimeScheduledAction } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { endPhaseRig, synSchema, type EndPhaseRig } from "./opt-962-rig.js";

/** p0's END_OF_THIS_TURN K.O. (up to 1): parks p1's End Phase at step 2 on p0's prompt. */
function p0StepTwoPrompt(r: EndPhaseRig): void {
  const obligation: RuntimeScheduledAction = {
    id: "p0-step2-ko",
    timing: "END_OF_THIS_TURN",
    action: { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } },
    boundToInstanceId: null,
    sourceEffectId: r.state.players[0].leader.instanceId,
    controller: 0,
  };
  r.state = { ...r.state, scheduledActions: [...r.state.scheduledActions, obligation] };
}

/** End p0's turn, then run p1's Refresh, Draw and DON!! Phases. */
function toP1Main(r: EndPhaseRig): void {
  r.act({ type: "ADVANCE_PHASE" }, 0);
  expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.turn.activePlayerIndex).toBe(1);
  for (let i = 0; i < 3; i += 1) r.act({ type: "ADVANCE_PHASE" }, 1);
  expect(r.state.turn.phase).toBe("MAIN");
}

function expectExpiresInP0StepTwo(r: EndPhaseRig, isIt: (state: GameState) => boolean): void {
  expect(isIt(r.state)).toBe(true);
  p0StepTwoPrompt(r);
  r.act({ type: "ADVANCE_PHASE" }, 1);
  const parked = r.state.effectStack.find((f) => f.phaseBoundaryContinuation)?.phaseBoundaryContinuation;
  expect(parked?.stage).toBe("NON_TURN_PLAYER_END_OF_TURN");
  // p1's step 1 has run its expiry; p0's effect lasts until p0's step 2 expiry.
  expect(isIt(r.state), "p0's effect is still present while p0's step 2 runs").toBe(true);
  r.act({ type: "SELECT_TARGET", selectedInstanceIds: [] }, 0);
  expect(r.state.turn.activePlayerIndex).toBe(0);
  expect(isIt(r.state), "gone after p0's step 2").toBe(false);
}

describe("OPT-962 End Phase expiry runs in the effect owner's step", () => {
  it("OP09-081 Teach's [On Play] negation (stored against the affected player) ends in Teach's controller's step", () => {
    const r = endPhaseRig({ handSize: 3, deckSize: 8 });
    const teach = r.put("OP09-081", 0, "LEADER");
    r.putSyn("SYN-P1-CHAR", null, 1, "CHARACTER");
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: teach.instanceId, effectId: "activate_negate_opponent_on_play" });
    for (let i = 0; i < 4 && r.state.pendingPrompt; i += 1) {
      const p = r.state.pendingPrompt;
      if (p.options.promptType === "OPTIONAL_EFFECT") r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      else if (p.options.promptType === "SELECT_TARGET") r.act({ type: "SELECT_TARGET", selectedInstanceIds: p.options.validTargets.slice(0, p.options.countMin || 1) });
      else throw new Error(`unexpected ${p.options.promptType}`);
    }
    const negation = (s: GameState) => s.prohibitions.some((p) => p.scope?.triggerType === "ON_PLAY" && p.sourceCardInstanceId === teach.instanceId);
    expect(negation(r.state)).toBe(true);
    expect(r.state.prohibitions.find((p) => p.scope?.triggerType === "ON_PLAY")).toMatchObject({ controller: 1, ownerController: 0 });
    toP1Main(r);
    expectExpiresInP0StepTwo(r, negation);
  });

  it("a Teach negation saved before ownerController existed falls back to the other player (deterministic legacy owner)", () => {
    const r = endPhaseRig({ handSize: 3, deckSize: 8 });
    const teach = r.put("OP09-081", 0, "LEADER");
    r.putSyn("SYN-P1-CHAR", null, 1, "CHARACTER");
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: teach.instanceId, effectId: "activate_negate_opponent_on_play" });
    for (let i = 0; i < 4 && r.state.pendingPrompt; i += 1) {
      const p = r.state.pendingPrompt;
      if (p.options.promptType === "OPTIONAL_EFFECT") r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      else r.act({ type: "SELECT_TARGET", selectedInstanceIds: (p.options as { validTargets: string[] }).validTargets.slice(0, 1) });
    }
    r.state = {
      ...r.state,
      prohibitions: r.state.prohibitions.map((p) => {
        const legacy = { ...p };
        delete legacy.ownerController;
        return legacy;
      }),
    };
    const negation = (s: GameState) => s.prohibitions.some((p) => p.scope?.triggerType === "ON_PLAY");
    toP1Main(r);
    expectExpiresInP0StepTwo(r, negation);
  });

  it("an APPLY_PROHIBITION 'cannot attack until the end of your opponent's next turn' (OP01-085's action) ends in its controller's step", () => {
    const r = endPhaseRig({ deckSize: 8 });
    const action = getEffectSchema("OP01-085")!.effects![0].actions![0];
    const carrier = r.putSyn("SYN-MR3", synSchema("SYN-MR3", "Character", [{
      id: "mr3-activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [action],
    }]), 0, "CHARACTER");
    const target = r.putSyn("SYN-P1-COST2", null, 1, "CHARACTER", { cost: 2 });
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: carrier.instanceId, effectId: "mr3-activate" });
    if (r.state.pendingPrompt) r.act({ type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] });
    const prohibition = (s: GameState) => s.prohibitions.some((p) => p.prohibitionType === "CANNOT_ATTACK" && p.appliesTo.includes(target.instanceId));
    toP1Main(r);
    expectExpiresInP0StepTwo(r, prohibition);
  });
});
