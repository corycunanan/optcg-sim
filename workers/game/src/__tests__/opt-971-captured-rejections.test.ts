import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertPersistedGameState } from "../session/persistence.js";
import { readGameStateSchemaVersion } from "../session/game-state-schema.js";
import { ensureExecutionContext } from "../engine/execution-context.js";
import type { GameState } from "../types.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";

const directory = new URL("./fixtures/opt-971-captured/", import.meta.url);
const digest = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(
  readFileSync(new URL("manifest.json", directory), "utf8")
) as {
  provenance: string;
  rawReaderAcceptedCaptures: number;
  cases: {
    file: string;
    sha256: string;
    bytes: number;
    status: string;
    phase: string;
    rawError: string;
    scratchContextAdapterError: string;
  }[];
};

// Actual sanitized stored terminal sessions. These pin an observed rejection,
// not a newly approved rejection policy; update with a reviewed compatibility
// disposition. They are not synthetic states, captured undo, or active pauses.
describe("OPT-971 captured unversioned admission gap", () => {
  it.each(manifest.cases)(
    "$file retains immutable provenance and raw reader rejection",
    (entry) => {
      const bytes = readFileSync(new URL(entry.file, directory));
      expect(digest(bytes)).toBe(entry.sha256);
      expect(bytes.length).toBe(entry.bytes);
      const capture = JSON.parse(bytes.toString("utf8")) as {
        state: GameState;
        undoHistory: unknown[];
        provenance: { source: string; sanitizationVersion: number };
      };
      const before = digest(JSON.stringify(capture));
      expect(manifest.provenance).toBe("captured");
      expect(capture.provenance.source).toBe("durable-object-storage");
      expect(capture.provenance.sanitizationVersion).toBe(1);
      expect(Object.hasOwn(capture.state, "schemaVersion")).toBe(false);
      expect(Object.hasOwn(capture.state, "executionContext")).toBe(false);
      expect(
        readGameStateSchemaVersion(
          { schemaVersion: capture.state.schemaVersion },
          "state"
        )
      ).toBe(1);
      expect(capture.state.status).toBe(entry.status);
      expect(capture.state.turn.phase).toBe(entry.phase);
      expect(capture.state.pendingPrompt === null).toBe(true);
      expect(capture.state.effectStack.length).toBe(0);
      expect(capture.undoHistory.length).toBe(0);
      expect(() => convertPersistedGameState(capture.state, "state")).toThrow(
        entry.rawError
      );
      // Digest assertions avoid dumping hidden game structure on a failed test.
      expect(digest(JSON.stringify(capture))).toBe(before);
      expect(digest(readFileSync(new URL(entry.file, directory)))).toBe(
        entry.sha256
      );
    }
  );

  it.each(manifest.cases)(
    "$file still rejects after only the existing context adapter on a scratch clone",
    (entry) => {
      const bytes = readFileSync(new URL(entry.file, directory));
      const capture = JSON.parse(bytes.toString("utf8")) as {
        state: GameState;
      };
      const before = digest(JSON.stringify(capture));
      // Diagnostic only: production invokes this helper AFTER strict conversion,
      // so neither raw captured state reaches it. Never rewrite the fixture.
      const scratch = ensureExecutionContext(structuredClone(capture.state));
      expect(Object.hasOwn(scratch, "executionContext")).toBe(true);
      expect(() => convertPersistedGameState(scratch, "state")).toThrow(
        entry.scratchContextAdapterError
      );
      expect(digest(JSON.stringify(capture))).toBe(before);
      expect(digest(readFileSync(new URL(entry.file, directory)))).toBe(
        entry.sha256
      );
    }
  );

  it("keeps a valid synthetic v1 control readable and does not claim any captured undo", () => {
    const golden = loadGoldenFixture().cases["fresh-setup"];
    const valid = JSON.parse(golden.sessionJson).state;
    expect(readGameStateSchemaVersion(valid, "state")).toBe(1);
    expect(() => convertPersistedGameState(valid, "state")).not.toThrow();
    expect(manifest.rawReaderAcceptedCaptures).toBe(0);
    expect(manifest.cases.length).toBe(2);
  });

  it.each(manifest.cases)(
    "$file retains publication privacy checks without logging payloads",
    (entry) => {
      const text = readFileSync(new URL(entry.file, directory), "utf8");
      const capture = JSON.parse(text) as {
        state: GameState;
        undoHistory: unknown[];
      };
      expect(/^captured-game-\d+$/.test(capture.state.id)).toBe(true);
      expect(
        capture.state.players.every((player) =>
          /^captured-player-\d+$/.test(player.playerId)
        )
      ).toBe(true);
      // The private candidate-ID/secret scanner and full schema/string review ran
      // before publication. Those secrets and their alias map are never fixtures.
      expect(
        /https?:\/\/|consumedTokenJtis|tokenLedger|accessToken|refreshToken|GAME_WORKER_SECRET|"cardDb"/.test(
          text
        )
      ).toBe(false);
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        for (const [key, child] of Object.entries(value)) {
          if (["sleeveUrl", "donArtUrl", "imageUrl"].includes(key))
            expect(child === null).toBe(true);
          visit(child);
        }
      };
      visit(capture);
    }
  );
});
