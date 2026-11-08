/**
 * OPT-1033 — negation-aware "without [Blocker]" filter (`keywords_not`), read
 * from last-known information at K.O. time.
 *
 * EB05-010 Nico Robin (Leader): "[Once Per Turn] When one of your Characters
 * with the Wisdom attribute and without [Blocker] is K.O.'d, add up to 1 card
 * from the top of your deck to the top of your Life cards."
 *
 * FAQ (docs/FAQs/qa_eb05.md):
 *   - a negated Character whose [Blocker] is printed (EB01-057 Shirahoshi)
 *     counts as without [Blocker];
 *   - so does one whose [Blocker] comes from its own permanent effect
 *     (EB04-057 Vegapunk with DON!!x1);
 *   - a [Blocker] granted by another card's effect still counts.
 *
 * Effect behavior comes from the production registry. The Characters are
 * K.O.'d in battle by the opponent through the real pipeline.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { matchesTargetFilter } from "../../../../shared/target-filter.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const NO_KEYWORDS = {
  rush: false,
  rushCharacter: false,
  doubleAttack: false,
  banish: false,
  blocker: false,
  trigger: false,
  unblockable: false,
};

function timedEffect(
  id: string,
  targetInstanceId: string,
  modifier: RuntimeActiveEffect["modifiers"][number],
  sourceCardInstanceId: string,
  controller: 0 | 1
): RuntimeActiveEffect {
  return {
    id,
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [modifier],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: 3 },
    controller,
    appliesTo: [targetInstanceId],
    timestamp: 1,
  } as unknown as RuntimeActiveEffect;
}

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
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

  function put(id: string, controller: 0 | 1, zone: "LEADER" | "CHARACTER" = "CHARACTER") {
    const card: CardInstance = {
      cardId: id,
      instanceId: `${id}-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else p.characters[p.characters.findIndex((c) => !c)] = card;
    state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }

  function act(player: 0 | 1, action: GameAction) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }

  /** Player 0 attacks the rested `target` with a 9000 Character; nobody blocks or counters. */
  function koInBattle(target: CardInstance) {
    data("ATTACKER", { power: 9000 });
    const attacker = put("ATTACKER", 0);
    state.players[1].characters.find((c) => c?.instanceId === target.instanceId)!.state = "RESTED";
    act(0, { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId });
    for (let guard = 0; guard < 20 && (state.turn.battle || state.pendingPrompt); guard++) {
      if (state.pendingPrompt) {
        const prompt = state.pendingPrompt;
        const choices = prompt.options.promptType === "PLAYER_CHOICE" ? prompt.options.choices : [];
        // "up to 1": take the most cards offered.
        const accept = choices.find((c) => c.id === "accept") ?? choices.at(-1);
        if (!accept) throw new Error(`unexpected prompt ${JSON.stringify(prompt.options)}`);
        const result = resumePromptLifecycle(state, { type: "PLAYER_CHOICE", choiceId: accept.id }, db, {
          drainPregame: (s) => s,
          advanceStartOfTurn: (s) => s,
        });
        expect(result.responseRejected).toBe(false);
        state = result.state;
      } else {
        act(state.turn.battleSubPhase === "ATTACK_STEP" ? 0 : 1, { type: "PASS" });
      }
    }
    expect(state.players[1].characters.some((c) => c?.instanceId === target.instanceId)).toBe(false);
  }

  function negate(card: CardInstance) {
    state.activeEffects.push(
      timedEffect(`neg-${card.instanceId}`, card.instanceId, {
        type: "NEGATE_EFFECTS_FLAG",
        params: {},
        duration: { type: "THIS_TURN" },
      } as RuntimeActiveEffect["modifiers"][number], "black-hole", 0)
    );
  }

  function grantBlocker(card: CardInstance) {
    state.activeEffects.push(
      timedEffect(`grant-${card.instanceId}`, card.instanceId, {
        type: "GRANT_KEYWORD",
        params: { keyword: "BLOCKER" },
        duration: { type: "THIS_TURN" },
      } as RuntimeActiveEffect["modifiers"][number], "chopper-trigger", 1)
    );
  }

  data("EB05-010", { type: "Leader", power: 5000, life: 4, attribute: ["Wisdom"] });
  put("EB05-010", 1, "LEADER");

  return {
    db,
    data,
    put,
    koInBattle,
    negate,
    grantBlocker,
    get state() {
      return state;
    },
    life: () => state.players[1].life.length,
    koEvent: () => [...state.eventLog].reverse().find((e) => e.type === "CARD_KO"),
  };
}

function wisdom(f: ReturnType<typeof fixture>, id: string, blocker: boolean) {
  f.data(id, { attribute: ["Wisdom"], power: 4000, keywords: { ...NO_KEYWORDS, blocker } });
  return f.put(id, 1);
}

describe("EB05-010 Nico Robin: Wisdom Character without [Blocker] K.O.'d", () => {
  it("adds 1 card from the deck to Life for a Wisdom Character without [Blocker]", () => {
    const f = fixture();
    const target = wisdom(f, "WISDOM-PLAIN", false);
    const life = f.life();
    const deck = f.state.players[1].deck.length;
    f.koInBattle(target);
    expect(f.life()).toBe(life + 1);
    expect(f.state.players[1].deck.length).toBe(deck - 1);
  });

  it("does not fire for a Wisdom Character with its printed [Blocker]", () => {
    const f = fixture();
    const target = wisdom(f, "EB01-057", true);
    const life = f.life();
    f.koInBattle(target);
    expect(f.life()).toBe(life);
    // Unchanged from the printed keywords: not stamped, so saved events keep their bytes.
    expect(f.koEvent()?.payload).not.toHaveProperty("preKO_keywords");
  });

  it("FAQ: fires for a negated Shirahoshi whose [Blocker] is printed", () => {
    const f = fixture();
    const target = wisdom(f, "EB01-057", true);
    f.negate(target);
    const life = f.life();
    f.koInBattle(target);
    expect(f.life()).toBe(life + 1);
    expect(f.koEvent()?.payload).toMatchObject({ preKO_keywords: [] });
  });

  it("FAQ: fires for a negated Vegapunk whose [Blocker] comes from its own DON!!x1 effect", () => {
    const f = fixture();
    const target = wisdom(f, "EB04-057", false);
    const donCard = f.state.players[1].donCostArea.shift()!;
    target.attachedDon.push({ ...donCard, state: "ACTIVE", attachedTo: target.instanceId });
    f.negate(target);
    const life = f.life();
    f.koInBattle(target);
    expect(f.life()).toBe(life + 1);
  });

  it("control: Vegapunk with DON!!x1 and not negated has [Blocker], so it does not fire", () => {
    const f = fixture();
    const target = wisdom(f, "EB04-057", false);
    const donCard = f.state.players[1].donCostArea.shift()!;
    target.attachedDon.push({ ...donCard, state: "ACTIVE", attachedTo: target.instanceId });
    const life = f.life();
    f.koInBattle(target);
    expect(f.life()).toBe(life);
  });

  it("FAQ: does not fire when the [Blocker] was granted by another card's effect, even if negated", () => {
    const f = fixture();
    const target = wisdom(f, "WISDOM-PLAIN", false);
    f.grantBlocker(target);
    f.negate(target);
    const life = f.life();
    f.koInBattle(target);
    expect(f.life()).toBe(life);
    expect(f.koEvent()?.payload).toMatchObject({ preKO_keywords: ["BLOCKER"] });
  });

  it("does not fire for a non-Wisdom Character without [Blocker]", () => {
    const f = fixture();
    f.data("STRIKE-PLAIN", { attribute: ["Strike"], power: 4000 });
    const target = f.put("STRIKE-PLAIN", 1);
    const life = f.life();
    f.koInBattle(target);
    expect(f.life()).toBe(life);
  });

  it("compares the K.O.'d Character's controller, not its owner", () => {
    const f = fixture();
    const target = wisdom(f, "WISDOM-PLAIN", false);
    target.owner = 0;
    const life = f.life();
    f.koInBattle(target);
    expect(f.life()).toBe(life + 1);
  });

  it("is [Once Per Turn]: a second qualifying K.O. in the same turn adds nothing", () => {
    const f = fixture();
    const first = wisdom(f, "WISDOM-PLAIN", false);
    const second = wisdom(f, "WISDOM-PLAIN", false);
    const life = f.life();
    f.koInBattle(first);
    f.koInBattle(second);
    expect(f.life()).toBe(life + 1);
  });

  it("does not fire for the opponent's Wisdom Character", () => {
    const f = fixture();
    f.data("WISDOM-OPP", { attribute: ["Wisdom"], power: 4000 });
    const target = f.put("WISDOM-OPP", 0);
    // Player 1 K.O.s player 0's Character on player 1's turn.
    f.state.turn.activePlayerIndex = 1;
    f.data("P1-ATTACKER", { power: 9000 });
    const attacker = f.put("P1-ATTACKER", 1);
    f.state.players[0].characters.find((c) => c?.instanceId === target.instanceId)!.state = "RESTED";
    let state = f.state;
    const life = f.life();
    const declare = runPipeline(state, { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId }, f.db, 1);
    expect(declare.valid, declare.error).toBe(true);
    state = declare.state;
    for (let guard = 0; guard < 20 && state.turn.battle && !state.pendingPrompt; guard++) {
      const result = runPipeline(state, { type: "PASS" }, f.db, state.turn.battleSubPhase === "ATTACK_STEP" ? 1 : 0);
      expect(result.valid, result.error).toBe(true);
      state = result.state;
    }
    expect(state.players[0].characters.some((c) => c?.instanceId === target.instanceId)).toBe(false);
    expect(state.pendingPrompt).toBeNull();
    expect(state.players[1].life.length).toBe(life);
  });
});

describe("keywords_not target filter", () => {
  const card = {
    cost: 3,
    baseCost: 3,
    power: 4000,
    basePower: 4000,
    colors: [],
    traits: [],
    name: "x",
    attributes: [],
    cardType: "CHARACTER",
    attachedDonCount: 0,
    hasTrigger: false,
    hasEffect: false,
    hasBaseEffect: false,
    hasCounter: false,
    treatsAsAllNames: false,
    treatsAsAllTraits: false,
    treatsAsAllAttributes: false,
  };

  it("is the negation of keywords, including the [Rush: Character] alias for RUSH", () => {
    const has = (keywords: string[]) => ({ hasKeyword: (_: unknown, k: string) => keywords.includes(k) });
    expect(matchesTargetFilter(card, { keywords_not: ["BLOCKER"] }, has([]))).toBe(true);
    expect(matchesTargetFilter(card, { keywords_not: ["BLOCKER"] }, has(["BLOCKER"]))).toBe(false);
    expect(matchesTargetFilter(card, { keywords_not: ["RUSH"] }, has(["RUSH_CHARACTER"]))).toBe(false);
    expect(matchesTargetFilter(card, { keywords: ["RUSH"] }, has(["RUSH_CHARACTER"]))).toBe(true);
  });
});
