import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Canonical text: docs/cards/OP-17.md (OP17-049 Charlotte Linlin)
// "[On Play] Your opponent chooses one: • Draw 2 cards. • Your opponent trashes
// 2 cards from their hand."
// FAQ (docs/FAQs/qa_op17.md): the effect user draws for the draw branch; the
// opponent picks their own 2 cards for the trash branch; with 1 card they trash
// it, with 0 nothing happens (the branch stays selectable).

type Owner = 0 | 1;
const DRAW_BRANCH = "0";
const TRASH_BRANCH = "1";

function fixture(owner: Owner, opponentHandSize: number) {
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  const opponent: Owner = owner === 0 ? 1 : 0;
  state.turn.activePlayerIndex = owner;
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    });
  }
  function put(id: string, controller: Owner, zone: "HAND" | "DECK") {
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt837-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "HAND") p.hand.push(card);
    else p.deck.unshift(card);
    return card;
  }

  data("OP17-049", { cost: 3 });
  const linlin = put("OP17-049", owner, "HAND");
  data("own-hand");
  const ownHand = put("own-hand", owner, "HAND");
  const oppHand = Array.from({ length: opponentHandSize }, (_, i) => {
    data(`opp-hand-${i}`);
    return put(`opp-hand-${i}`, opponent, "HAND");
  });
  // Distinguishable deck tops so drawn identities are checkable.
  data("own-top-1");
  data("own-top-0");
  put("own-top-1", owner, "DECK");
  put("own-top-0", owner, "DECK");
  data("opp-top");
  put("opp-top", opponent, "DECK");

  function act(action: GameAction, player: Owner = state.turn.activePlayerIndex as Owner) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function respond(action: { type: "PLAYER_CHOICE"; choiceId: string } | { type: "SELECT_TARGET"; selectedInstanceIds: string[] }) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected, JSON.stringify(state.pendingPrompt)).toBe(false);
    state = result.state;
  }
  function persist() {
    state = parseStoredSession(
      JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })),
    ).state;
  }
  function snapshot() {
    return state.players.map((p) => ({
      hand: p.hand.map((c) => c.instanceId),
      deck: p.deck.map((c) => c.instanceId),
      trash: p.trash.map((c) => c.instanceId),
    }));
  }

  return {
    opponent,
    linlin,
    ownHand,
    oppHand,
    act,
    respond,
    persist,
    snapshot,
    get state() {
      return state;
    },
  };
}

function playAndOpenChoice(f: ReturnType<typeof fixture>) {
  f.act({ type: "PLAY_CARD", cardInstanceId: f.linlin.instanceId });
  const prompt = f.state.pendingPrompt;
  expect(prompt?.respondingPlayer).toBe(f.opponent);
  expect(prompt?.options.promptType).toBe("PLAYER_CHOICE");
  if (prompt?.options.promptType !== "PLAYER_CHOICE") throw new Error("expected branch choice");
  // Both branches stay selectable regardless of the opponent's hand size.
  expect(prompt.options.choices.map((c) => c.id)).toEqual([DRAW_BRANCH, TRASH_BRANCH]);
}

function expectGameContinues(f: ReturnType<typeof fixture>, owner: Owner) {
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.status).not.toBe("FINISHED");
  const phase = f.state.turn.phase;
  f.act({ type: "ADVANCE_PHASE" }, owner);
  expect(f.state.turn.phase).not.toBe(phase);
}

describe("OPT-837 OP17-049 Charlotte Linlin opponent-chosen branches", () => {
  for (const owner of [0, 1] as const) {
    for (const persistAtChoice of [false, true]) {
      const tag = `controller ${owner}${persistAtChoice ? " (persisted at choice)" : ""}`;

      it(`${tag}: draw branch — the effect user draws 2, opponent unchanged`, () => {
        const f = fixture(owner, 3);
        const before = f.snapshot();
        playAndOpenChoice(f);
        if (persistAtChoice) f.persist();
        f.respond({ type: "PLAYER_CHOICE", choiceId: DRAW_BRANCH });

        const after = f.snapshot();
        const ownerP = f.state.players[owner];
        // Controller: Linlin left hand; +2 drawn from own deck top.
        // (Zone moves mint fresh instance ids, so drawn identity is by cardId.)
        expect(after[owner].hand).toHaveLength(3);
        expect(after[owner].hand[0]).toBe(f.ownHand.instanceId);
        expect(ownerP.hand.slice(1).map((c) => c.cardId)).toEqual(["own-top-0", "own-top-1"]);
        expect(after[owner].deck).toEqual(before[owner].deck.slice(2));
        expect(after[owner].trash).toEqual(before[owner].trash);
        // Opponent untouched.
        expect(after[f.opponent]).toEqual(before[f.opponent]);
        expectGameContinues(f, owner);
      });

      // Hand 3: a real owner-selected discard prompt (more candidates than 2).
      // Hand 2/1: exact-2 has no choice to make, so the engine trashes every
      // candidate without a prompt (FAQ: with 1 card, they trash that card).
      // Hand 0: nothing happens.
      for (const oppHandSize of [3, 2, 1, 0]) {
        for (const persistAtSelect of oppHandSize > 2 ? [false, true] : [false]) {
          const selTag = persistAtSelect ? " (persisted at discard)" : "";
          it(`${tag}: trash branch with opponent hand ${oppHandSize}${selTag}`, () => {
            const f = fixture(owner, oppHandSize);
            const before = f.snapshot();
            playAndOpenChoice(f);
            if (persistAtChoice) f.persist();
            f.respond({ type: "PLAYER_CHOICE", choiceId: TRASH_BRANCH });

            const oppIds = f.oppHand.map((c) => c.instanceId);
            let expectedTrashed = oppIds;
            if (oppHandSize > 2) {
              const prompt = f.state.pendingPrompt;
              expect(prompt?.respondingPlayer).toBe(f.opponent);
              if (prompt?.options.promptType !== "SELECT_TARGET") throw new Error("expected discard selection");
              // Only the opponent's own hand is selectable; exactly 2 must be picked.
              expect([...prompt.options.validTargets].sort()).toEqual([...oppIds].sort());
              expect(prompt.options.validTargets).not.toContain(f.ownHand.instanceId);
              expect(prompt.options.countMin).toBe(2);
              expect(prompt.options.countMax).toBe(2);
              if (persistAtSelect) f.persist();
              // The opponent keeps their first card and trashes the other two.
              expectedTrashed = oppIds.slice(1);
              f.respond({ type: "SELECT_TARGET", selectedInstanceIds: expectedTrashed });
            }

            const after = f.snapshot();
            expect(after[f.opponent].hand).toEqual(oppIds.filter((id) => !expectedTrashed.includes(id)));
            expect(after[f.opponent].deck).toEqual(before[f.opponent].deck);
            // Zone moves mint fresh instance ids, so compare trash by card identity.
            const cardIdOf = new Map(f.oppHand.map((c) => [c.instanceId, c.cardId]));
            expect(after[f.opponent].trash).toHaveLength(before[f.opponent].trash.length + expectedTrashed.length);
            expect(f.state.players[f.opponent].trash.map((c) => c.cardId).slice(before[f.opponent].trash.length).sort())
              .toEqual(expectedTrashed.map((id) => cardIdOf.get(id)).sort());
            // Controller: only Linlin left the hand; no draw.
            expect(after[owner].hand).toEqual([f.ownHand.instanceId]);
            expect(after[owner].deck).toEqual(before[owner].deck);
            expect(after[owner].trash).toEqual(before[owner].trash);
            expectGameContinues(f, owner);
          });
        }
      }
    }
  }
});

describe("OPT-837 OP17-049 schema shape", () => {
  it("draw branch is an unwrapped DRAW; trash branch stays opponent-controlled", () => {
    const schema = getEffectSchema("OP17-049")!;
    const onPlay = schema.effects.find((e) => e.id === "on_play_opponent_choice")!;
    const choice = onPlay.actions![0];
    expect(choice.type).toBe("OPPONENT_CHOICE");
    const options = (choice.params as { options: unknown[][] }).options;
    expect(options[0]).toEqual([{ type: "DRAW", params: { amount: 2 } }]);
    expect(options[1]).toEqual([
      {
        type: "OPPONENT_ACTION",
        params: {
          mandatory: true,
          action: {
            type: "TRASH_CARD",
            target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 2 } },
          },
        },
      },
    ]);
  });

  it("on_opponent_attack_power is unchanged", () => {
    const schema = getEffectSchema("OP17-049")!;
    const block = schema.effects.find((e) => e.id === "on_opponent_attack_power");
    expect(block).toEqual({
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    });
  });
});
