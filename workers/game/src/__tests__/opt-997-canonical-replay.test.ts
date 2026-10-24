import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { capture, command, memoryRepository } from "./opt-997-corpus-support.js";
import type { Cost } from "../engine/effect-types.js";
import { costReplacementReplayViolation } from "../engine/effect-resolver/cost/replacement-replay.js";

for (const position of ["TOP", "BOTTOM"] as const) for (const accept of [false, true]) {
  it(`canonically parks printed ${position} despite opposite public destination, ${accept ? "accept" : "decline"}`, async () => {
    const r = rig(); r.state.schemaVersion = 7; delete r.state.costSemanticsVersion; r.deck(0, 5); r.deck(1, 5);
    for (let n = 0; n < 3; n++) r.put(`canonical-hand-${n}`, 0, "HAND");
    const cost = { type: "PLACE_SELF_AND_TRASH_TO_DECK", amount: 1, position } as Cost;
    const source = r.put("canonical-source", 0, "CHARACTER", { schema: synSchema("canonical-source", [
      { id: "replace", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true, once_per_turn: true }, replacement_actions: [{ type: "DRAW", params: { amount: 1 } }, { type: "TRASH_FROM_HAND", params: { amount: 1 } }] },
      { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [cost], actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }] },
    ]) });
    r.put("canonical-trash-a", 0, "TRASH"); r.put("canonical-trash-b", 0, "TRASH");
    r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
    const selected = r.state.pendingPrompt!.options;
    if (selected.promptType !== "SELECT_TARGET") throw new Error("missing selection");
    r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [selected.validTargets[0]] }, r.db);
    const arrange = r.state.pendingPrompt!.options;
    if (arrange.promptType !== "ARRANGE_TOP_CARDS") throw new Error("missing arrangement");
    const ordered = arrange.cards.map(c => c.instanceId).reverse();
    const before = structuredClone(r.state);
    // Public guard rejects incomplete, duplicate and foreign orders.
    for (const bad of [ordered.slice(1), [ordered[0], ordered[0]], [ordered[0], "foreign"]]) {
      const { SessionCoordinator } = await import("../session/coordinator.js");
      expect(new SessionCoordinator().executeAction(before, [], 0, { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: bad, destination: "top", promptId: before.pendingPrompt!.promptId }, r.db).kind).toBe("reject");
      expect(r.state).toEqual(before);
    }
    r.state = command(r.state, { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: ordered, destination: position === "TOP" ? "bottom" : "top" }, r.db);
    await capture(r);
    const owner = r.state.effectStack.find(f => f.kind === "COST")!;
    expect(owner.costReplacementAction).toEqual({ type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: ordered, destination: position.toLowerCase() });
    expect(owner.costReplacementResolution).toBeUndefined();
    expect(costReplacementReplayViolation(r.state, owner)).toBeNull();
    const early = await capture(r);
    // Both live and undo contain the strict canonical early-offer payload.
    expect((await memoryRepository(early).repo.load())!.undoHistory[0]).toEqual(r.state);
    const deckBefore = r.state.players[0].deck.map(c => c.cardId);
    const orderedCards = ordered.map(id => id.split("#")[0]);
    r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: accept ? "accept" : "skip" }, r.db);
    await capture(r);
    if (accept) {
      expect(r.state.players[0].deck).toHaveLength(4);
      expect(r.state.players[0].hand).toHaveLength(4);
      const child = r.state.pendingPrompt!.options;
      if (child.promptType !== "SELECT_TARGET") throw new Error("missing substitute child");
      r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: child.validTargets.slice(0, 1) }, r.db);
      expect(r.state.players[0].deck).toHaveLength(4);
      expect(r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(true);
      expect(r.state.eventLog.map(e => e.type)).toEqual(["CARD_DRAWN", "DRAW_OUTSIDE_DRAW_PHASE", "CARD_TRASHED"]);
    } else {
      expect(r.state.players[0].deck.map(c => c.cardId)).toEqual(position === "TOP" ? [...orderedCards, ...deckBefore] : [...deckBefore, ...orderedCards]);
      expect(r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(false);
      expect(r.state.players[0].deck.filter(c => orderedCards.includes(c.cardId)).every(c => !ordered.includes(c.instanceId))).toBe(true);
      expect(r.state.players[0].hand).toHaveLength(3);
    }
    expect(r.state.effectStack).toHaveLength(0); expect(r.state.pendingPrompt).toBeNull();
    await capture(r);
  });
}

for (const selectStage of [false, true]) it(`named hand-or-Stage offered domain, choosing ${selectStage ? "Stage" : "hand"}`, async () => {
  const r = rig(); r.state.schemaVersion = 7; delete r.state.costSemanticsVersion; r.deck(0, 5); r.deck(1, 5);
  const stage = r.put("canonical-named-stage", 0, "STAGE", { data: { type: "Stage" }, schema: synSchema("canonical-named-stage", [
    { id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true }, replacement_actions: [{ type: "DRAW", params: { amount: 1 } }, { type: "TRASH_FROM_HAND", params: { amount: 1 } }] },
  ], "Stage") });
  const handCopy = r.put("canonical-named-stage", 0, "HAND");
  r.put("canonical-other-hand-a", 0, "HAND"); r.put("canonical-other-hand-b", 0, "HAND");
  const activator = r.put("canonical-named-activator", 0, "CHARACTER", { schema: synSchema("canonical-named-activator", [
    { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE", card_name: "canonical-named-stage" }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
  ]) });
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: activator.instanceId, effectId: "activate" }, r.db);
  const options = r.state.pendingPrompt!.options; if (options.promptType !== "SELECT_TARGET") throw new Error("missing named selection");
  expect(new Set(options.validTargets)).toEqual(new Set([stage.instanceId, handCopy.instanceId]));
  r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [selectStage ? stage.instanceId : handCopy.instanceId] }, r.db);
  if (selectStage) {
    expect(r.state.pendingPrompt!.options.promptType).toBe("OPTIONAL_EFFECT");
    await capture(r);
    expect(r.state.effectStack.find(f => f.kind === "COST")!.costReplacementAction).toEqual({ type: "SELECT_TARGET", selectedInstanceIds: [stage.instanceId] });
    r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db); await capture(r);
    const child = r.state.pendingPrompt!.options; if (child.promptType !== "SELECT_TARGET") throw new Error("missing child");
    r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [child.validTargets.find(id => id !== handCopy.instanceId)!] }, r.db);
    expect(r.state.players[0].hand.some(c => c.instanceId === handCopy.instanceId)).toBe(true);
  } else {
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[0].hand.some(c => c.instanceId === handCopy.instanceId)).toBe(false);
  }
  expect(r.state.players[0].stage?.instanceId).toBe(stage.instanceId);
  expect(r.state.players[0].hand).toHaveLength(3);
  expect(r.state.effectStack).toHaveLength(0); await capture(r);
});
