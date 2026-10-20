import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import { EFFECT_SOURCE_SNAPSHOT_REF } from "../engine/effect-types.js";
import { effectSourceController } from "../engine/effect-resolver/action-utils.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { OP15_024_USOPP } from "../engine/schemas/op15.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { parseStoredSession } from "../session/persistence.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function fixture(restProtection = false) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.turn.activePlayerIndex = 1;
  state.turn.phase = "MAIN";
  for (const player of state.players) {
    player.characters = padChars([]);
    player.hand = [];
  }
  const data: CardData = {
    ...CARDS.VANILLA,
    id: "OPT964-SOURCE",
    name: "Snapshot source",
    cost: 0,
    effectText: "",
    effectSchema: {
      card_id: "OPT964-SOURCE",
      card_name: "Snapshot source",
      card_type: "Character",
      effects: [
        {
          id: "leave-and-discard",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          costs: [{ type: "TRASH_SELF" }],
          actions: [
            {
              type: "OPPONENT_ACTION",
              params: {
                action: { type: "TRASH_FROM_HAND", params: { amount: 1 } },
              },
            },
            ...(restProtection
              ? [
                  {
                    type: "SET_REST" as const,
                    target: {
                      type: "CHARACTER" as const,
                      controller: "OPPONENT" as const,
                      count: { all: true as const },
                    },
                  },
                ]
              : []),
          ],
        },
        {
          id: "stale-draw",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ],
    },
  };
  db.set(data.id, data);
  const source: CardInstance = {
    instanceId: "opt964-source-hand",
    cardId: data.id,
    controller: 1,
    owner: 1,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
  };
  state.players[1].hand = [source];
  state.players[0].hand = [0, 1].map((i) => ({
    ...source,
    instanceId: `opt964-discard-${i}`,
    cardId: CARDS.VANILLA.id,
    controller: 0,
    owner: 0,
  }));
  if (restProtection) {
    const usopp: CardData = {
      ...CARDS.VANILLA,
      id: "OP15-024",
      name: "Usopp",
      effectSchema: OP15_024_USOPP,
    };
    db.set(usopp.id, usopp);
    const protectedCard: CardInstance = {
      ...source,
      instanceId: "opt964-usopp",
      cardId: usopp.id,
      controller: 0,
      owner: 0,
      zone: "CHARACTER",
    };
    const unprotectedCard: CardInstance = {
      ...protectedCard,
      instanceId: "opt964-unprotected",
      cardId: CARDS.VANILLA.id,
    };
    state.players[0].characters = padChars([protectedCard, unprotectedCard]);
    state = registerCardEnteredField(state, protectedCard, usopp);
  }
  const played = runPipeline(
    state,
    {
      type: "PLAY_CARD",
      cardInstanceId: source.instanceId,
    },
    db,
    1
  );
  expect(played.valid, played.error).toBe(true);
  return { db, state: played.state, data };
}

function activatedFixture(restProtection = false) {
  const initial = fixture(restProtection);
  const first = initial.state.effectStack
    .flatMap((f) => f.simultaneousTriggers)
    .find((t) => t.effectBlock.id === "leave-and-discard")!;
  let state = answer(
    initial.state,
    {
      type: "PLAYER_CHOICE",
      choiceId: first.orderingId!,
    },
    initial.db
  );
  if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
    state = answer(
      state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      initial.db
    );
  }
  expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  return { ...initial, state, originalId: first.sourceCardInstanceId };
}

function answer(
  state: GameState,
  action: GameAction,
  db: Map<string, CardData>
) {
  const resumed = resumePromptLifecycle(state, action, db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  expect(resumed.responseRejected).toBe(false);
  return resumed.state;
}

function reload(state: GameState, db: Map<string, CardData>, location: string) {
  if (location === "memory") return state;
  const raw = JSON.parse(JSON.stringify(toPersistedGameState(state)));
  const session = parseStoredSession({
    state: raw,
    undoHistory: location === "undoHistory[0]" ? [raw] : [],
    cardDb: Object.fromEntries(db),
  });
  return location === "state" ? session.state : session.undoHistory[0];
}

function captureCorpus(
  name: string,
  state: GameState,
  db: Map<string, CardData>
) {
  const corpusDir = process.env.OPT964_CORPUS_DIR;
  if (!corpusDir) return;
  mkdirSync(corpusDir, { recursive: true });
  writeFileSync(
    join(corpusDir, `${name}.json`),
    JSON.stringify(
      {
        state: toPersistedGameState(state),
        undoHistory: [toPersistedGameState(state)],
        cardDb: Object.fromEntries(db),
      },
      null,
      2
    )
  );
}

describe("queued source identity and activated source departure", () => {
  it("captures only immutable identity on the real pipeline ordering queue", () => {
    const { state, data } = fixture();
    const queue = state.effectStack.flatMap((f) => f.simultaneousTriggers);
    expect(queue).toHaveLength(2);
    const source = state.players[1].characters.find(
      (c) => c?.cardId === data.id
    )!;
    for (const queued of queue) {
      expect(queued.sourceSnapshot).toEqual({
        instanceId: source.instanceId,
        cardId: data.id,
        controller: 1,
        effectBlockId: queued.effectBlock.id,
      });
      expect(queued.sourceCardInstanceId).toBe(source.instanceId);
    }
  });

  it.each(["memory", "state", "undoHistory[0]"])(
    "retains the departed activated source's cause, but skips its stale unactivated sibling (%s)",
    (location) => {
      const initial = fixture();
      if (location === "memory") {
        captureCorpus("queued-source-ordering", initial.state, initial.db);
      }
      let state = reload(initial.state, initial.db, location);
      const queued = state.effectStack.flatMap((f) => f.simultaneousTriggers);
      const first = queued.find(
        (t) => t.effectBlock.id === "leave-and-discard"
      )!;
      const originalId = first.sourceCardInstanceId;
      expect(first.sourceSnapshot).toBeDefined();
      state = answer(
        state,
        { type: "PLAYER_CHOICE", choiceId: first.orderingId! },
        initial.db
      );
      if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
        state = answer(
          state,
          { type: "PLAYER_CHOICE", choiceId: "accept" },
          initial.db
        );
      }
      expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(state.pendingPrompt?.respondingPlayer).toBe(0);
      expect(
        state.players[1].characters.every((c) => c?.instanceId !== originalId)
      ).toBe(true);
      const departed = state.players[1].trash.find(
        (c) => c.cardId === initial.data.id
      )!;
      expect(departed.instanceId).not.toBe(originalId);
      const identity = state.effectStack
        .flatMap((f) => f.resultRefs)
        .find(([key]) => key === EFFECT_SOURCE_SNAPSHOT_REF)?.[1];
      expect(identity?.sourceIdentity).toEqual(first.sourceSnapshot);
      expect(identity).not.toHaveProperty("sourceCardSnapshot");
      // No live instance can supply the owner now; the opponent is the chooser.
      // Removing just the persisted identity exposes that incorrect fallback.
      expect(
        effectSourceController(
          state,
          originalId,
          0,
          new Map([[EFFECT_SOURCE_SNAPSHOT_REF, identity!]])
        )
      ).toBe(1);
      expect(effectSourceController(state, originalId, 0, new Map())).toBe(0);

      if (location === "memory") {
        captureCorpus("activated-source-departure", state, initial.db);
      }
      state = reload(state, initial.db, location);
      const discardId = state.players[0].hand[0].instanceId;
      state = answer(
        state,
        { type: "SELECT_TARGET", selectedInstanceIds: [discardId] },
        initial.db
      );
      // Some ordering paths offer the remaining trigger; others drain it
      // directly. Neither is permitted to activate its now-stale instance.
      if (state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
        const next = state.pendingPrompt.options.choices?.find(
          (c) => !c.disabled && c.id !== "done"
        );
        expect(next).toBeDefined();
        state = answer(
          state,
          { type: "PLAYER_CHOICE", choiceId: next!.id },
          initial.db
        );
      }
      expect(state.pendingPrompt).toBeNull();
      expect(state.effectStack).toHaveLength(0);
      expect(state.players[1].hand).toHaveLength(0);
      expect(state.players[0].hand).toHaveLength(1);
      const discarded = state.eventLog.filter(
        (e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND"
      );
      expect(discarded).toHaveLength(1);
      expect(discarded[0].payload).toMatchObject({
        movementCause: "EFFECT",
        effectSourceCardId: initial.data.id,
        effectSourceController: 1,
        causingController: 1,
        sourceController: 0,
      });
    }
  );
});

describe.each(["state", "undoHistory[0]"])(
  "native activated source identity validation in %s",
  (location) => {
    const corruptions: [
      string,
      (identity: Record<string, unknown>) => unknown,
    ][] = [
      ...["power", "cost", "attachedDon"].map(
        (key): [string, (identity: Record<string, unknown>) => unknown] => [
          `extra ${key}`,
          (identity) => ({
            ...identity,
            [key]: key === "attachedDon" ? [] : 5000,
          }),
        ]
      ),
      ...["instanceId", "cardId", "controller", "effectBlockId"].map(
        (key): [string, (identity: Record<string, unknown>) => unknown] => [
          `missing ${key}`,
          (identity) => {
            const copy = { ...identity };
            delete copy[key];
            return copy;
          },
        ]
      ),
      ...["instanceId", "cardId", "controller", "effectBlockId"].map(
        (key): [string, (identity: Record<string, unknown>) => unknown] => [
          `wrong type ${key}`,
          (identity) => ({
            ...identity,
            [key]: key === "controller" ? "1" : 1,
          }),
        ]
      ),
      ["non-object identity", () => "departed-source"],
    ];
    it.each(corruptions)("rejects %s", (_label, corrupt) => {
      const { state, db } = activatedFixture();
      const raw = JSON.parse(
        JSON.stringify(toPersistedGameState(state))
      ) as ReturnType<typeof toPersistedGameState>;
      const result = raw.effectStack
        .flatMap((f) => f.resultRefs)
        .find(([key]) => key === EFFECT_SOURCE_SNAPSHOT_REF)![1];
      expect(result.sourceIdentity).toBeDefined();
      result.sourceIdentity = corrupt({ ...result.sourceIdentity }) as never;
      expect(() =>
        parseStoredSession({
          state: location === "state" ? raw : toPersistedGameState(state),
          undoHistory: location === "state" ? [] : [raw],
          cardDb: Object.fromEntries(db),
        })
      ).toThrow();
    });
  }
);

it.each(["memory", "state", "undoHistory[0]"])(
  "honors authored Usopp rest protection against a departed Character source (%s)",
  (location) => {
    const { state: paused, db, originalId, data } = activatedFixture(true);
    expect(
      paused.players[1].characters.every((c) => c?.instanceId !== originalId)
    ).toBe(true);
    expect(
      paused.players[1].trash.some(
        (c) => c.cardId === data.id && c.instanceId !== originalId
      )
    ).toBe(true);
    expect(paused.players[0].characters.filter(Boolean)).toHaveLength(2);
    let state = reload(paused, db, location);
    state = answer(
      state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [state.players[0].hand[0].instanceId],
      },
      db
    );
    if (state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
      const next = state.pendingPrompt.options.choices?.find(
        (c) => !c.disabled && c.id !== "done"
      );
      expect(next).toBeDefined();
      state = answer(state, { type: "PLAYER_CHOICE", choiceId: next!.id }, db);
    }
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toHaveLength(0);
    // Same SET_REST affects the unprotected control, but the real printed
    // Leader/Character source filter still protects Usopp after source exit.
    expect(
      state.players[0].characters.find((c) => c?.instanceId === "opt964-usopp")
        ?.state
    ).toBe("ACTIVE");
    expect(
      state.players[0].characters.find(
        (c) => c?.instanceId === "opt964-unprotected"
      )?.state
    ).toBe("RESTED");
  }
);
