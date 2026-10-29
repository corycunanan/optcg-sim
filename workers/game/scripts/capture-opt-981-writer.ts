/** Run from workers/game; no deployed sessions or network are accessed. */
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { authoredPair, command, saved } from "../src/__tests__/fixtures/opt-981-writer.js";
import { endPhaseRig, synSchema } from "../src/__tests__/opt-962-rig.js";
import type { GameAction, GameState } from "../src/types.js";

async function main() {
const records: unknown[] = [];
async function trace(name: string, r: ReturnType<typeof endPhaseRig>, actions: { owner: 0 | 1; action: GameAction }[], history: GameState[] = []) {
  for (let index = 0; index < actions.length; index++) {
    const before = await saved(r.state, r.db, history);
    const { owner, action } = actions[index];
    const result = command(before.state, r.db, before.history, owner, action);
    const after = await saved(result.state, r.db, result.history);
    records.push({ name: `${name}-${index}`, owner, action: result.action, before: before.storage, after: after.storage,
      replay: before.state.schemaVersion === 11,
      provenance: "Synthetic board, public coordinator action and production persistence writer" });
    r.state = after.state; history = after.history;
  }
  return history;
}
for (const owner of [0, 1] as const) for (const first of [0, 1]) {
  const { r, setupTrace, history: initialHistory } = await authoredPair(owner);
  let history = initialHistory;
  records.push(...setupTrace.map((entry, index) => ({ ...entry, name: `authored-setup-seat${owner}-first${first}-${index}`, replay: false, provenance: "Public authored activation/play setup receipt; reader11 does not enable ordering" })));
  history = await trace(`authored-seat${owner}-first${first}`, r, [
    { owner, action: { type: "ADVANCE_PHASE" } },
    { owner, action: { type: "PLAYER_CHOICE", choiceId: `end-of-turn-obligation:${first}` } },
  ], history);
  for (let index = 0; r.state.pendingPrompt && index < 8; index++) {
    const options = r.state.pendingPrompt.options;
    if (options.promptType !== "PLAYER_CHOICE") throw Error("unexpected authored prompt");
    const choice = options.choices.find(c => c.id === "choose-value:1") ?? options.choices.find(c => !c.disabled)!;
    history = await trace(`authored-seat${owner}-first${first}-nested${index}`, r, [{ owner, action: { type: "PLAYER_CHOICE", choiceId: choice.id } }], history);
  }
  // Real coordinator-generated v11 undo snapshot: the next player's DON attachment.
  const next = r.state.turn.activePlayerIndex;
  history = await trace(`authored-seat${owner}-first${first}-undo`, r, [
    { owner: next, action: { type: "ATTACH_DON", targetInstanceId: r.state.players[next].leader.instanceId, count: 1 } },
    { owner: next, action: { type: "UNDO" } },
  ], history);
}
for (const owner of [0, 1] as const) for (const terminal of [false, true]) {
  const r = endPhaseRig({ deckSize: terminal ? 1 : 6 });
  // Synthetic producer exercises reader interactions; unlike authored-pair records,
  // these schemas deliberately manufacture nested work and watcher/terminal paths.
  const source = r.putSyn("SYN-writer-producer", synSchema("SYN-writer-producer", "Character", [{
    id: "schedule", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [
      { type: "SCHEDULE_ACTION", params: { timing: "END_OF_THIS_TURN", action: { type: "TRASH_CARD", target: { type: "SELF" } } } },
      { type: "SCHEDULE_ACTION", params: { timing: "END_OF_THIS_TURN", action: { type: "ADD_DON_FROM_DECK", params: { amount: 1 } } } },
    ],
  }]), owner, "CHARACTER");
  r.putSyn("SYN-writer-watcher", synSchema("SYN-writer-watcher", "Character", [{
    id: "watch", category: "auto", trigger: { event: "ANY_CHARACTER_TRASHED" }, flags: { optional: true },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  }]), owner, "CHARACTER");
  r.state.turn.activePlayerIndex = owner;
  const setup = command(r.state, r.db, [], owner, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "schedule" });
  r.state = setup.state;
  // Exercise a non-turn owner from a synthetic board boundary; no envelopes retagged.
  r.state.turn.activePlayerIndex = 0;
  await trace(`watcher-owner${owner}-terminal${terminal}`, r, [
    { owner: 0, action: { type: "ADVANCE_PHASE" } },
    { owner, action: { type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:0" } },
    { owner, action: { type: "PLAYER_CHOICE", choiceId: "accept" } },
  ]);
}
for (const owner of [0, 1] as const) {
  const r = endPhaseRig(); r.state.turn.activePlayerIndex = owner;
  const source = r.putSyn("SYN-dynamic-producer", synSchema("SYN-dynamic-producer", "Character", [{
    id: "schedule", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [
      { type: "SCHEDULE_ACTION", params: { timing: "END_OF_THIS_TURN", action: { type: "SCHEDULE_ACTION", params: { timing: "END_OF_THIS_TURN", action: { type: "DRAW", params: { amount: 2 } } } } } },
      { type: "SCHEDULE_ACTION", params: { timing: "END_OF_THIS_TURN", action: { type: "DRAW", params: { amount: 1 } } } },
    ],
  }]), owner, "CHARACTER");
  r.state = command(r.state, r.db, [], owner, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "schedule" }).state;
  r.state.turn.activePlayerIndex = 0;
  await trace(`dynamic-owner${owner}`, r, [
    { owner: 0, action: { type: "ADVANCE_PHASE" } },
    { owner, action: { type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:0" } },
    { owner, action: { type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:1" } },
  ]);
}
const corpus = { producerSourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  producerRuntimeSha256: createHash("sha256").update(readFileSync("src/engine/phases.ts")).digest("hex"),
  deployedReaderSha: "8c8a80bdf93c0d095d10f100feb3e31c60aa3e61", records };
const bytes = JSON.stringify(corpus, null, 2) + "\n";
const output = "src/__tests__/fixtures/opt-981-writer-produced.json.gz";
const compressed = gzipSync(bytes);
writeFileSync(output, compressed);
console.log(JSON.stringify({ output, records: records.length, sha256: createHash("sha256").update(compressed).digest("hex"), payloadSha256: createHash("sha256").update(bytes).digest("hex"), producerSourceSha: corpus.producerSourceSha }));

}
void main();
