import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import { SessionCoordinator } from "../session/coordinator.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { executeAddToLifeFromField } from "../engine/effect-resolver/actions/life.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function card(
  id: string,
  cardId: string,
  controller: 0 | 1,
  owner = controller
): CardInstance {
  return {
    instanceId: id,
    cardId,
    controller,
    owner,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
  };
}
function fixture(kind: "linlin" | "kawamatsu") {
  const cardDb = createTestCardDb();
  const schema = getEffectSchema(kind === "linlin" ? "OP08-069" : "OP06-103")!;
  const data: CardData = {
    ...CARDS.VANILLA,
    id: schema.card_id!,
    name: schema.card_name!,
    cost: kind === "linlin" ? 9 : 3,
    power: 4000,
    effectSchema: schema,
  };
  cardDb.set(data.id, data);
  cardDb.set("ZERO", { ...CARDS.VANILLA, id: "ZERO", power: 0 });
  let state = createBattleReadyState(cardDb);
  const target = card("life-target", "ZERO", kind === "linlin" ? 1 : 0, 1);
  const source = card("source", data.id, 0);
  state.players[0].characters = padChars(
    kind === "linlin" ? [] : [source, target]
  );
  state.players[1].characters = padChars(kind === "linlin" ? [target] : []);
  state.players[1].life[1].face = "UP";
  if (kind === "linlin") {
    state.players[0].hand.push({ ...source, zone: "HAND" });
    state.players[0].donCostArea.push(
      ...state.players[0].donDeck
        .splice(0)
        .map((d) => ({ ...d, state: "ACTIVE" as const }))
    );
  } else state = registerTriggersForCard(state, source, data);
  return { state, cardDb, target, source };
}
function act(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  player: 0 | 1 = 0
) {
  if (state.pendingPrompt) {
    expect(
      new SessionCoordinator().routePromptResponse(state, player, action).kind
    ).toBe("resume");
    const result = resumePromptLifecycle(state, action, cardDb, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected).toBe(false);
    return result.state;
  }
  const result = runPipeline(state, action, cardDb, player);
  expect(result.valid, JSON.stringify(result)).toBe(true);
  return result.state;
}
function selectLifeTarget(
  kind: "linlin" | "kawamatsu",
  selection = ["life-target"],
  prohibited = false
) {
  const f = fixture(kind);
  if (prohibited) protect(f.state);
  let state = act(
    f.state,
    kind === "linlin"
      ? { type: "PLAY_CARD", cardInstanceId: "source" }
      : {
          type: "DECLARE_ATTACK",
          attackerInstanceId: "source",
          targetInstanceId: f.state.players[1].leader.instanceId,
        },
    f.cardDb
  );
  if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
    state = act(
      state,
      { type: "PLAYER_CHOICE", choiceId: "activate" },
      f.cardDb
    );
  }
  expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  state = act(
    state,
    {
      type: "SELECT_TARGET",
      selectedInstanceIds: state.players[0].hand
        .slice(0, kind === "linlin" ? 1 : 2)
        .map((c) => c.instanceId),
    },
    f.cardDb
  );
  if (kind === "linlin")
    state = act(
      state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:1" },
      f.cardDb
    );
  expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  state = act(
    state,
    { type: "SELECT_TARGET", selectedInstanceIds: selection },
    f.cardDb
  );
  return { ...f, state };
}

describe("OPT-821 field-to-Life position", () => {
  it.each(["TOP", "BOTTOM"] as const)(
    "honors a fixed %s destination",
    (position) => {
      const { state, cardDb, target } = fixture("linlin");
      const life = structuredClone(state.players[1].life);
      const result = executeAddToLifeFromField(
        state,
        { type: "ADD_TO_LIFE_FROM_FIELD", params: { position, face: "UP" } },
        "source",
        0,
        cardDb,
        new Map(),
        [target.instanceId]
      );
      expect(
        position === "TOP"
          ? result.state.players[1].life.slice(1)
          : result.state.players[1].life.slice(0, -1)
      ).toEqual(life);
      expect(
        result.state.players[1].life.at(position === "TOP" ? 0 : -1)?.cardId
      ).toBe("ZERO");
    }
  );
  it.each(["linlin", "kawamatsu"] as const)(
    "%s chooses position after selecting a target",
    (kind) => {
      const { state } = selectLifeTarget(kind);
      expect(state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      expect(state.players[1].life).toHaveLength(5);
    }
  );
  for (const kind of ["linlin", "kawamatsu"] as const) {
    it.each(["Top", "Bottom"])(
      `${kind}: %s survives persistence and moves once to the owner's Life`,
      async (label) => {
        const { state, cardDb, target } = selectLifeTarget(kind);
        const lifeBefore = structuredClone(state.players[1].life);
        const handCount = state.players[0].hand.length;
        const ownLifeCount = state.players[0].life.length;
        const restored = await roundTrip(state, cardDb);
        expect(restored.effectStack.at(-1)?.fieldToLifeTargetIds).toEqual([
          target.instanceId,
        ]);
        expect(restored.pendingPrompt?.respondingPlayer).toBe(0);
        const options = restored.pendingPrompt!.options;
        if (options.promptType !== "PLAYER_CHOICE")
          throw new Error("Expected destination prompt");
        expect(options.choices.map((c) => c.label)).toEqual(["Top", "Bottom"]);
        const response: GameAction = {
          type: "PLAYER_CHOICE",
          choiceId: options.choices.find((c) => c.label === label)!.id,
          promptId: restored.pendingPrompt!.promptId,
        };
        expect(
          new SessionCoordinator().routePromptResponse(restored, 1, response)
            .kind
        ).toBe("reject");
        expect(
          new SessionCoordinator().routePromptResponse(restored, 0, {
            ...response,
            promptId: "previous-prompt",
          }).kind
        ).toBe("reject");
        const malformed = resumeFromStack(
          restored,
          { type: "PLAYER_CHOICE", choiceId: "field-life:stale:BOTTOM" },
          cardDb
        );
        expect(malformed.rejected).toBe(true);
        expect(malformed.state).toEqual(restored);
        const done = act(restored, response, cardDb);
        const life = done.players[1].life;
        expect(label === "Top" ? life.slice(1) : life.slice(0, -1)).toEqual(
          lifeBefore
        );
        expect(life.at(label === "Top" ? 0 : -1)).toMatchObject({
          cardId: "ZERO",
          face: "UP",
        });
        expect(life.at(label === "Top" ? 0 : -1)?.instanceId).not.toBe(
          target.instanceId
        );
        expect(
          done.players
            .flatMap((p) => p.characters)
            .some((c) => c?.instanceId === target.instanceId)
        ).toBe(false);
        expect(done.players[0].hand).toHaveLength(handCount);
        expect(done.players[0].life).toHaveLength(ownLifeCount);
        expect(done.pendingPrompt).toBeNull();
        expect(done.effectStack).toHaveLength(0);
        const replay = resumePromptLifecycle(done, response, cardDb, {
          drainPregame: (s) => s,
          advanceStartOfTurn: (s) => s,
        });
        expect(replay.responseRejected).toBe(true);
        expect(replay.state).toEqual(done);
      }
    );
    it(`${kind}: selecting zero does not ask a destination or move a card`, () => {
      const { state } = selectLifeTarget(kind, []);
      expect(state.pendingPrompt).toBeNull();
      expect(state.players[1].life).toHaveLength(5);
      expect(
        state.players
          .flatMap((p) => p.characters)
          .some((c) => c?.instanceId === "life-target")
      ).toBe(true);
    });
    it(`${kind}: prohibited removal does not ask a destination or move a card`, () => {
      const { state } = selectLifeTarget(kind, ["life-target"], true);
      expect(state.pendingPrompt).toBeNull();
      expect(state.players[1].life).toHaveLength(5);
      expect(
        state.players
          .flatMap((p) => p.characters)
          .some((c) => c?.instanceId === "life-target")
      ).toBe(true);
    });
  }
  it("rechecks removal protection when resuming the destination choice", () => {
    const { state, cardDb } = selectLifeTarget("linlin");
    protect(state);
    const options = state.pendingPrompt!.options;
    if (options.promptType !== "PLAYER_CHOICE")
      throw new Error("Expected choice");
    const done = act(
      state,
      { type: "PLAYER_CHOICE", choiceId: options.choices[1].id },
      cardDb
    );
    expect(done.players[1].life).toHaveLength(5);
    expect(done.players[1].characters[0]?.instanceId).toBe("life-target");
  });
  it("does not replace a selected identity that disappeared while choosing", () => {
    const { state, cardDb } = selectLifeTarget("linlin");
    state.players[1].characters[0] = card("replacement-target", "ZERO", 1);
    const options = state.pendingPrompt!.options;
    if (options.promptType !== "PLAYER_CHOICE")
      throw new Error("Expected choice");
    const done = act(
      state,
      { type: "PLAYER_CHOICE", choiceId: options.choices[1].id },
      cardDb
    );
    expect(done.players[1].life).toHaveLength(5);
    expect(done.players[1].characters[0]?.instanceId).toBe(
      "replacement-target"
    );
  });
});

function protect(state: GameState) {
  state.prohibitions.push({
    id: "protect-life-target",
    sourceEffectBlockId: "protection",
    sourceCardInstanceId: "life-target",
    prohibitionType: "CANNOT_LEAVE_FIELD",
    scope: {},
    duration: { type: "PERMANENT" },
    controller: 1,
    appliesTo: ["life-target"],
    usesRemaining: null,
  });
}

class MemoryStorage implements SessionStorage {
  data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(
    key: string | Record<string, unknown>,
    value?: unknown
  ): Promise<void> {
    for (const [k, v] of Object.entries(
      typeof key === "string" ? { [key]: value } : key
    )) {
      this.data.set(k, JSON.parse(JSON.stringify(v)));
    }
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}
async function roundTrip(state: GameState, cardDb: Map<string, CardData>) {
  const storage = new MemoryStorage();
  const config = { nextJsUrl: "https://example.test", workerSecret: "test" };
  await new SessionRepository(storage, config).save({
    state,
    cardDb,
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
    undoHistory: [],
  });
  const loaded = await new SessionRepository(storage, config).load();
  expect(loaded).not.toBeNull();
  return loaded!.state;
}
