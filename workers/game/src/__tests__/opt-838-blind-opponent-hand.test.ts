import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { createDeterministicExecutionContext } from "../engine/execution-context.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionCoordinator } from "../session/coordinator.js";
import {
  visibleStateForPlayer,
  visibleStateForSpectator,
} from "../session/visibility.js";
import {
  filterPromptForPlayer,
  filterPromptForRecipient,
  filterPromptOptionsForPlayer,
} from "../engine/visibility.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Canonical text: docs/cards/OP-17.md (OP17-075, OP17-091, OP17-099, OP17-106).
// Rulings: docs/FAQs/qa_op17.md — OP17-075 "chooses 1 card from the opponent's
// hand while it is face-down"; OP17-099 "randomly chooses 1 card from their
// opponent's hand without looking at it, and the opponent trashes that card".

function fixture(seed = "opt-838") {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  // Force the engine RNG from a test seed while keeping the id counter, so
  // newly allocated instance ids never collide with the setup's ids.
  state.executionContext = {
    ...createDeterministicExecutionContext(seed, { gameId: state.id }),
    idCounter: state.executionContext.idCounter,
  };
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
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
      turnPlayed: zone === "HAND" ? null : 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "CHARACTER")
      p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    else if (zone === "DECK") p.deck.unshift(card);
    if (["LEADER", "CHARACTER"].includes(zone))
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
    choice(
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: ids,
        ...(state.pendingPrompt?.promptId
          ? { promptId: state.pendingPrompt.promptId }
          : {}),
      } as GameAction,
      rejected
    );
  }
  function targets() {
    const options = state.pendingPrompt?.options;
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
    targets,
    persist() {
      state = parseStoredSession(
        JSON.parse(
          JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })
        )
      ).state;
    },
    get state(): GameState {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function acceptOptionalIfPrompted(f: Fixture) {
  if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
    f.choice({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
}

/** Plays X.Drake for `owner`; the opponent holds `count` secret cards. */
function playDrake(owner: 0 | 1, count: number, seed?: string) {
  const f = fixture(seed);
  const opponent: 0 | 1 = owner === 0 ? 1 : 0;
  f.state.turn.activePlayerIndex = owner;
  f.data("OP17-075", { cost: 2 });
  const drake = f.put("OP17-075", owner, "HAND");
  const own = f.put(CARDS.VANILLA.id, owner, "HAND");
  const hand = Array.from({ length: count }, (_, i) => {
    f.data(`secret-${i}`);
    return f.put(`secret-${i}`, opponent, "HAND");
  });
  f.act({ type: "PLAY_CARD", cardInstanceId: drake.instanceId });
  acceptOptionalIfPrompted(f);
  return { f, opponent, drake, own, hand };
}

/** Attacks with Linlin for `owner` and has the opponent pick `branch`. */
function attackWithLinlin(
  owner: 0 | 1,
  count: number,
  branch: "0" | "1",
  ownHandExtra = 1
) {
  const f = fixture();
  const opponent: 0 | 1 = owner === 0 ? 1 : 0;
  f.state.turn.activePlayerIndex = owner;
  f.data("OP17-099", { type: "Leader", cost: null, power: 5000 });
  const leader = f.put("OP17-099", owner, "LEADER");
  const cost = f.put(CARDS.VANILLA.id, owner, "HAND");
  const own = Array.from({ length: ownHandExtra }, () =>
    f.put(CARDS.VANILLA.id, owner, "HAND")
  );
  const hand = Array.from({ length: count }, (_, i) => {
    f.data(`linlin-secret-${i}`);
    return f.put(`linlin-secret-${i}`, opponent, "HAND");
  });
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: leader.instanceId,
    targetInstanceId: f.state.players[opponent].leader.instanceId,
  });
  acceptOptionalIfPrompted(f);
  // Cost: trash 1 card from your own hand (ordinary owner choice).
  expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
  expect(f.targets().blindSelection).toBeUndefined();
  f.select([cost.instanceId]);
  expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  expect(f.state.pendingPrompt?.respondingPlayer).toBe(opponent);
  f.choice({ type: "PLAYER_CHOICE", choiceId: branch });
  return { f, opponent, leader, own, hand };
}

function realIds(cards: CardInstance[]) {
  return cards.map((c) => c.instanceId);
}

function expectNoLeak(f: Fixture, chooser: 0 | 1, owner: 0 | 1, hand: CardInstance[]) {
  const ownerView = visibleStateForPlayer(f.state, f.db, owner);
  // The hand owner legitimately sees their own hand; only the rest of the
  // owner's view (notably the prompt) must stay free of the mapping.
  expect(ownerView.pendingPrompt).toBeNull();
  const views = [
    visibleStateForPlayer(f.state, f.db, chooser),
    {
      ...ownerView,
      players: ownerView.players.map((p, i) =>
        i === owner ? { ...p, hand: [] } : p
      ) as GameState["players"],
    },
    // Spectators see both hands by design (union policy) but cannot answer;
    // their prompt projection must still carry no identity or mapping.
    { pendingPrompt: visibleStateForSpectator(f.state, f.db).pendingPrompt },
  ];
  const wirePrompt = JSON.stringify(
    filterPromptOptionsForPlayer(f.state.pendingPrompt!.options)
  );
  for (const view of views) {
    // Event history may legitimately name a card revealed earlier; the
    // pending prompt and zones must not let it be correlated with a slot.
    const { eventLog: _eventLog, ...rest } = view as Partial<GameState>;
    const dump = JSON.stringify(rest);
    for (const card of hand) {
      expect(dump).not.toContain(card.instanceId);
      expect(dump).not.toContain(card.cardId);
    }
    expect(dump).not.toContain("blindSlots");
  }
  for (const card of hand) {
    expect(wirePrompt).not.toContain(card.instanceId);
    expect(wirePrompt).not.toContain(card.cardId);
  }
  expect(wirePrompt).not.toContain("blindSlots");
}

describe("OPT-838 OP17-075 X.Drake blind opponent-hand trash", () => {
  it.each([0, 1] as const)("controller %i chooses face-down from the opponent's hand", (owner) => {
    const { f, opponent, own, hand } = playDrake(owner, 3);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
    const prompt = f.targets();
    expect(prompt).toMatchObject({ blindSelection: true, countMin: 1, countMax: 1 });
    expect(prompt.validTargets).toHaveLength(3);
    for (const id of prompt.validTargets) {
      expect(realIds(hand)).not.toContain(id);
    }
    expectNoLeak(f, owner, opponent, hand);
    f.persist();
    // Resolve the second displayed slot and check exactly its card moved.
    const token = f.targets().validTargets[1];
    const mapped = f.state.pendingPrompt!.blindSlots!.find((s) => s.token === token)!;
    f.select([token]);
    expect(f.state.pendingPrompt).toBeNull();
    const chosen = hand.find((c) => c.instanceId === mapped.instanceId)!;
    expect(f.state.players[opponent].hand).toEqual(hand.filter((c) => c !== chosen));
    expect(f.state.players[opponent].trash.map((c) => c.cardId)).toEqual([chosen.cardId]);
    expect(f.state.players[owner].hand).toEqual([own]);
  });
});

describe("OPT-838 blind hand-slot leak regressions", () => {
  it("does not expose a previously revealed or just-drawn card's instanceId in the prompt", () => {
    const f = fixture();
    f.state.turn.activePlayerIndex = 0;
    f.data("OP17-075", { cost: 2 });
    const drake = f.put("OP17-075", 0, "HAND");
    const hand = [0, 1, 2].map((i) => {
      f.data(`leak-${i}`);
      return f.put(`leak-${i}`, 1, "HAND");
    });
    // The chooser learned hand[1]'s instanceId from an earlier public reveal.
    f.state.eventLog.push({
      type: "CARDS_REVEALED",
      playerIndex: 1,
      payload: {
        cards: [{ instanceId: hand[1].instanceId, cardId: hand[1].cardId }],
        source: "HAND",
        visibility: "BOTH",
      },
      timestamp: 0,
    } as GameState["eventLog"][number]);
    // hand[2] is the just-drawn (last) card.
    f.act({ type: "PLAY_CARD", cardInstanceId: drake.instanceId });
    acceptOptionalIfPrompted(f);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    expectNoLeak(f, 0, 1, hand);
    const wire = filterPromptForPlayer(f.state.pendingPrompt, 0)!;
    expect(JSON.stringify(wire)).not.toContain(hand[1].instanceId);
    expect(JSON.stringify(wire)).not.toContain(hand[2].instanceId);
  });

  it("shuffles slot order with the engine RNG rather than hand order", () => {
    const permutations = new Set<string>();
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const { f, hand } = playDrake(0, 4, seed);
      const slots = f.state.pendingPrompt!.blindSlots!;
      expect(slots.map((s) => s.token)).toEqual(f.targets().validTargets);
      permutations.add(
        slots.map((s) => realIds(hand).indexOf(s.instanceId)).join(",")
      );
      // Same seed → same mapping (stable across persistence and replay).
      const again = playDrake(0, 4, seed);
      expect(
        again.f.state.pendingPrompt!.blindSlots!.map((s) => s.instanceId)
      ).toEqual(slots.map((s) => s.instanceId));
    }
    expect(permutations.size).toBeGreaterThan(1);
    expect([...permutations].some((p) => p !== "0,1,2,3")).toBe(true);
  });
});

/** Answers "up to" value choices with their maximum and accepts optionals. */
function answerUpToPrompts(f: Fixture, player: 0 | 1) {
  for (let i = 0; i < 4 && f.state.pendingPrompt?.respondingPlayer === player; i++) {
    const options = f.state.pendingPrompt.options;
    if (options.promptType === "PLAYER_CHOICE" && options.choices.every((c) => c.id.startsWith("choose-value:"))) {
      f.choice({ type: "PLAYER_CHOICE", choiceId: options.choices.at(-1)!.id });
    } else if (options.promptType === "OPTIONAL_EFFECT") {
      f.choice({ type: "PLAYER_CHOICE", choiceId: "accept" });
    } else {
      return;
    }
  }
}

function handTrashEvents(f: Fixture, owner: 0 | 1) {
  return f.state.eventLog.filter(
    (e) =>
      e.type === "CARD_TRASHED" &&
      e.playerIndex === owner &&
      (e.payload as { from?: string }).from === "HAND"
  );
}

describe("OPT-838 X.Drake removal, empty and sole-card hands", () => {
  it.each([0, 1] as const)("controller %i: trash is attributed to X.Drake's controller", (owner) => {
    const { f, opponent, hand } = playDrake(owner, 2);
    const slot = f.state.pendingPrompt!.blindSlots![0];
    f.select([slot.token]);
    const chosen = hand.find((c) => c.instanceId === slot.instanceId)!;
    expect(f.state.players[opponent].hand).toEqual(hand.filter((c) => c !== chosen));
    const events = handTrashEvents(f, opponent);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      count: 1,
      movementCause: "EFFECT",
      effectSourceCardId: "OP17-075",
      effectSourceController: owner,
      causingController: owner,
    });
  });

  it.each([0, 1] as const)("controller %i: an empty opponent hand resolves with no prompt", (owner) => {
    const { f, opponent, own } = playDrake(owner, 0);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toEqual([]);
    expect(f.state.players[opponent].hand).toEqual([]);
    expect(f.state.players[owner].hand).toEqual([own]);
  });

  it.each([0, 1] as const)("controller %i: a sole card is still a blind prompt", (owner) => {
    const { f, opponent, hand } = playDrake(owner, 1);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
    expect(f.targets()).toMatchObject({ blindSelection: true, countMin: 1, countMax: 1 });
    expectNoLeak(f, owner, opponent, hand);
    f.select(f.targets().validTargets);
    expect(f.state.players[opponent].hand).toEqual([]);
    expect(f.state.players[opponent].trash.map((c) => c.cardId)).toEqual([hand[0].cardId]);
  });
});

describe("OPT-838 blind reply authorization and persistence", () => {
  it.each([0, 1] as const)("controller %i: only valid slot tokens from the chooser resume", (owner) => {
    const { f, opponent, hand } = playDrake(owner, 3);
    f.persist();
    const tokens = f.targets().validTargets;
    const coordinator = new SessionCoordinator();
    const reply = (ids: string[]): GameAction =>
      ({
        type: "SELECT_TARGET",
        selectedInstanceIds: ids,
        ...(f.state.pendingPrompt?.promptId
          ? { promptId: f.state.pendingPrompt.promptId }
          : {}),
      }) as GameAction;
    // The hand owner cannot answer the chooser's prompt.
    expect(coordinator.routePromptResponse(f.state, opponent, reply([tokens[0]]))).toMatchObject({
      kind: "reject",
      state: f.state,
    });
    expect(coordinator.routePromptResponse(f.state, owner, reply([tokens[0]])).kind).toBe("resume");
    const stale = tokens[0].replace(/^blind_[^-]+-/, "blind_zzzzzzzz-");
    const malformed = [
      [hand[0].instanceId], // a real instance id
      [f.state.pendingPrompt!.blindSlots![0].instanceId],
      [tokens[0], tokens[0]], // duplicate
      [tokens[0], tokens[1]], // wrong count
      [], // wrong count
      [stale], // token from another prompt
    ];
    for (const ids of malformed) {
      f.persist();
      const before = structuredClone(f.state);
      f.select(ids, true);
      expect(f.state).toEqual(before);
      expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
    }
    // The same token resolves to the same card after a persistence round trip.
    const slotsBefore = structuredClone(f.state.pendingPrompt!.blindSlots!);
    f.persist();
    expect(f.state.pendingPrompt!.blindSlots).toEqual(slotsBefore);
    expect(f.targets().validTargets).toEqual(tokens);
    f.select([tokens[2]]);
    const chosen = hand.find((c) => c.instanceId === slotsBefore[2].instanceId)!;
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[opponent].hand).toEqual(hand.filter((c) => c !== chosen));
    expect(f.state.players[opponent].trash.map((c) => c.cardId)).toEqual([chosen.cardId]);
  });

  it("stored prompts keep the mapping server-side only", () => {
    const { f, opponent, hand } = playDrake(0, 3);
    const stored = JSON.parse(
      JSON.stringify({ state: f.state, cardDb: Object.fromEntries(f.db), mode: "PVP" })
    );
    const restored = parseStoredSession(stored).state;
    expect(restored.pendingPrompt?.blindSlots).toEqual(f.state.pendingPrompt?.blindSlots);
    f.state = restored;
    expectNoLeak(f, 0, opponent, hand);
    expect(filterPromptForRecipient(f.state.pendingPrompt, { kind: "OBSERVER" })).toMatchObject({
      options: { validTargets: [] },
    });
    expect(filterPromptForRecipient(f.state.pendingPrompt, { kind: "OBSERVER" })).not.toHaveProperty("blindSlots");
    expect(filterPromptForPlayer(f.state.pendingPrompt, 0)).not.toHaveProperty("blindSlots");
  });

  it("builds slots for a 30-card hand in one pass without identity leaks", () => {
    const { f, opponent, hand } = playDrake(0, 30);
    const slots = f.state.pendingPrompt!.blindSlots!;
    expect(slots).toHaveLength(30);
    expect(new Set(slots.map((s) => s.instanceId))).toEqual(new Set(realIds(hand)));
    expect(new Set(slots.map((s) => s.token)).size).toBe(30);
    expectNoLeak(f, 0, opponent, hand);
    f.select([slots[29].token]);
    expect(f.state.players[opponent].hand).toHaveLength(29);
    expect(f.state.players[opponent].hand.map((c) => c.instanceId)).not.toContain(slots[29].instanceId);
  });
});

describe("OPT-838 OP17-099 Charlotte Linlin", () => {
  it.each([0, 1] as const)("controller %i: trash-opponent branch is a blind choice by the controller", (owner) => {
    const { f, opponent, hand, own } = attackWithLinlin(owner, 3, "1");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
    expect(f.targets()).toMatchObject({ blindSelection: true, countMin: 1, countMax: 1 });
    expectNoLeak(f, owner, opponent, hand);
    f.persist();
    const slot = f.state.pendingPrompt!.blindSlots![1];
    f.select([slot.token]);
    const chosen = hand.find((c) => c.instanceId === slot.instanceId)!;
    expect(f.state.pendingPrompt?.options.promptType).not.toBe("SELECT_TARGET");
    expect(f.state.players[opponent].hand).toEqual(hand.filter((c) => c !== chosen));
    expect(f.state.players[opponent].trash.map((c) => c.cardId)).toEqual([chosen.cardId]);
    expect(f.state.players[owner].hand).toEqual(own);
    const events = handTrashEvents(f, opponent);
    expect(events.at(-1)?.payload).toMatchObject({
      count: 1,
      movementCause: "EFFECT",
      effectSourceCardId: "OP17-099",
      causingController: owner,
    });
  });

  it.each([0, 1] as const)("controller %i: trash-opponent branch with an empty opponent hand does not stall", (owner) => {
    const { f, opponent } = attackWithLinlin(owner, 0, "1");
    expect(f.state.pendingPrompt?.options.promptType).not.toBe("SELECT_TARGET");
    expect(f.state.players[opponent].trash).toEqual([]);
  });

  it.each([0, 1] as const)("controller %i: first branch trashes from the controller's own hand normally", (owner) => {
    const { f, opponent, own, hand } = attackWithLinlin(owner, 2, "0", 2);
    const life = f.state.players[owner].life.length;
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
    expect(f.targets().blindSelection).toBeUndefined();
    expect(f.targets().validTargets).toEqual(realIds(own));
    f.select([own[0].instanceId]);
    answerUpToPrompts(f, owner);
    expect(f.state.pendingPrompt?.respondingPlayer).not.toBe(owner);
    expect(f.state.players[owner].hand).toEqual([own[1]]);
    expect(f.state.players[opponent].hand).toEqual(hand);
    expect(f.state.players[owner].life).toHaveLength(life + 1);
  });

  it.each([0, 1] as const)("controller %i: first branch with 0 cards in hand still adds Life (FAQ)", (owner) => {
    const { f, opponent, hand } = attackWithLinlin(owner, 2, "0", 0);
    const life = f.state.players[owner].life.length;
    const deckTop = f.state.players[owner].deck[0];
    answerUpToPrompts(f, owner);
    expect(f.state.pendingPrompt?.respondingPlayer).not.toBe(owner);
    expect(f.state.players[owner].hand).toEqual([]);
    expect(f.state.players[opponent].hand).toEqual(hand);
    expect(f.state.players[owner].life).toHaveLength(life + 1);
    expect(f.state.players[owner].life[0].cardId).toBe(deckTop.cardId);
  });
});

describe("OPT-838 owner-choice discards stay owner choices", () => {
  it.each([0, 1] as const)("OP17-091 controller %i: the opponent picks from their own visible hand", (owner) => {
    const f = fixture();
    const opponent: 0 | 1 = owner === 0 ? 1 : 0;
    f.state.turn.activePlayerIndex = owner;
    f.data("big", { cost: 12 });
    f.put("big", owner, "CHARACTER");
    f.data("OP17-091", { cost: 2 });
    const brook = f.put("OP17-091", owner, "HAND");
    const hand = [0, 1].map(() => f.put(CARDS.VANILLA.id, opponent, "HAND"));
    f.act({ type: "PLAY_CARD", cardInstanceId: brook.instanceId });
    acceptOptionalIfPrompted(f);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(opponent);
    expect(f.targets().blindSelection).toBeUndefined();
    expect(f.state.pendingPrompt?.blindSlots).toBeUndefined();
    expect(f.targets().validTargets).toEqual(realIds(hand));
    f.select([hand[1].instanceId]);
    expect(f.state.players[opponent].hand).toEqual([hand[0]]);
  });

  it.each([0, 1] as const)("OP17-106 controller %i: the opponent picks from their own visible hand", (owner) => {
    const f = fixture();
    const opponent: 0 | 1 = owner === 0 ? 1 : 0;
    f.state.turn.activePlayerIndex = owner;
    f.data("OP17-106", { cost: 1 });
    const smoothie = f.put("OP17-106", owner, "HAND");
    const hand = [0, 1].map(() => f.put(CARDS.VANILLA.id, opponent, "HAND"));
    f.act({ type: "PLAY_CARD", cardInstanceId: smoothie.instanceId });
    answerUpToPrompts(f, owner);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(opponent);
    expect(f.targets().blindSelection).toBeUndefined();
    expect(f.state.pendingPrompt?.blindSlots).toBeUndefined();
    expect(f.targets().validTargets).toEqual(realIds(hand));
    f.select([hand[0].instanceId]);
    expect(f.state.players[opponent].hand).toEqual([hand[1]]);
  });
});
