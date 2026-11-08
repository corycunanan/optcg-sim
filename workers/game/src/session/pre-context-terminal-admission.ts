/**
 * OPT-1013: read-only admission of terminal saves written before the engine
 * persisted an execution context (OPT-477) or a complete pregame record.
 *
 * Contract: docs/game-engine/SAVED-STATE-COMPATIBILITY.md §4.2. Such a save
 * has no `schemaVersion` (so it is version 1, §1.1) and no
 * `executionContext`. It is admitted only when it is terminal and holds no
 * paused work, because then no RNG draw, id allocation, pregame step or
 * continuation can ever run from it again. Everything else of this shape
 * keeps rejecting with a named SessionLoadError (§5.2).
 *
 * The fills are the historical meanings, never guesses about lost work:
 *
 * - `executionContext`: the deterministic `legacy:<gameId>` context that
 *   `ensureExecutionContext` already defines for pre-OPT-477 snapshots. Its id
 *   counter is raised past every id in the state after strict validation.
 * - `pregame` absent: `null`, which is what the current engine stores once
 *   pregame is done and when a game is abandoned during pregame
 *   (`terminateGame` with `clearPregame`).
 * - `pregame.startOfGameEffectsResolved` absent: `[false, false]` only while
 *   the recorded pregame phase precedes `START_OF_GAME_FX`, where no
 *   start-of-game effect can have resolved. This is also the value the
 *   engine's own `advanceStartOfGameEffects` reads for an absent ledger. In a
 *   later phase the ledger is unknowable, so the save is rejected.
 *
 * Nothing else is filled, so strict validation still rejects every other
 * omission or unknown key. The raw object is never mutated.
 */

import { createDeterministicExecutionContext } from "../engine/execution-context.js";
import { SessionLoadError } from "./game-state-schema.js";

const TERMINAL_STATUSES: ReadonlySet<unknown> = new Set(["FINISHED", "ABANDONED"]);
const PHASES_BEFORE_START_OF_GAME_EFFECTS: ReadonlySet<unknown> = new Set([
  "PRIORITY_ROLLING",
  "PRIORITY_CHOICE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True for an unversioned stored game state that predates the execution context. */
export function isPreContextSave(raw: unknown): raw is Record<string, unknown> {
  return isRecord(raw) && !("schemaVersion" in raw) && !("executionContext" in raw);
}

/**
 * Returns `raw` unchanged unless it is a pre-context save; returns a filled
 * copy for an admissible terminal one; throws for any other pre-context save.
 */
export function admitPreContextTerminalSave(
  raw: unknown,
  location: string
): unknown {
  if (!isPreContextSave(raw)) return raw;
  const reject = (reason: string): never => {
    throw new SessionLoadError(
      location,
      `is an unversioned save without executionContext (pre-OPT-477) ${reason}; only terminal saves with no paused work are admitted (SAVED-STATE-COMPATIBILITY.md §4.2)`
    );
  };
  if (!TERMINAL_STATUSES.has(raw.status)) reject(`with status ${JSON.stringify(raw.status)}`);
  if (raw.pendingPrompt !== null) reject("with a pending prompt");
  if (!Array.isArray(raw.effectStack) || raw.effectStack.length > 0) reject("with effect-stack work");
  if (typeof raw.id !== "string") reject("without a game id");

  const pregame = admittedPregame(raw, reject);
  const gameId = raw.id as string;
  return {
    ...raw,
    executionContext: createDeterministicExecutionContext(`legacy:${gameId}`, { gameId }),
    pregame,
  };
}

function admittedPregame(
  raw: Record<string, unknown>,
  reject: (reason: string) => never
): unknown {
  if (!("pregame" in raw)) return null;
  const pregame = raw.pregame;
  if (!isRecord(pregame) || "startOfGameEffectsResolved" in pregame) return pregame;
  if (!PHASES_BEFORE_START_OF_GAME_EFFECTS.has(pregame.phase)) {
    reject(`whose pregame phase ${JSON.stringify(pregame.phase)} has no start-of-game effect ledger`);
  }
  return { ...pregame, startOfGameEffectsResolved: [false, false] };
}
