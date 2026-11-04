import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import type { CardData, GameState } from "../types.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { classifyLegacyShapes } from "../session/game-state-schema.js";
import { rig } from "./opt-960-rig.js";
const directory = resolve(__dirname, "fixtures/opt-1004-writer-policy-legacy");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
const corpus = JSON.parse(gunzipSync(readFileSync(resolve(directory, "cases.json.gz"))).toString()) as { cases: Record<string, { state: GameState; cardDb: Record<string, CardData> }> };
it("pins actual main67cbb legacy obligation output and producing source", () => {
 expect(manifest.producer).toBe("67cbbde3622fb13600084e1f73edc67e15dff910");
 for (const [file, digest] of Object.entries(manifest.files)) expect(createHash("sha256").update(readFileSync(resolve(directory, file))).digest("hex")).toBe(digest);
});
for (const [id, input] of Object.entries(corpus.cases)) it(`retains unknown old ${id} obligation without fabricating provenance`, () => {
 const r = rig(); r.state = convertPersistedGameState(structuredClone(input.state), "old-producer");
 r.db.clear(); Object.entries(input.cardDb).forEach(([key, value]) => r.db.set(key, structuredClone(value)));
 expect(r.state.schemaVersion).toBe(8);
 expect(r.state.scheduledActions[0].sourceCardSnapshot).toBeUndefined();
 expect(r.state.scheduledActions[0].sourceIdentity).toBeUndefined();
 expect(classifyLegacyShapes(r.state).some(report => report.shape === "legacy.scheduled_origin_unknown")).toBe(true);
 const before = r.state.eventLog.filter(event => event.type === "DON_SET_ACTIVE").length;
 r.act({ type: "ADVANCE_PHASE" });
 if (r.state.pendingPrompt) r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
 expect(r.state.eventLog.filter(event => event.type === "DON_SET_ACTIVE")).toHaveLength(before + 1);
});
