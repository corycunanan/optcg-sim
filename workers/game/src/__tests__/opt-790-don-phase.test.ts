import { describe, expect, it } from "vitest";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

// OP13 FAQ p1: an empty field cannot qualify using the DON!! just placed.
// Comprehensive rules v1.2.0 §6-4: first player's first turn places one;
// otherwise two, limited by remaining DON!! deck size.
function fixture(
  player: 0 | 1,
  firstPlayer: 0 | 1,
  turn: number,
  existing: number,
  available: number,
  roger = true
) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.turn = {
    ...state.turn,
    phase: "DON",
    number: turn,
    activePlayerIndex: player,
    firstPlayerIndex: firstPlayer,
  };
  const p = state.players[player];
  if (roger) {
    const schema = getEffectSchema("OP13-003")!;
    db.set("OP13-003", {
      ...CARDS.LEADER,
      id: "OP13-003",
      name: "Gol.D.Roger",
      effectSchema: schema,
    });
    p.leader = { ...p.leader, cardId: "OP13-003" };
    state = registerCardEnteredField(state, p.leader, db.get("OP13-003")!);
  }
  const current = state.players[player];
  current.donCostArea = Array.from({ length: existing }, (_, i) => ({
    instanceId: `old-${i}`,
    state: "ACTIVE" as const,
    attachedTo: null,
  }));
  current.donDeck = Array.from({ length: available }, (_, i) => ({
    instanceId: `new-${i}`,
    state: "ACTIVE" as const,
    attachedTo: null,
  }));
  return { state, db };
}

function check(
  player: 0 | 1,
  firstPlayer: 0 | 1,
  turn: number,
  existing: number,
  available: number,
  placed: number,
  given: number,
  roger = true
) {
  const { state, db } = fixture(
    player,
    firstPlayer,
    turn,
    existing,
    available,
    roger
  );
  const original = structuredClone(state);
  const result = runPipeline(state, { type: "ADVANCE_PHASE" }, db, player);
  expect(result.valid, result.error).toBe(true);
  expect(state).toEqual(original);
  const p = result.state.players[player];
  expect(result.state.turn.phase).toBe("MAIN");
  expect(p.leader.attachedDon).toEqual(
    Array.from({ length: given }, (_, i) => ({
      instanceId: `new-${i}`,
      state: "ACTIVE",
      attachedTo: p.leader.instanceId,
    }))
  );
  expect(p.donCostArea.map((d) => d.instanceId)).toEqual([
    ...Array.from({ length: existing }, (_, i) => `old-${i}`),
    ...Array.from({ length: placed - given }, (_, i) => `new-${i + given}`),
  ]);
  expect(p.donDeck.map((d) => d.instanceId)).toEqual(
    Array.from({ length: available - placed }, (_, i) => `new-${i + placed}`)
  );
  const events = result.state.eventLog.slice(original.eventLog.length);
  expect(
    events
      .filter((e) =>
        ["DON_PLACED_ON_FIELD", "DON_GIVEN_TO_CARD", "PHASE_CHANGED"].includes(
          e.type
        )
      )
      .map((e) => e.type)
  ).toEqual([
    "DON_PLACED_ON_FIELD",
    ...(given ? ["DON_GIVEN_TO_CARD"] : []),
    "PHASE_CHANGED",
  ]);
  expect(
    events.filter((e) => e.type === "DON_PLACED_ON_FIELD").map((e) => e.payload)
  ).toEqual([{ count: placed }]);
  expect(
    events
      .filter((e) => e.type === "DON_GIVEN_TO_CARD")
      .map((e) => ({ playerIndex: e.playerIndex, payload: e.payload }))
  ).toEqual(
    given
      ? [
          {
            playerIndex: player,
            payload: { targetInstanceId: p.leader.instanceId, count: given },
          },
        ]
      : []
  );
  expect(result.state.players[player === 0 ? 1 : 0]).toEqual(
    original.players[player === 0 ? 1 : 0]
  );
}

describe("OPT-790 authored Roger DON!! phase through the action pipeline", () => {
  for (const player of [0, 1] as const) {
    for (const firstPlayer of [0, 1] as const) {
      it(`keeps the empty first turn in cost area: seat ${player}, first seat ${firstPlayer}`, () => {
        check(player, firstPlayer, 1, 0, 10, player === firstPlayer ? 1 : 2, 0);
      });
    }
    for (const available of [0, 1, 2]) {
      it(`routes only newly placed DON!!: seat ${player}, ${available} available`, () => {
        check(player, 0, 3, 8, available, available, available ? 1 : 0);
      });
      it(`does not self-qualify on a later empty field: seat ${player}, ${available} available`, () => {
        check(player, 0, 3, 0, available, available, 0);
      });
    }
    for (const target of ["leader", "character"] as const) {
      it(`qualifies from existing attached DON!! on a ${target}: seat ${player}`, () => {
        const { state, db } = fixture(player, 0, 3, 0, 2);
        const p = state.players[player];
        const holder =
          target === "leader"
            ? p.leader
            : p.characters.find((c) => c !== null)!;
        const existingDon = {
          instanceId: "existing-attached",
          state: "ACTIVE" as const,
          attachedTo: holder.instanceId,
        };
        holder.attachedDon = [existingDon];
        const result = runPipeline(
          state,
          { type: "ADVANCE_PHASE" },
          db,
          player
        );
        expect(result.valid, result.error).toBe(true);
        const after = result.state.players[player];
        expect(after.leader.attachedDon).toEqual([
          ...(target === "leader" ? [existingDon] : []),
          {
            instanceId: "new-0",
            state: "ACTIVE",
            attachedTo: p.leader.instanceId,
          },
        ]);
        if (target === "character") {
          expect(
            after.characters.find((c) => c?.instanceId === holder.instanceId)
              ?.attachedDon
          ).toEqual([existingDon]);
        }
        expect(after.donCostArea.map((d) => d.instanceId)).toEqual(["new-1"]);
        expect(after.donDeck).toEqual([]);
        expect(
          result.state.eventLog
            .slice(state.eventLog.length)
            .filter((e) => e.type === "DON_GIVEN_TO_CARD")
            .map((e) => e.payload)
        ).toEqual([{ targetInstanceId: p.leader.instanceId, count: 1 }]);
      });
    }
    it(`preserves ordinary Leader placement: seat ${player}`, () => {
      check(player, 0, 3, 2, 2, 2, 0, false);
    });
  }
});
