/**
 * OPT-963 design note §5 / PR #758 N2: effect damage dealt by an [End of
 * Your Turn] wave effect. `parkEndPhaseAt` inserts the PHASE_BOUNDARY frame at
 * the depth the stage started from, so the wave's chain continuation and its
 * EFFECT_DAMAGE window sit above the parked End Phase; the unwind reaches the
 * window, then the chain, then the End Phase (rule 6-6-1, 8-6-2-1).
 *
 * SYNTHETIC: no authored [End of Your Turn] effect deals multi-point damage.
 * Boundary: the pipeline (ADVANCE_PHASE), the prompt lifecycle (the reply) and
 * SessionRepository.save/.load (the round trip at the window).
 */
import { describe, expect, it } from "vitest";
import { frameKindOf } from "../engine/frame-kinds.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";
import { CARDS } from "./helpers.js";

const REPO = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };

describe("OPT-963: effect damage inside an End Phase wave parks beneath the PHASE_BOUNDARY frame and resumes", () => {
  it("the Trigger window opens above the parked End Phase, round-trips, and after the decline the second point lands, the suffix draws and the turn passes", async () => {
    const r = endPhaseRig({ handSize: 2, deckSize: 6 });
    const DEALER = "SYN-EOYT-DEAL2";
    r.putSyn(
      DEALER,
      synSchema(DEALER, "Character", [
        {
          id: "eoyt-deal",
          category: "auto",
          trigger: { keyword: "END_OF_YOUR_TURN" },
          actions: [
            { type: "DEAL_DAMAGE", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount: 2 } },
            { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
          ],
        },
      ]),
      0,
      "CHARACTER"
    );
    // A [Trigger] card on top of p1's Life.
    const players = [...r.state.players] as typeof r.state.players;
    players[1] = { ...players[1], life: [{ instanceId: "life-1-trigger", cardId: CARDS.TRIGGER.id, face: "DOWN" }, ...players[1].life.slice(1)] };
    r.state = { ...r.state, players };
    const hand0 = r.state.players[0].hand.length;
    const life1 = r.state.players[1].life.length;

    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.turn.phase).toBe("END");
    expect(r.state.effectStack.map(frameKindOf)).toEqual(["PHASE_BOUNDARY", "TRIGGER_EXECUTION", "TRIGGER_DRAIN", "EFFECT_DAMAGE"]);
    expect(r.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    expect(r.state.pendingPrompt?.respondingPlayer).toBe(1);
    // The first point is logged while the window is open; nothing after it yet.
    expect(r.log()).toContain("TRIGGER_ACTIVATED:p1");
    expect(r.log()).not.toContain("TURN_ENDED:p0");
    expect(r.state.players[0].hand).toHaveLength(hand0);

    // Round trip at the window through the real repository.
    const storage = new MemorySessionStorage();
    await new SessionRepository(storage, REPO).save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] });
    const loaded = (await new SessionRepository(storage, REPO).load())!;
    // The repository stamps the stored prompt with an id (one allocation); everything else is identical.
    const comparable = (state: typeof r.state) =>
      JSON.parse(JSON.stringify({
        ...toPersistedGameState(state),
        executionContext: { ...state.executionContext, idCounter: 0 },
        pendingPrompt: state.pendingPrompt ? { ...state.pendingPrompt, promptId: undefined } : null,
      }));
    expect(comparable(loaded.state)).toEqual(comparable(r.state));
    expect(toPersistedGameState(loaded.state).effectStack).toEqual(toPersistedGameState(r.state).effectStack);
    r.state = loaded.state;

    r.act({ type: "REVEAL_TRIGGER", reveal: false });
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack).toEqual([]);
    expect(r.state.players[1].life).toHaveLength(life1 - 2);
    expect(r.state.players[0].hand).toHaveLength(hand0 + 1);
    const log = r.log();
    expect(log.indexOf("CARD_DRAWN:p0")).toBeGreaterThan(log.indexOf("TRIGGER_ACTIVATED:p1"));
    expect(log.indexOf("TURN_ENDED:p0")).toBeGreaterThan(log.indexOf("CARD_DRAWN:p0"));
    expect(r.state.turn.activePlayerIndex).toBe(1);
  });
});
