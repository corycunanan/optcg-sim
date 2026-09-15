import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { executeTrashFromHand } from "../engine/effect-resolver/actions/removal.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  visibleStateForPlayer,
  visibleStateForSpectator,
} from "../session/visibility.js";
import { SessionCoordinator } from "../session/coordinator.js";
import {
  filterPromptForRecipient,
  filterPromptForPlayer,
} from "../engine/visibility.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    const value: CardData = {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    };
    db.set(id, value);
    return value;
  }
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER"
  ) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `test-instance-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "STAGE") p.stage = card;
    else if (zone === "CHARACTER")
      p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    else if (zone === "TRASH") p.trash.push(card);
    else if (zone === "DECK") p.deck.push(card);
    if (["LEADER", "STAGE", "CHARACTER"].includes(zone))
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(action: GameAction, player = state.turn.activePlayerIndex) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function choice(action: GameAction, rejected = false) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(
      result.responseRejected,
      JSON.stringify({ action, prompt: state.pendingPrompt })
    ).toBe(rejected);
    state = result.state;
  }
  function select(ids: string[], rejected = false) {
    choice({ type: "SELECT_TARGET", selectedInstanceIds: ids }, rejected);
  }
  function accept() {
    choice({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
  function targets() {
    const options = state.pendingPrompt?.options;
    expect(options?.promptType).toBe("SELECT_TARGET");
    if (options?.promptType !== "SELECT_TARGET")
      throw new Error(JSON.stringify(options));
    return options;
  }
  return {
    db,
    data,
    put,
    act,
    choice,
    select,
    accept,
    targets,
    persist() {
      state = parseStoredSession(
        JSON.parse(
          JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })
        )
      ).state;
    },
    get state() {
      return state;
    },
  };
}

// OP01-038 printed On K.O.; official qa_op01.pdf (20240405), page 4:
// the opponent chooses from YOUR hand without seeing card faces.
describe("OPT-848 authored Kanjuro blind discard", () => {
  it.each([0, 1] as const)(
    "controller %i: empty, one and multiple cards",
    (owner) => {
      for (const count of [0, 1, 3]) {
        const f = fixture();
        const opponent = owner === 0 ? 1 : 0;
        f.state.turn.activePlayerIndex = opponent;
        f.state.players.forEach((p) => {
          p.hand = [];
          p.trash = [];
        });
        f.data("OP01-038", { cost: 2 });
        const kanjuro = f.put("OP01-038", owner);
        const hand = Array.from({ length: count }, (_, i) => {
          f.data(`secret-${i}`);
          return f.put(`secret-${i}`, owner, "HAND");
        });
        const other = f.put(CARDS.VANILLA.id, opponent, "HAND");
        f.data("OP04-094", {
          type: "Event",
          cost: 4,
          power: null,
          effectText: "[Main]",
        });
        const event = f.put("OP04-094", opponent, "HAND");
        f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
        f.select([kanjuro.instanceId]);
        expect(f.state.players[owner].characters.every((c) => !c)).toBe(true);
        if (!count) {
          expect(f.state.pendingPrompt).toBeNull();
          expect(f.state.players[opponent].hand).toEqual([other]);
          continue;
        }
        f.persist();
        expect(f.state.pendingPrompt?.respondingPlayer).toBe(opponent);
        expect(f.targets().validTargets).toEqual(hand.map((c) => c.instanceId));
        expect(f.targets()).toMatchObject({
          countMin: 1,
          countMax: 1,
          blindSelection: true,
        });
        const wire = filterPromptForPlayer(f.state.pendingPrompt, opponent)!;
        expect(wire.resumeContext).toBeNull();
        expect(wire.options).toMatchObject({
          cards: hand.map((c) => ({
            instanceId: c.instanceId,
            cardId: "hidden",
          })),
        });
        expect(filterPromptForPlayer(f.state.pendingPrompt, owner)).toBeNull();
        const responderState = JSON.stringify(
          visibleStateForPlayer(f.state, f.db, opponent)
        );
        const spectatorState = JSON.stringify(
          visibleStateForSpectator(f.state, f.db).pendingPrompt
        );
        for (const card of hand) {
          expect(responderState).not.toContain(card.cardId);
          expect(spectatorState).not.toContain(card.cardId);
        }
        const observed = filterPromptForRecipient(f.state.pendingPrompt, {
          kind: "OBSERVER",
        });
        expect(observed?.options).toMatchObject({
          validTargets: [],
          cards: hand.map(() => ({ instanceId: "hidden", cardId: "hidden" })),
        });
        const action: GameAction = {
          type: "SELECT_TARGET",
          selectedInstanceIds: [hand[0].instanceId],
          promptId: f.state.pendingPrompt?.promptId,
        };
        const coordinator = new SessionCoordinator();
        expect(
          coordinator.executeAction(f.state, [], owner, action, f.db)
        ).toMatchObject({ kind: "reject", state: f.state });
        expect(
          coordinator.routePromptResponse(f.state, opponent, action).kind
        ).toBe("resume");
        const invalidSelections = [
          [],
          [hand[0].instanceId, hand[0].instanceId],
          [other.instanceId],
          ...(hand.length > 1
            ? [[hand[0].instanceId, hand[1].instanceId]]
            : []),
        ];
        for (const selectedInstanceIds of invalidSelections) {
          f.persist();
          const before = structuredClone(f.state);
          const malformed: GameAction = { ...action, selectedInstanceIds };
          // GameSession routes SELECT_TARGET into this lifecycle after authorization.
          expect(
            coordinator.executeAction(f.state, [], opponent, malformed, f.db)
              .kind
          ).toBe("resume");
          f.choice(malformed, true);
          expect(f.state).toEqual(before);
          f.persist();
          expect(f.state.pendingPrompt).toEqual(before.pendingPrompt);
          expect(f.state.pendingPrompt?.respondingPlayer).toBe(opponent);
          expect(f.targets().blindSelection).toBe(true);
          expect(
            filterPromptForPlayer(f.state.pendingPrompt, owner)
          ).toBeNull();
          const responder = JSON.stringify(
            visibleStateForPlayer(f.state, f.db, opponent)
          );
          const spectatorPrompt = JSON.stringify(
            visibleStateForSpectator(f.state, f.db).pendingPrompt
          );
          for (const card of hand) {
            expect(responder).not.toContain(card.cardId);
            expect(spectatorPrompt).not.toContain(card.cardId);
          }
          expect(
            coordinator.executeAction(f.state, [], owner, action, f.db).kind
          ).toBe("reject");
        }
        f.persist();
        f.select([hand[0].instanceId]);
        expect(f.state.pendingPrompt).toBeNull();
        expect(f.state.players[owner].hand).toEqual(hand.slice(1));
        expect(f.state.players[opponent].hand).toEqual([other]);
        const discarded = f.state.players[owner].trash.find(
          (c) => c.cardId === hand[0].cardId
        )!;
        expect(discarded).toMatchObject({
          owner,
          controller: owner,
          zone: "TRASH",
        });
        expect(discarded.instanceId).not.toBe(hand[0].instanceId);
        expect(f.state.players[owner].trash).toHaveLength(2);
        expect(f.state.players[opponent].trash.map((c) => c.cardId)).toEqual([
          "OP04-094",
        ]);
      }
    }
  );
});

describe("blind choice lifecycle shared consumers", () => {
  it("retains authored Bao Huang's two-card choice after invalid replies", () => {
    const f = fixture();
    f.state.players.forEach((p) => {
      p.hand = [];
    });
    f.data("OP01-105", { cost: 2 });
    const bao = f.put("OP01-105", 0, "HAND");
    const hand = [0, 1, 2].map((i) => {
      f.data(`bao-secret-${i}`);
      return f.put(`bao-secret-${i}`, 1, "HAND");
    });
    f.act({ type: "PLAY_CARD", cardInstanceId: bao.instanceId });
    expect(f.targets()).toMatchObject({
      blindSelection: true,
      countMin: 2,
      countMax: 2,
    });
    for (const ids of [
      [],
      [hand[0].instanceId],
      [hand[0].instanceId, hand[0].instanceId],
      hand.map((c) => c.instanceId),
    ]) {
      f.persist();
      const before = structuredClone(f.state);
      f.select(ids, true);
      expect(f.state).toEqual(before);
    }
    // Valid choices still reach the existing resolver. REVEAL_HAND currently
    // re-prompts instead of consuming preselected IDs (also reproduced before
    // this guard); correcting that separate action is outside OPT-848.
    f.select([hand[0].instanceId, hand[2].instanceId]);
    expect(f.state.players[1].hand).toEqual(hand);
  });

  it("allows zero for an optional blind discard without moving a card", () => {
    const f = fixture();
    const hand = structuredClone(f.state.players[1].hand);
    const result = executeTrashFromHand(
      f.state,
      {
        type: "TRASH_FROM_HAND",
        target: { controller: "OPPONENT" },
        params: { amount: 1, chooser: "SELF", optional: true },
      },
      f.state.players[0].leader.instanceId,
      0,
      f.db,
      new Map()
    );
    expect(result.pendingPrompt?.options).toMatchObject({
      blindSelection: true,
      countMin: 0,
    });
    const resumed = resumePromptLifecycle(
      { ...result.state, pendingPrompt: result.pendingPrompt! },
      { type: "SELECT_TARGET", selectedInstanceIds: [] },
      f.db,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
    );
    expect(resumed.responseRejected).toBe(false);
    expect(resumed.state.pendingPrompt).toBeNull();
    expect(resumed.state.players[1].hand).toEqual(hand);
  });
});
