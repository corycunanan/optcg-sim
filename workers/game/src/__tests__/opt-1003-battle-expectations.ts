import type { GameEvent, GameState } from "../types.js";
import { writerEnvelope } from "./opt-1003-writer-expectations.js";

/** New, separately authored writer expectations; frozen producer outputs stay untouched.
 * Completion allocates one ef ID. The committed prefix through END_OF_BATTLE
 * stays exact. Its child reports now run before the two completion reports;
 * terminal children cancel those reports and their four remaining clock ticks.
 * These fixed timestamp schedules are part of the contract, not normalization
 * of observed output. Every other gameplay/allocator/evidence field stays exact.
 */
const schedules: Record<
  string,
  { suffix: [GameEvent["type"], number][]; clock?: number; drawIds: string[] }
> = {
  "battle substitute": {
    drawIds: ["card_0000004e"],
    suffix: [
      ["CARD_DRAWN", 31],
      ["DRAW_OUTSIDE_DRAW_PHASE", 32],
      ["BATTLE_RESOLVED", 35],
      ["PHASE_CHANGED", 36],
    ],
  },
  "terminal battle substitute": {
    drawIds: ["card_0000004e"],
    suffix: [
      ["CARD_DRAWN", 32],
      ["DRAW_OUTSIDE_DRAW_PHASE", 33],
      ["GAME_OVER", 34],
    ],
    clock: 35,
  },
  "Morley rest": {
    drawIds: ["card_0000004c", "card_0000004d"],
    suffix: [
      ["CARD_DRAWN", 31],
      ["DRAW_OUTSIDE_DRAW_PHASE", 32],
      ["CARD_DRAWN", 35],
      ["DRAW_OUTSIDE_DRAW_PHASE", 36],
      ["BATTLE_RESOLVED", 39],
      ["PHASE_CHANGED", 40],
    ],
  },
  "battle immediate": {
    drawIds: ["card_00000049", "card_0000004a"],
    suffix: [
      ["CARD_DRAWN", 24],
      ["DRAW_OUTSIDE_DRAW_PHASE", 25],
      ["CARD_DRAWN", 28],
      ["DRAW_OUTSIDE_DRAW_PHASE", 29],
      ["BATTLE_RESOLVED", 32],
      ["PHASE_CHANGED", 33],
    ],
  },
};
export function currentBattleExpected(
  name: string,
  historical: GameState,
  battleNotYetEnded: boolean
): GameState {
  const expected = writerEnvelope(structuredClone(historical));
  if (!battleNotYetEnded) return expected; // Old EOB prompts keep their already-committed meaning.
  const schedule = schedules[name];
  if (!schedule)
    throw new Error(`No independently specified battle schedule for ${name}`);
  const end = expected.eventLog.findIndex((e) => e.type === "END_OF_BATTLE");
  const remaining = expected.eventLog.slice(end + 1);
  const suffix = schedule.suffix.map(([type, timestamp]) => {
    const index = remaining.findIndex((e) => e.type === type);
    if (index < 0) throw new Error(`Missing historical event template ${type}`);
    return { ...remaining.splice(index, 1)[0], timestamp };
  });
  // drawCards transitions DECK→HAND by allocating a fresh card ID. The
  // one completion ef allocation precedes these draws in the shared counter.
  const hand = expected.players[0].hand;
  schedule.drawIds.forEach((id, index) => {
    hand[hand.length - schedule.drawIds.length + index].instanceId = id;
  });
  return {
    ...expected,
    eventLog: [...expected.eventLog.slice(0, end + 1), ...suffix],
    executionContext: {
      ...expected.executionContext!,
      idCounter: expected.executionContext!.idCounter + 1,
      ...(schedule.clock === undefined ? {} : { clockCounter: schedule.clock }),
    },
  };
}

/** The two OPT-968 families have no EOB child. Publication moves to the
 * completion drain's independent report boundary (fixed ticks25/26); every
 * preceding event and the final clockCounter29 remain exact. */
export function current968BattleExpected(
  name: string,
  historical: unknown
): unknown {
  const expected = writerEnvelope(structuredClone(historical)) as GameState;
  if (
    !name.includes("battle-decline-next-followed") &&
    !name.includes(
      "olicy-assumed-no-official-ruling-the-affected-card-s-own-replacement"
    )
  )
    return expected;
  const end = expected.eventLog.findIndex((e) => e.type === "END_OF_BATTLE");
  if (end < 0) throw new Error("Expected the named battle's EOB publication");
  return {
    ...expected,
    eventLog: expected.eventLog.map((e, index) =>
      index > end && e.type === "BATTLE_RESOLVED"
        ? { ...e, timestamp: 25 }
        : index > end && e.type === "PHASE_CHANGED"
          ? { ...e, timestamp: 26 }
          : e
    ),
    executionContext: {
      ...expected.executionContext!,
      idCounter: expected.executionContext!.idCounter + 1,
    },
  };
}
