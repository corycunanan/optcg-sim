/** Cross-build public session runner. No mocked routing or persisted-state repair. */
import { getEffectivePower } from "../engine/modifiers.js";
import { expect } from "vitest";
import type { CardData, GameAction, GameState } from "../types.js";
import type { SessionStorage } from "../session/persistence.js";
export async function runtime(root?: string) {
  if (root)
    return {
      ...((await import(
        `${root}/workers/game/src/session/persistence.ts`
      )) as typeof import("../session/persistence.js")),
      ...((await import(
        `${root}/workers/game/src/session/coordinator.ts`
      )) as typeof import("../session/coordinator.js")),
      ...((await import(
        `${root}/workers/game/src/session/prompt-lifecycle.ts`
      )) as typeof import("../session/prompt-lifecycle.js")),
    };
  return {
    ...(await import("../session/persistence.js")),
    ...(await import("../session/coordinator.js")),
    ...(await import("../session/prompt-lifecycle.js")),
  };
}
export type Runtime = Awaited<ReturnType<typeof runtime>>;
export function memory(rt: Runtime, initial: Record<string, unknown> = {}) {
  const values = structuredClone(initial);
  const storage: SessionStorage = {
    async get<T>(key: string) {
      return values[key] as T | undefined;
    },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      Object.assign(
        values,
        structuredClone(typeof key === "string" ? { [key]: value } : key)
      );
    },
    async setAlarm() {},
    async deleteAlarm() {},
  };
  return {
    values,
    repo: new rt.SessionRepository(storage, {
      nextJsUrl: "https://example.test",
      workerSecret: "secret",
    }),
  };
}
export function command(
  rt: Runtime,
  state: GameState,
  db: Map<string, CardData>,
  raw: GameAction,
  actor = state.pendingPrompt?.respondingPlayer ?? state.turn.activePlayerIndex
) {
  const hasPromptId = "promptId" in raw && raw.promptId !== undefined;
  const action = {
    ...raw,
    ...(!hasPromptId && state.pendingPrompt?.promptId
      ? { promptId: state.pendingPrompt.promptId }
      : {}),
  } as GameAction;
  const result = new rt.SessionCoordinator().executeAction(
    state,
    [],
    actor,
    action,
    db
  );
  expect(
    result.kind,
    result.kind === "reject"
      ? JSON.stringify({
          reason: result.reason,
          action,
          prompt: state.pendingPrompt,
        })
      : ""
  ).not.toBe("reject");
  if (result.kind !== "resume") return result.state;
  const next = rt.resumePromptLifecycle(result.state, action, db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  expect(next.responseRejected).toBe(false);
  return next.state;
}
export async function save(
  rt: Runtime,
  state: GameState,
  cardDb: Map<string, CardData>
) {
  const m = memory(rt);
  await m.repo.save({
    state,
    cardDb,
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
    undoHistory: [],
  });
  return m.values;
}
export interface ProducerScenario {
  id: string;
  initial: Record<string, unknown>;
  steps: { action: GameAction; stored: Record<string, unknown> }[];
  payer: 0 | 1;
  sourceId: string;
  expectation: {
    returned: number;
    hand: number;
    meaningfulPauses: number;
    opponentReturned?: number;
  };
}

/** Independent filter/count oracle; it does not call the production target resolver/planner. */
export function assertDonOffer(state: GameState) {
  const p = state.pendingPrompt?.options;
  if (p?.promptType !== "PLAYER_CHOICE" || !p.donIdentityReturn) return;
  const frame = state.effectStack.at(-1)!;
  const cost = frame.costs?.[frame.currentCostIndex];
  if (
    frame.phase !== "AWAITING_COST_SELECTION" ||
    (cost?.type !== "DON_MINUS" && cost?.type !== "VARIABLE_DON_RETURN")
  )
    return;
  const payer = (frame.costTransactionState?.players ?? state.players)[
    frame.controller
  ];
  const f = cost.filter;
  const restricted =
    f?.is_active === true || f?.is_rested === true || !!f?.state;
  const expected = [
    ...payer.donCostArea.filter(
      (d) =>
        !d.attachedTo &&
        (f?.is_active !== true || d.state === "ACTIVE") &&
        (f?.is_rested !== true || d.state === "RESTED") &&
        (!f?.state || d.state === f.state)
    ),
    ...(!restricted
      ? [payer.leader, ...payer.characters.filter((c) => c !== null)].flatMap(
          (c) => c.attachedDon
        )
      : []),
  ].map((d) => d.instanceId);
  expect(p.donIdentityReturn.groups.flatMap((g) => g.donIds).sort()).toEqual(
    expected.sort()
  );
  expect(p.donIdentityReturn.countMin).toBe(
    typeof cost.amount === "number" ? cost.amount : 1
  );
  expect(p.donIdentityReturn.countMax).toBe(
    typeof cost.amount === "number" ? cost.amount : expected.length
  );
  for (const choice of p.choices) {
    const ids = JSON.parse(
      choice.id.slice("don-return-ids:".length)
    ) as string[];
    expect(ids.length).toBeGreaterThanOrEqual(p.donIdentityReturn.countMin);
    expect(ids.length).toBeLessThanOrEqual(p.donIdentityReturn.countMax);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => expected.includes(id))).toBe(true);
  }
}
export async function assertCompletion(
  rt: Runtime,
  corpus: ProducerScenario,
  state: GameState,
  cardDb: Map<string, CardData>,
  initial: GameState
) {
  const owner = corpus.payer;
  const other = owner === 0 ? 1 : 0;
  expect(state.pendingPrompt).toBeNull();
  expect(state.effectStack).toHaveLength(0);
  expect(state.players[owner].hand).toHaveLength(corpus.expectation.hand);
  expect(
    state.players[owner].donDeck.length - initial.players[owner].donDeck.length
  ).toBe(corpus.expectation.returned);
  expect(
    state.players[other].donDeck.length - initial.players[other].donDeck.length
  ).toBe(corpus.expectation.opponentReturned ?? 0);
  expect(
    state.eventLog
      .filter((e) => e.type === "DON_DETACHED")
      .reduce((n, e) => n + Number(e.payload.count), 0)
  ).toBe(
    corpus.expectation.returned + (corpus.expectation.opponentReturned ?? 0)
  );
  const stage =
    /^(fixed|field|shuffle|arrange|life)-(decline|accept|terminal)-then-don$/.exec(
      corpus.id
    );
  if (stage) {
    const sourceOwner = stage[1] === "life" ? other : owner;
    const sourceBefore = initial.players[sourceOwner].characters.find(
      (c) => c?.instanceId === corpus.sourceId
    )!;
    if (stage[2] === "decline") {
      expect(
        state.players[sourceOwner].characters.some(
          (c) => c?.instanceId === corpus.sourceId
        )
      ).toBe(false);
      const destination =
        stage[1] === "fixed" || stage[1] === "field"
          ? "trash"
          : stage[1] === "life"
            ? "life"
            : "deck";
      expect(
        state.players[sourceOwner][destination].filter(
          (c) => c.cardId === sourceBefore.cardId
        )
      ).toHaveLength(1);
    } else
      expect(
        state.players[sourceOwner].characters.find(
          (c) => c?.instanceId === corpus.sourceId
        )
      ).toEqual(sourceBefore);
  }
  if (/^(KO_OWN_CHARACTER|TRASH_OWN_CHARACTER)-zero-/.test(corpus.id)) {
    expect(
      state.players[owner].characters.find(
        (c) => c?.instanceId === corpus.sourceId
      )
    ).toEqual(
      initial.players[owner].characters.find(
        (c) => c?.instanceId === corpus.sourceId
      )
    );
    expect(state.effectStack.some((f) => !!f.costReplacementAction)).toBe(
      false
    );
  }
  if (corpus.id === "attached-hosts")
    for (const card of [
      state.players[owner].leader,
      ...state.players[owner].characters.filter((c) => c !== null),
    ]) {
      const original = [
        initial.players[owner].leader,
        ...initial.players[owner].characters.filter((c) => c !== null),
      ].find((c) => c.instanceId === card.instanceId)!;
      expect(
        getEffectivePower(card, cardDb.get(card.cardId)!, state, cardDb)
      ).toBe(
        (cardDb.get(card.cardId)!.power ?? 0) + card.attachedDon.length * 1000
      );
      expect(
        card.attachedDon.every((d) =>
          original.attachedDon.some(
            (before) => before.instanceId === d.instanceId
          )
        )
      ).toBe(true);
    }
  if (corpus.id === "attached-hosts") {
    const before = initial.players[owner];
    const after = state.players[owner];
    const sourceBefore = before.characters.find(
      (c) => c?.instanceId === corpus.sourceId
    )!;
    const sourceAfter = after.characters.find(
      (c) => c?.instanceId === corpus.sourceId
    )!;
    expect(after.leader.attachedDon).toHaveLength(0);
    expect(sourceAfter.attachedDon).toHaveLength(0);
    expect(after.donDeck.slice(-2).map((d) => d.instanceId)).toEqual([
      before.leader.attachedDon[0].instanceId,
      sourceBefore.attachedDon[0].instanceId,
    ]);
    expect(after.donCostArea).toEqual(before.donCostArea);
    expect(state.players[other]).toEqual(initial.players[other]);
  }
  if (corpus.id === "held-duration-groups") {
    const held = initial.prohibitions.filter((p) => p.id.startsWith("held-"));
    expect(held).toHaveLength(2);
    expect(
      state.players[owner].donDeck
        .slice(-2)
        .map((d) => d.instanceId)
        .sort()
    ).toEqual(held.flatMap((p) => p.appliesTo).sort());
    expect(
      state.prohibitions.filter((p) => p.id.startsWith("held-"))
    ).toHaveLength(0);
    expect(state.players[other]).toEqual(initial.players[other]);
  }
  const chosen = corpus.steps.flatMap((step) =>
    step.action.type === "PLAYER_CHOICE" &&
    step.action.choiceId.startsWith("don-return-ids:")
      ? (JSON.parse(
          step.action.choiceId.slice("don-return-ids:".length)
        ) as string[])
      : []
  );
  if (corpus.id === "accepted-fixed-don-prefix-rollback") {
    // Accepted Decision10 rollback restores the DON selected before the offer.
    expect(state.players[owner].donCostArea).toEqual(
      initial.players[owner].donCostArea
    );
    expect(state.players[owner].donDeck).toEqual(
      initial.players[owner].donDeck
    );
  }
  for (const id of corpus.id === "accepted-fixed-don-prefix-rollback"
    ? []
    : chosen)
    expect(
      state.players.flatMap((p) => p.donDeck).filter((d) => d.instanceId === id)
    ).toHaveLength(1);
  if (state.status === "FINISHED") {
    expect(state.eventLog.filter((e) => e.type === "GAME_OVER")).toHaveLength(
      1
    );
    return;
  }
  // After the COST owner completes, the next legal battle PASS must still route.
  const attacked = command(
    rt,
    state,
    cardDb,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[owner].leader.instanceId,
      targetInstanceId: state.players[other].leader.instanceId,
    },
    owner
  );
  command(rt, attacked, cardDb, { type: "PASS" }, other);
}
