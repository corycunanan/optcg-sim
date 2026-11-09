import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { SessionRepository } from "../session/persistence.js";
import { command } from "./fixtures/opt-981-writer.js";
import { withoutAssertedEndReasonCode } from "./end-reason-code-support.js";
const bytes = readFileSync(new URL("./fixtures/opt-981-writer-produced.json.gz", import.meta.url));
const corpus = JSON.parse(gunzipSync(bytes).toString());
/** Recorded in docs/game-engine/audits/opt-981/writer/rollout.md. */
const ARCHIVE_SHA256 = "bfaa3aeddfb353c44f52b1f6a4caf2e8082f66eab4274c9b24eb92bc27aa01c8";
const PRODUCER_PHASES_SHA256 = "48a18eb6084eac1f3c0370ccbb7a0be7cbf9029228e990b7704bc9745fca2abd";

interface SavedState {
  pendingPrompt: { promptId: string; resumeContext: unknown; options: { choices?: { id: string }[] } };
  executionContext: { idCounter: number; actionBudget: { consumed: number } };
  engineActionCount: number;
}
type Envelope = Record<string, { state?: SavedState }>;
interface CorpusRecord { name: string; action: { type: string; choiceId?: string; promptId?: string }; after: Envelope; replay: boolean }

/** The receipt after `after` answers a CHOOSE_VALUE prompt whose only value is 0. */
function isLoneZeroValuePrompt(after: Envelope, next: CorpusRecord): boolean {
  const prompt = after["session"]?.state?.pendingPrompt;
  const choices = prompt?.options?.choices;
  return next.replay && !!prompt &&
    Array.isArray(choices) && choices.length === 1 && choices[0].id === "choose-value:0" &&
    next.action.choiceId === "choose-value:0" && next.action.promptId === prompt.promptId;
}

/**
 * `expected` with the skipped prompt's two allocated ids (its frame and its
 * prompt) removed: later generated ids shift down by 2, and the id counter,
 * action budget and engine action count drop by the one skipped answer.
 */
function withoutSkippedPrompt(expected: Envelope, skippedAfter: Envelope): Envelope {
  const state = skippedAfter["session"]!.state!;
  const firstSkipped = parseInt(String(state.pendingPrompt.resumeContext).replace(/^ef_/, ""), 16);
  const shifted = JSON.parse(JSON.stringify(expected).replace(/\b(ef|prompt)_([0-9a-f]{8})\b/g, (whole, kind: string, hex: string) => {
    const value = parseInt(hex, 16);
    return value >= firstSkipped ? `${kind}_${(value - 2).toString(16).padStart(8, "0")}` : whole;
  })) as Envelope;
  const session = shifted["session"]!.state!;
  session.executionContext.idCounter -= 2;
  session.executionContext.actionBudget.consumed -= 1;
  session.engineActionCount -= 1;
  return shifted;
}

describe("OPT-981 immutable actual writer corpus", () => {
  it("pins the producing runtime and distinguishes public producer receipts from reader replays", () => {
    expect(corpus.producerSourceSha).toMatch(/^[0-9a-f]{40}$/);
    // The archive is immutable evidence of what the OPT-981 producer wrote.
    // Pin the archive bytes and the producer's recorded phases.ts hash (audit
    // doc rollout.md), not today's phases.ts: the live engine may change, and
    // the replay below is what proves it still reads these saves (OPT-1036).
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(ARCHIVE_SHA256);
    expect(corpus.producerRuntimeSha256).toBe(PRODUCER_PHASES_SHA256);
    expect(corpus.deployedReaderSha).toBe("8c8a80bdf93c0d095d10f100feb3e31c60aa3e61");
    const promoted = corpus.records.filter((record: { before: Record<string, { state?: { schemaVersion?: number } }>; after: Record<string, { state?: { schemaVersion?: number } }> }) =>
      record.before["session"].state?.schemaVersion === 10 && record.after["session"].state?.schemaVersion === 11);
    expect(promoted).toHaveLength(10);
    expect(corpus.records.filter((record: { replay: boolean }) => record.replay)).toHaveLength(32);
  });

  it("loads every live/undo envelope and exactly replays each recorded native11 action", async () => {
    let zeroPromptReceipts = 0;
    for (const [index, record] of corpus.records.entries()) {
      const storage = new MemorySessionStorage();
      for (const [key, value] of Object.entries(record.before)) storage.data.set(key, value);
      const repository = new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "synthetic" });
      const before = (await repository.load())!;
      if (record.replay) {
        const result = command(before.state, before.cardDb, before.undoHistory, record.owner, record.action);
        await repository.save({ ...before, state: result.state, undoHistory: result.history });
        const replayed = withoutAssertedEndReasonCode(JSON.parse(JSON.stringify(Object.fromEntries(storage.data))));
        const next = corpus.records[index + 1];
        if (next && isLoneZeroValuePrompt(record.after, next)) {
          // OPT-918: the archived Rayleigh "add up to N DON!!" with an empty
          // DON!! deck paused on a prompt whose only answer was 0, which the
          // next receipt answers. That prompt is now resolved in place, so the
          // replay must equal the next receipt's state, less exactly the
          // skipped prompt: its frame and prompt ids and one engine action.
          expect(replayed, record.name).toEqual(withoutSkippedPrompt(next.after, record.after));
          zeroPromptReceipts += 1;
        } else {
          expect(replayed, record.name).toEqual(record.after);
        }
      }
      for (const [key, value] of Object.entries(record.after)) storage.data.set(key, value);
      expect(await repository.load(), record.name).not.toBeNull();
    }
    expect(zeroPromptReceipts).toBe(2);
  });
});
