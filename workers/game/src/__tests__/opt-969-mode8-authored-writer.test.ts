/** Fresh current-bundle gameplay, separate from carried saved-definition corpus. */
import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { runtime, memory, save, command } from "./native7-producer-support.js";
import { getEffectivePower } from "../engine/modifiers.js";

for (const activeCount of [0, 1, 2]) it(`current EB02-061 requires two active DON through actual attack/reload: active=${activeCount}`, async () => {
  const r = rig(); expect(r.state.costSemanticsVersion).toBe(8);
  r.deck(0, 5); r.deck(1, 5); r.life(0, 1);
  const luffy = r.put("EB02-061", 0, "CHARACTER");
  const p = r.state.players[0]; const all = p.donCostArea;
  const active = all.slice(0, activeCount); const rested = { ...all[2], state: "RESTED" as const };
  const donor = { ...all[3], attachedTo: p.leader.instanceId };
  p.donCostArea = [...active, rested]; p.leader.attachedDon = [donor];
  p.donDeck.push(...all.filter(d => ![...active, rested, donor].some(kept => kept.instanceId === d.instanceId)));
  const deck = structuredClone(p.donDeck); const attached = structuredClone(p.leader.attachedDon);
  const rt = await runtime();
  r.state = command(rt, r.state, r.db, { type: "DECLARE_ATTACK", attackerInstanceId: luffy.instanceId, targetInstanceId: r.state.players[1].leader.instanceId });
  if (activeCount < 2) {
    expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
    expect(r.state.players[0].donDeck).toEqual(deck); expect(r.state.players[0].life).toHaveLength(1);
    expect(r.state.players[0].characters[0]!.state).toBe("RESTED");
    expect(r.state.turn.oncePerTurnUsed.when_attacking_untap_life ?? []).not.toContain(luffy.instanceId);
    return;
  }
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  const floor = await runtime(process.env.OPT969_WRITER_FLOOR_ROOT);
  const loaded = (await memory(floor, await save(rt, r.state, r.db)).repo.load())!;
  const done = command(floor, loaded.state, loaded.cardDb, { type: "PLAYER_CHOICE", choiceId: "accept" });
  expect(done.pendingPrompt).toBeNull(); expect(done.effectStack).toHaveLength(0);
  expect(done.players[0].donCostArea).toEqual([rested]); expect(done.players[0].leader.attachedDon).toEqual(attached);
  expect(done.players[0].donDeck.map(d => d.instanceId).sort()).toEqual([...deck, ...active].map(d => d.instanceId).sort());
  expect(done.players[0].life).toHaveLength(0); expect(done.players[0].hand).toHaveLength(1);
  expect(done.players[0].characters[0]!.state).toBe("ACTIVE");
  expect(done.turn.oncePerTurnUsed.when_attacking_untap_life).toContain(luffy.instanceId);
});

for (const cardId of ["OP12-070", "OP15-069"]) for (const domain of ["leader", "character", "stage-only", "none"] as const)
it(`current ${cardId} field substitute ${domain} through public removal/reload`, async () => {
  const r = rig(); expect(r.state.costSemanticsVersion).toBe(8); r.deck(0, 5); r.deck(1, 5);
  const victim = r.put(cardId, 0, "CHARACTER"); const p = r.state.players[0];
  const [donor, ...reserve] = p.donCostArea; p.donCostArea = []; p.donDeck.push(...reserve);
  const host = domain === "character" ? victim : domain === "stage-only" ? r.put("writer-donor-stage", 0, "STAGE") : p.leader;
  if (domain === "none") p.donDeck.push(donor);
  else host.attachedDon = [{ ...donor, attachedTo: host.instanceId }];
  const deck = structuredClone(p.donDeck);
  const power = getEffectivePower(host, r.db.get(host.cardId)!, { ...r.state, turn: { ...r.state.turn, activePlayerIndex: 0 } }, r.db);
  const source = r.put(`writer-remove-${cardId}`, 1, "CHARACTER", { schema: synSchema(`writer-remove-${cardId}`, [{
    id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" },
    actions: [{ type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } } }],
  }]) });
  r.state.turn.activePlayerIndex = 1;
  const rt = await runtime();
  r.state = command(rt, r.state, r.db, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  if (domain === "stage-only" || domain === "none") {
    expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
    expect(r.state.players[0].characters.some(c => c?.instanceId === victim.instanceId)).toBe(false);
    expect(r.state.players[0].hand.map(c => c.cardId)).toEqual([cardId]);
    expect(r.state.players[0].donDeck).toEqual(deck);
    if (domain === "stage-only") expect(r.state.players[0].stage!.attachedDon.map(d => d.instanceId)).toEqual([donor.instanceId]);
    return;
  }
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  const floor = await runtime(process.env.OPT969_WRITER_FLOOR_ROOT);
  const loaded = (await memory(floor, await save(rt, r.state, r.db)).repo.load())!;
  const done = command(floor, loaded.state, loaded.cardDb, { type: "PLAYER_CHOICE", choiceId: "accept" });
  expect(done.pendingPrompt).toBeNull(); expect(done.effectStack).toHaveLength(0);
  expect(done.players[0].characters.some(c => c?.instanceId === victim.instanceId)).toBe(true);
  expect(done.players[0].hand).toHaveLength(0); expect(done.players[0].donCostArea).toHaveLength(0);
  expect(done.players[0].donDeck.map(d => d.instanceId).sort()).toEqual([...deck, donor].map(d => d.instanceId).sort());
  const afterHost = domain === "character" ? done.players[0].characters.find(c => c?.instanceId === host.instanceId)! : done.players[0].leader;
  expect(afterHost.attachedDon).toHaveLength(0);
  expect(getEffectivePower(afterHost, loaded.cardDb.get(afterHost.cardId)!, { ...done, turn: { ...done.turn, activePlayerIndex: 0 } }, loaded.cardDb)).toBe(power - 1000);
  expect(done.eventLog.filter(e => e.type === "DON_DETACHED")).toHaveLength(1);
});
