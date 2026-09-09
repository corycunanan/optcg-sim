import { describe, expect, it } from "vitest";
import { CONTINUATION_EFFECT_BLOCK } from "../engine/effect-stack.js";
import {
  executeActionChain,
  resolveEffect,
} from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { pushBatchResumeFrame } from "../engine/effect-resolver/resume/batch.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type {
  Action,
  EffectBlock,
  EffectSchema,
  RuntimeActiveEffect,
} from "../engine/effect-types.js";
import type {
  CardData,
  CardInstance,
  EffectStackFrame,
  GameState,
  PlayerState,
} from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const FULL_DESCRIPTION =
  "[On Play] K.O. up to 1 of your opponent's Characters.\n[Trigger] Draw 1 card.";
const BLOCK_DESCRIPTION =
  "[On Play] K.O. up to 1 of your opponent's Characters.";

const FOLLOW_ON_PROMPT: Action = {
  type: "DECK_SCRY",
  params: { look_at: 2 },
};

const ON_PLAY_DRAW_SCHEMA: EffectSchema = {
  card_id: "OPT771-ON-PLAY",
  card_name: "OPT771 On Play",
  card_type: "Character",
  effects: [
    {
      id: "opt771-on-play-draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

const ON_KO_DRAW_SCHEMA: EffectSchema = {
  card_id: "OPT771-ON-KO",
  card_name: "OPT771 On K.O.",
  card_type: "Character",
  effects: [
    {
      id: "opt771-on-ko-draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

function descriptionSetup(): {
  cardDb: Map<string, CardData>;
  state: GameState;
  player0SourceId: string;
  player1SourceId: string;
} {
  const cardDb = createTestCardDb();
  cardDb.set(CARDS.LEADER.id, {
    ...CARDS.LEADER,
    effectText: FULL_DESCRIPTION,
  });
  const state = createBattleReadyState(cardDb);
  return {
    cardDb,
    state,
    player0SourceId: state.players[0].leader.instanceId,
    player1SourceId: state.players[1].leader.instanceId,
  };
}

function cardData(
  id: string,
  effectSchema: EffectSchema | null = null
): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name: id,
    effectSchema,
  };
}

function cardInstance(
  cardId: string,
  instanceId: string,
  owner: 0 | 1,
  zone: CardInstance["zone"]
): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: zone === "CHARACTER" ? 1 : null,
    controller: owner,
    owner,
  };
}

function withPlayers(
  state: GameState,
  player0: Partial<PlayerState>,
  player1: Partial<PlayerState> = {}
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], ...player0 };
  players[1] = { ...players[1], ...player1 };
  return { ...state, players };
}

function descriptionBlock(actions: Action[]): EffectBlock {
  return {
    id: "opt771-description-source",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions,
  };
}

function continuationFrame(
  sourceCardInstanceId: string,
  remainingActions: Action[]
): EffectStackFrame {
  return {
    id: "opt771-interrupted",
    sourceCardInstanceId,
    controller: 0,
    effectDescription: BLOCK_DESCRIPTION,
    effectBlock: CONTINUATION_EFFECT_BLOCK,
    phase: "INTERRUPTED_BY_TRIGGERS",
    pausedAction: null,
    remainingActions,
    resultRefs: [],
    validTargets: [],
    priorActionSucceeded: true,
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
  };
}

function expectFollowOnClause(result: {
  pendingPrompt?: GameState["pendingPrompt"] | undefined;
}): void {
  expect(result.pendingPrompt?.options).toMatchObject({
    promptType: "ARRANGE_TOP_CARDS",
    effectDescription: BLOCK_DESCRIPTION,
  });
}

function fullBoard(sourceCardId: string): CardInstance[] {
  return Array.from({ length: 5 }, (_, index) =>
    cardInstance(sourceCardId, `opt771-board-${index}`, 0, "CHARACTER")
  );
}

describe("OPT-771 effectDescription pass-through coverage", () => {
  it("nested choice frame carries the clause into its branch's second prompt", () => {
    const { cardDb, state, player0SourceId } = descriptionSetup();
    const firstPrompt: Action = {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { exact: 1 },
      },
    };
    const nestedChoice: Action = {
      type: "PLAYER_CHOICE",
      params: { options: [[firstPrompt, FOLLOW_ON_PROMPT]] },
    };
    const choice: Action = {
      type: "PLAYER_CHOICE",
      params: {
        options: [[nestedChoice], [{ type: "DRAW", params: { amount: 1 } }]],
      },
    };

    const started = executeActionChain(
      state,
      [choice],
      player0SourceId,
      0,
      cardDb,
      undefined,
      BLOCK_DESCRIPTION
    );
    expect(started.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    const first = resumeFromStack(
      started.state,
      { type: "PLAYER_CHOICE", choiceId: "0" },
      cardDb
    );
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (first.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected the branch's first target prompt");
    }

    const second = resumeFromStack(
      first.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [first.pendingPrompt.options.validTargets[0]],
      },
      cardDb
    );

    expectFollowOnClause(second);
  });

  it("interrupted continuation carries the clause into its resumed prompt", () => {
    const { cardDb, state, player0SourceId } = descriptionSetup();
    const interrupted = {
      ...state,
      effectStack: [continuationFrame(player0SourceId, [FOLLOW_ON_PROMPT])],
    };

    const resumed = resumeFromStack(interrupted, { type: "PASS" }, cardDb);

    expectFollowOnClause(resumed);
  });

  it("state-distribution batch frame carries the clause past its ON_PLAY trigger", () => {
    const { cardDb, state, player0SourceId } = descriptionSetup();
    const onPlayCard = cardData("OPT771-ON-PLAY", ON_PLAY_DRAW_SCHEMA);
    cardDb.set(onPlayCard.id, onPlayCard);
    const playTarget = cardInstance(
      onPlayCard.id,
      "opt771-state-distribution-target",
      0,
      "TRASH"
    );
    const distributedPlay: Action = {
      type: "PLAY_CARD",
      target: {
        type: "CHARACTER_CARD",
        source_zone: "TRASH",
        count: { exact: 1 },
      },
      params: {
        source_zone: "TRASH",
        cost_override: "FREE",
        entry_state: "PLAYER_CHOICE",
        state_distribution: { ACTIVE: 1, RESTED: 1 },
      },
    };
    const prepared = withPlayers(state, {
      characters: padChars([]),
      trash: [playTarget],
    });

    const started = executeActionChain(
      prepared,
      [distributedPlay, FOLLOW_ON_PROMPT],
      player0SourceId,
      0,
      cardDb,
      undefined,
      BLOCK_DESCRIPTION
    );
    expect(started.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    const resumed = resumeFromStack(
      started.state,
      {
        type: "PLAYER_CHOICE",
        choiceId: `${"play-state"}:${playTarget.instanceId}:ACTIVE`,
      },
      cardDb
    );

    expectFollowOnClause(resumed);
  });

  it("rule-trash batch frame carries the clause past the played card's ON_PLAY trigger", () => {
    const { cardDb, state, player0SourceId } = descriptionSetup();
    const onPlayCard = cardData("OPT771-ON-PLAY", ON_PLAY_DRAW_SCHEMA);
    cardDb.set(onPlayCard.id, onPlayCard);
    const board = fullBoard(CARDS.VANILLA.id);
    const playTarget = cardInstance(
      onPlayCard.id,
      "opt771-rule-trash-trigger-target",
      0,
      "TRASH"
    );
    const prepared = withPlayers(state, {
      characters: padChars(board),
      trash: [playTarget],
    });
    const play: Action = {
      type: "PLAY_CARD",
      target: {
        type: "CHARACTER_CARD",
        source_zone: "TRASH",
        count: { exact: 1 },
      },
      params: { source_zone: "TRASH", cost_override: "FREE" },
    };

    const started = resolveEffect(
      prepared,
      descriptionBlock([play, FOLLOW_ON_PROMPT]),
      player0SourceId,
      0,
      cardDb
    );
    expect(started.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const resumed = resumeFromStack(
      started.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [board[0].instanceId] },
      cardDb
    );

    expectFollowOnClause(resumed);
  });

  it("rule-trash continuation carries the clause when the played card queues no trigger", () => {
    const { cardDb, state, player0SourceId } = descriptionSetup();
    const board = fullBoard(CARDS.VANILLA.id);
    const playTarget = cardInstance(
      CARDS.RUSH.id,
      "opt771-rule-trash-plain-target",
      0,
      "TRASH"
    );
    const prepared = withPlayers(state, {
      characters: padChars(board),
      trash: [playTarget],
    });
    const play: Action = {
      type: "PLAY_CARD",
      target: {
        type: "CHARACTER_CARD",
        source_zone: "TRASH",
        count: { exact: 1 },
      },
      params: { source_zone: "TRASH", cost_override: "FREE" },
    };

    const started = resolveEffect(
      prepared,
      descriptionBlock([play, FOLLOW_ON_PROMPT]),
      player0SourceId,
      0,
      cardDb
    );
    expect(started.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const resumed = resumeFromStack(
      started.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [board[0].instanceId] },
      cardDb
    );

    expectFollowOnClause(resumed);
  });

  it("target batch frame carries the clause past the selected card's ON_KO trigger", () => {
    const { cardDb, state, player0SourceId } = descriptionSetup();
    const onKoCard = cardData("OPT771-ON-KO", ON_KO_DRAW_SCHEMA);
    cardDb.set(onKoCard.id, onKoCard);
    const target = cardInstance(
      onKoCard.id,
      "opt771-target-batch-on-ko",
      1,
      "CHARACTER"
    );
    const other = cardInstance(
      CARDS.VANILLA.id,
      "opt771-target-batch-other",
      1,
      "CHARACTER"
    );
    let prepared = withPlayers(
      state,
      {},
      {
        characters: padChars([target, other]),
      }
    );
    prepared = registerTriggersForCard(prepared, target, onKoCard);
    const ko: Action = {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { exact: 1 },
      },
    };

    const started = resolveEffect(
      prepared,
      descriptionBlock([ko, FOLLOW_ON_PROMPT]),
      player0SourceId,
      0,
      cardDb
    );
    expect(started.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const resumed = resumeFromStack(
      started.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] },
      cardDb
    );

    expectFollowOnClause(resumed);
  });

  it("interrupted batch frame copy carries the clause past a replacement prompt", () => {
    const { cardDb, state, player1SourceId } = descriptionSetup();
    const saver = cardInstance(
      CARDS.VANILLA.id,
      "opt771-replacement-saver",
      0,
      "CHARACTER"
    );
    const victim = cardInstance(
      CARDS.BLOCKER.id,
      "opt771-replacement-victim",
      0,
      "CHARACTER"
    );
    const replacement: RuntimeActiveEffect = {
      id: "opt771-replacement",
      sourceCardInstanceId: saver.instanceId,
      sourceEffectBlockId: "opt771-replacement-block",
      category: "replacement",
      modifiers: [
        {
          type: "REPLACEMENT_EFFECT",
          params: {
            trigger: "WOULD_BE_KO",
            cause_filter: { by: "OPPONENT_EFFECT" },
            target_filter: null,
            replacement_actions: [
              { type: "TRASH_CARD", target: { type: "SELF" } },
            ],
            optional: true,
            once_per_turn: false,
          },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [victim.instanceId],
      timestamp: 0,
    };
    const ko: Action = {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { exact: 1 },
      },
    };
    const prepared = withPlayers(state, {
      characters: padChars([saver, victim]),
    });
    const withBatch = pushBatchResumeFrame(
      { ...prepared, activeEffects: [replacement] },
      player1SourceId,
      1,
      CONTINUATION_EFFECT_BLOCK,
      {
        kind: "KO",
        pausedAction: ko,
        remainingTargetIds: [victim.instanceId],
        koedSoFar: [],
      },
      [],
      [FOLLOW_ON_PROMPT],
      new Map(),
      BLOCK_DESCRIPTION
    );

    const replacementPrompt = resumeFromStack(
      withBatch,
      { type: "PASS" },
      cardDb
    );
    expect(replacementPrompt.pendingPrompt?.options.promptType).toBe(
      "OPTIONAL_EFFECT"
    );

    const completed = resumePromptLifecycle(
      {
        ...replacementPrompt.state,
        pendingPrompt: replacementPrompt.pendingPrompt ?? null,
      },
      { type: "PLAYER_CHOICE", choiceId: "skip" },
      cardDb,
      {
        drainPregame: (current: GameState) => current,
        advanceStartOfTurn: (current: GameState) => current,
      }
    );

    expectFollowOnClause({ pendingPrompt: completed.state.pendingPrompt });
  });

  it("batch prompt frame copy carries the clause past a state-distribution prompt", () => {
    const { cardDb, state, player0SourceId } = descriptionSetup();
    const target = cardInstance(
      CARDS.RUSH.id,
      "opt771-batch-prompt-target",
      0,
      "TRASH"
    );
    const play: Action = {
      type: "PLAY_CARD",
      target: {
        type: "CHARACTER_CARD",
        source_zone: "TRASH",
        count: { exact: 1 },
      },
      params: {
        source_zone: "TRASH",
        cost_override: "FREE",
        entry_state: "PLAYER_CHOICE",
        state_distribution: { ACTIVE: 1, RESTED: 1 },
      },
    };
    const prepared = withPlayers(state, {
      characters: padChars([]),
      trash: [target],
    });
    const withBatch = pushBatchResumeFrame(
      prepared,
      player0SourceId,
      0,
      CONTINUATION_EFFECT_BLOCK,
      {
        kind: "PLAY_CARD",
        pausedAction: play,
        resumeFrame: {
          remainingTargetIds: [target.instanceId],
          remaining: { ACTIVE: 1, RESTED: 1 },
          playedSoFar: [],
        },
      },
      [],
      [FOLLOW_ON_PROMPT],
      new Map(),
      BLOCK_DESCRIPTION
    );

    const statePrompt = resumeFromStack(withBatch, { type: "PASS" }, cardDb);
    expect(statePrompt.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    const resumed = resumeFromStack(
      statePrompt.state,
      {
        type: "PLAYER_CHOICE",
        choiceId: `play-state:${target.instanceId}:ACTIVE`,
      },
      cardDb
    );

    expectFollowOnClause(resumed);
  });

  it("repeated batch frame carries the clause through a second trigger drain", () => {
    const { cardDb, state, player1SourceId } = descriptionSetup();
    const onKoCard = cardData("OPT771-ON-KO", ON_KO_DRAW_SCHEMA);
    cardDb.set(onKoCard.id, onKoCard);
    const target = cardInstance(
      onKoCard.id,
      "opt771-repeated-batch-target",
      0,
      "CHARACTER"
    );
    let prepared = withPlayers(state, {
      characters: padChars([target]),
    });
    prepared = registerTriggersForCard(prepared, target, onKoCard);
    const ko: Action = {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { exact: 1 },
      },
    };
    const withBatch = pushBatchResumeFrame(
      prepared,
      player1SourceId,
      1,
      CONTINUATION_EFFECT_BLOCK,
      {
        kind: "KO",
        pausedAction: ko,
        remainingTargetIds: [target.instanceId],
        koedSoFar: [],
      },
      [],
      [FOLLOW_ON_PROMPT],
      new Map(),
      BLOCK_DESCRIPTION
    );

    const resumed = resumeFromStack(withBatch, { type: "PASS" }, cardDb);

    expectFollowOnClause(resumed);
  });
});
