/**
 * OPT-940 synthetic session states.
 *
 * Every state here is SYNTHETIC: a real engine state produced by the current
 * engine (or a constructed shape the current engine can hold), never a
 * captured Durable Object session. Captured sessions are an unmet rollout
 * gate recorded in docs/game-engine/SAVED-STATE-COMPATIBILITY.md §7.
 *
 * Two consumers share this builder so they see byte-identical input:
 *   - scripts/capture-writer-golden.ts serializes each state through the
 *     persistence writer and stores the bytes in
 *     fixtures/opt-940-writer-golden.synthetic.json.
 *   - opt-940-writer-golden.test.ts re-serializes the same states through the
 *     current writer and asserts the bytes are unchanged (writers unchanged).
 *   - opt-940-legacy-shapes.test.ts loads the stored bytes through the reader
 *     and asserts every legacy shape round-trips with its documented
 *     disposition.
 *
 * Keep this file deterministic: no Date.now, no Math.random, and no engine
 * call that reads ambient randomness (the engine RNG is state-owned).
 */

import type {
  CardData,
  EffectStackFrame,
  GameState,
  LifeCard,
  PendingPromptState,
  QueuedTrigger,
} from "../../types.js";
import type { SessionSnapshot, SessionStorage } from "../../session/persistence.js";
import { runPipeline } from "../../engine/pipeline.js";
import { startPregame } from "../../engine/pregame.js";
import { SessionCoordinator } from "../../session/coordinator.js";
import { resumePromptLifecycle } from "../../session/prompt-lifecycle.js";
import { registerTriggersForCard } from "../../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
  setupGame,
} from "../helpers.js";

export interface SyntheticSessionState {
  /** Stable fixture name; also the key in the golden JSON. */
  name: string;
  /** What legacy shape or engine situation the state represents. */
  shape: string;
  snapshot: SessionSnapshot;
}

/** In-memory SessionStorage that records every value exactly as written. */
export class MemorySessionStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  readonly writes: string[][] = [];

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(
    keyOrEntries: string | Record<string, unknown>,
    value?: unknown
  ): Promise<void> {
    const entries =
      typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries;
    for (const [key, entry] of Object.entries(entries)) {
      this.data.set(key, structuredClone(entry));
    }
    this.writes.push(Object.keys(entries));
  }

  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

function baseFrame(overrides: Partial<EffectStackFrame> & Pick<EffectStackFrame, "id" | "sourceCardInstanceId" | "controller" | "phase">): EffectStackFrame {
  return {
    effectBlock: { id: `${overrides.id}-block`, category: "activate", actions: [] },
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    ...overrides,
  };
}

function selectTargetPrompt(
  respondingPlayer: 0 | 1,
  validTargets: string[],
  resumeContext: PendingPromptState["resumeContext"]
): PendingPromptState {
  return {
    options: {
      promptType: "SELECT_TARGET",
      cards: [],
      validTargets,
      effectDescription: "Choose a Character",
      countMin: 0,
      countMax: 1,
      ctaLabel: "Confirm",
    },
    respondingPlayer,
    resumeContext,
  };
}

function queuedTrigger(index: number, controller: 0 | 1): QueuedTrigger {
  return {
    sourceCardInstanceId: `char-${controller}-v1`,
    orderingId: `char-${controller}-v1:queued-${index}:0`,
    controller,
    effectBlock: { id: `queued-${index}`, category: "auto", actions: [] },
    triggeringEvent: {
      type: "CARD_PLAYED",
      playerIndex: controller,
      payload: {
        cardId: CARDS.VANILLA.id,
        cardInstanceId: `char-${controller}-v1`,
        zone: "CHARACTER",
        source: "HAND",
      },
    },
  };
}

function snapshot(
  state: GameState,
  cardDb: Map<string, CardData>,
  undoHistory: GameState[] = []
): SessionSnapshot {
  return {
    state,
    cardDb,
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
    undoHistory,
  };
}

/**
 * A battle paused at the Damage Step on a [Trigger] Life card, produced by the
 * real engine (DECLARE_ATTACK, PASS block, PASS counter) and then surfaced as
 * the REVEAL_TRIGGER prompt the session persists.
 */
function battleTriggerWindow(cardDb: Map<string, CardData>): GameState {
  let state = createBattleReadyState(cardDb);
  const attacker = {
    instanceId: "datk-golden",
    cardId: CARDS.DOUBLE_ATK.id,
    zone: "CHARACTER" as const,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: 1,
    controller: 0 as const,
    owner: 0 as const,
  };
  const top: LifeCard = { instanceId: "life-golden-trigger", cardId: CARDS.TRIGGER.id, face: "DOWN" };
  const bottom: LifeCard = { instanceId: "life-golden-vanilla", cardId: CARDS.VANILLA.id, face: "DOWN" };
  state = {
    ...state,
    players: [
      {
        ...state.players[0],
        characters: padChars([
          ...(state.players[0].characters.filter(Boolean) as typeof attacker[]),
          attacker,
        ]) as GameState["players"][0]["characters"],
      },
      { ...state.players[1], life: [top, bottom] },
    ],
  };
  let result = runPipeline(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    cardDb,
    0
  );
  if (!result.valid) throw new Error(`golden: attack rejected: ${result.error}`);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 1);
  if (!result.valid) throw new Error(`golden: block pass rejected: ${result.error}`);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 1);
  if (!result.valid) throw new Error(`golden: counter pass rejected: ${result.error}`);
  if (!result.state.turn.battle?.pendingTriggerLifeCard) {
    throw new Error("golden: expected a paused battle Trigger window");
  }
  const surfaced = new SessionCoordinator().surfaceRevealTrigger(result.state, cardDb);
  if (surfaced.pendingPrompt?.options.promptType !== "REVEAL_TRIGGER") {
    throw new Error("golden: expected the coordinator to surface REVEAL_TRIGGER");
  }
  return surfaced;
}

/**
 * An End Phase parked below a scheduled effect's prompt, produced by the real
 * engine: two END_OF_THIS_TURN scheduled actions, the first of which prompts.
 */
function endPhaseParked(cardDb: Map<string, CardData>): GameState {
  const state: GameState = {
    ...createBattleReadyState(cardDb),
    scheduledActions: [
      {
        id: "sched-golden-1",
        timing: "END_OF_THIS_TURN",
        action: {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
        },
        boundToInstanceId: null,
        sourceEffectId: "golden-when-attacking",
        controller: 0,
      },
      {
        id: "sched-golden-2",
        timing: "END_OF_THIS_TURN",
        action: { type: "DRAW", params: { amount: 1 } },
        boundToInstanceId: null,
        sourceEffectId: "golden-when-attacking-2",
        controller: 0,
      },
    ],
  };
  const result = runPipeline(state, { type: "ADVANCE_PHASE" }, cardDb, 0);
  if (!result.valid) throw new Error(`golden: ADVANCE_PHASE rejected: ${result.error}`);
  const phaseFrame = result.state.effectStack.find((frame) => frame.phaseBoundaryContinuation);
  if (!result.state.pendingPrompt || !phaseFrame) {
    throw new Error("golden: expected a prompt with a parked End Phase frame");
  }
  if (phaseFrame.phaseBoundaryContinuation?.remainingScheduledActions.length !== 1) {
    throw new Error("golden: expected one remaining scheduled action below the prompt");
  }
  return result.state;
}


/**
 * Both Trigger windows open at once, produced by the real engine (finding A
 * of the PR #746 review): p0's Leader "when this attack deals damage" K.O.s a
 * p1 Character whose [On K.O.] deals 1 effect damage back to p0 while p1's
 * own battle Trigger is still parked. Both top Life cards carry [Trigger].
 * The coordinator serves the battle Trigger first (surfaceRevealTrigger).
 */
function bothTriggerWindows(cardDb: Map<string, CardData>): GameState {
  const noKeywords = { ...CARDS.VANILLA.keywords };
  const leader: CardData = {
    ...CARDS.LEADER,
    id: "SYN-LEADER-DAMAGE-KO",
    name: "SYN-LEADER-DAMAGE-KO",
    effectSchema: {
      card_id: "SYN-LEADER-DAMAGE-KO",
      card_name: "SYN-LEADER-DAMAGE-KO",
      card_type: "Leader",
      effects: [
        {
          id: "syn-leader-damage-ko",
          category: "auto",
          trigger: { event: "ATTACK_DEALS_DAMAGE", filter: { attacker: "SELF" } },
          actions: [
            {
              type: "KO",
              target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
            },
          ],
        },
      ],
    },
  };
  const robin: CardData = {
    ...CARDS.VANILLA,
    id: "SYN-ROBIN-ON-KO-DAMAGE",
    name: "SYN-ROBIN-ON-KO-DAMAGE",
    keywords: noKeywords,
    effectSchema: {
      card_id: "SYN-ROBIN-ON-KO-DAMAGE",
      card_name: "SYN-ROBIN-ON-KO-DAMAGE",
      card_type: "Character",
      effects: [
        {
          id: "syn-robin-on-ko-damage",
          category: "auto",
          trigger: { keyword: "ON_KO" },
          actions: [
            { type: "DEAL_DAMAGE", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount: 1 } },
          ],
        },
      ],
    },
  };
  cardDb.set(leader.id, leader);
  cardDb.set(robin.id, robin);

  let state = createBattleReadyState(cardDb);
  const p0Leader = { ...state.players[0].leader, cardId: leader.id };
  const robinInstance = {
    instanceId: "robin-golden",
    cardId: robin.id,
    zone: "CHARACTER" as const,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: 1,
    controller: 1 as const,
    owner: 1 as const,
  };
  state = {
    ...state,
    players: [
      {
        ...state.players[0],
        leader: p0Leader,
        life: [
          { instanceId: "life-golden-p0-trigger", cardId: CARDS.TRIGGER.id, face: "DOWN" },
          { instanceId: "life-golden-p0-vanilla", cardId: CARDS.VANILLA.id, face: "DOWN" },
        ],
      },
      {
        ...state.players[1],
        characters: padChars([robinInstance]) as GameState["players"][1]["characters"],
        life: [
          { instanceId: "life-golden-p1-trigger", cardId: CARDS.TRIGGER.id, face: "DOWN" },
          { instanceId: "life-golden-p1-vanilla", cardId: CARDS.VANILLA.id, face: "DOWN" },
        ],
      },
    ],
  };
  state = registerTriggersForCard(state, p0Leader, leader);
  state = registerTriggersForCard(state, robinInstance, robin);

  const coordinator = new SessionCoordinator();
  const step = (playerIndex: 0 | 1, action: Parameters<SessionCoordinator["executeAction"]>[3]) => {
    const result = coordinator.executeAction(state, [], playerIndex, action, cardDb);
    if (result.kind !== "applied") {
      throw new Error(`golden: ${action.type} by p${playerIndex} was ${result.kind}: ${"reason" in result ? result.reason : ""}`);
    }
    state = result.state;
  };
  step(0, {
    type: "DECLARE_ATTACK",
    attackerInstanceId: p0Leader.instanceId,
    targetInstanceId: state.players[1].leader.instanceId,
  });
  step(1, { type: "PASS" });
  step(1, { type: "PASS" });
  const koPrompt = state.pendingPrompt;
  if (koPrompt?.options.promptType !== "SELECT_TARGET" || koPrompt.respondingPlayer !== 0) {
    throw new Error("golden: expected p0's K.O. SELECT_TARGET after the damage");
  }
  const resumed = resumePromptLifecycle(
    state,
    { type: "SELECT_TARGET", selectedInstanceIds: [robinInstance.instanceId], promptId: koPrompt.promptId },
    cardDb,
    { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
  );
  if (resumed.responseRejected) throw new Error("golden: K.O. selection was rejected");
  state = coordinator.surfaceRevealTrigger(resumed.state, cardDb);
  if (!state.turn.battle?.pendingTriggerLifeCard || !state.turn.pendingTriggerFromEffect) {
    throw new Error("golden: expected both Trigger windows to be open");
  }
  if (state.pendingPrompt?.options.promptType !== "REVEAL_TRIGGER" || state.effectStack.length !== 0) {
    throw new Error("golden: expected the battle REVEAL_TRIGGER prompt on an empty stack");
  }
  return state;
}

export function buildSyntheticSessionStates(): SyntheticSessionState[] {
  const cardDb = createTestCardDb();
  const { state: fresh } = setupGame();
  const battleReady = createBattleReadyState(cardDb);
  const checkpoint: GameState = { ...fresh, turn: { ...fresh.turn, number: 99 } };
  const p1Char = battleReady.players[1].characters[0]!.instanceId;
  const p0Char = battleReady.players[0].characters[0]!.instanceId;

  const effectFrame = baseFrame({
    id: "golden-effect-frame",
    sourceCardInstanceId: p0Char,
    controller: 0,
    phase: "AWAITING_TARGET_SELECTION",
    pausedAction: {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
    },
    remainingActions: [{ type: "DRAW", params: { amount: 1 }, chain: "THEN" }],
    validTargets: [p1Char],
  });

  const legacyCostFrame = baseFrame({
    id: "golden-legacy-cost-frame",
    sourceCardInstanceId: p0Char,
    controller: 0,
    phase: "AWAITING_COST_SELECTION",
    costs: [
      { type: "DON_REST", amount: 1 },
      { type: "TRASH_FROM_HAND", amount: 1 },
    ],
    currentCostIndex: 1,
    costsPaid: false,
    oncePerTurnMarked: false,
    costResultRefs: [["cost_0", { targetInstanceIds: ["don-p0-0"], count: 1 }]],
    accumulatedEvents: [{ type: "DON_RESTED", playerIndex: 0, payload: { count: 1 } }],
    validTargets: battleReady.players[0].hand.map((card) => card.instanceId),
  });

  const orderingTriggers = [queuedTrigger(0, 0), queuedTrigger(1, 0), queuedTrigger(2, 0)];
  const orderingFrame = baseFrame({
    id: "golden-ordering-frame",
    sourceCardInstanceId: p0Char,
    controller: 0,
    phase: "AWAITING_TRIGGER_ORDER_SELECTION",
    effectBlock: orderingTriggers[0].effectBlock,
    oncePerTurnMarked: false,
    simultaneousTriggers: [orderingTriggers[1], orderingTriggers[2]],
    triggerOrderingGroup: {
      triggers: orderingTriggers,
      resolvedTriggerIds: [orderingTriggers[0].orderingId!],
    },
  });

  const batchFrame = baseFrame({
    id: "golden-batch-frame",
    sourceCardInstanceId: p0Char,
    controller: 0,
    phase: "AWAITING_BATCH_RESUME",
    batchResumeMarker: {
      kind: "KO",
      pausedAction: {
        type: "KO",
        target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 2 } },
      },
      remainingTargetIds: [p1Char],
      koedSoFar: [battleReady.players[1].characters[1]!.instanceId],
    },
    pendingTriggers: [queuedTrigger(7, 1)],
  });

  const structuralResume: PendingPromptState = selectTargetPrompt(0, [p1Char], {
    effectSourceInstanceId: p0Char,
    controller: 0,
    pausedAction: {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
    },
    remainingActions: [],
    resultRefs: [],
    validTargets: [p1Char],
  });

  const states: SyntheticSessionState[] = [
    {
      name: "fresh-setup",
      shape: "initial state before pregame, no undo",
      snapshot: snapshot(fresh, cardDb),
    },
    {
      name: "pregame-priority-roll",
      shape: "pregame context (priority roll started)",
      snapshot: snapshot(startPregame(fresh, "PRIORITY_ROLL"), cardDb),
    },
    {
      name: "battle-ready-with-undo",
      shape: "live state plus one undo snapshot",
      snapshot: snapshot(battleReady, cardDb, [checkpoint]),
    },
    {
      name: "effect-frame-prompt",
      shape: "EFFECT frame with a string resumeContext naming the top frame",
      snapshot: snapshot(
        {
          ...battleReady,
          effectStack: [effectFrame],
          pendingPrompt: selectTargetPrompt(0, [p1Char], effectFrame.id),
        },
        cardDb
      ),
    },
    {
      name: "structural-resume-context",
      shape: "legacy structural ResumeContext with an empty effect stack",
      snapshot: snapshot(
        { ...battleReady, effectStack: [], pendingPrompt: structuralResume },
        cardDb
      ),
    },
    {
      name: "legacy-cost-transaction-frame",
      shape: "COST frame paid past index 0 with no costTransactionState (isLegacyCostTransactionFrame)",
      snapshot: snapshot(
        {
          ...battleReady,
          effectStack: [legacyCostFrame],
          pendingPrompt: selectTargetPrompt(0, legacyCostFrame.validTargets, legacyCostFrame.id),
        },
        cardDb
      ),
    },
    {
      name: "trigger-order-prompt",
      shape: "TRIGGER_ORDER frame with a partially resolved ordering group",
      snapshot: snapshot(
        {
          ...battleReady,
          effectStack: [orderingFrame],
          pendingPrompt: {
            options: {
              promptType: "PLAYER_CHOICE",
              effectDescription: "Choose which effect to activate first",
              confirmOrSkip: true,
              choices: [
                { id: orderingTriggers[0].orderingId!, label: "First", disabled: true },
                { id: orderingTriggers[1].orderingId!, label: "Second" },
                { id: orderingTriggers[2].orderingId!, label: "Third" },
              ],
            },
            respondingPlayer: 0,
            resumeContext: orderingFrame.id,
          },
        },
        cardDb
      ),
    },
    {
      name: "batch-resume-frame",
      shape: "BATCH_RESUME frame with a pending opponent trigger (no prompt)",
      snapshot: snapshot({ ...battleReady, effectStack: [batchFrame] }, cardDb),
    },
    {
      name: "end-phase-parked",
      shape: "stage-less PhaseBoundaryContinuation below a scheduled effect's prompt, with one remaining scheduled action (real engine)",
      snapshot: snapshot(endPhaseParked(cardDb), cardDb),
    },
    {
      name: "battle-trigger-window",
      shape: "DAMAGE_STEP paused on battle.pendingTriggerLifeCard with the surfaced REVEAL_TRIGGER prompt (real engine)",
      snapshot: snapshot(battleTriggerWindow(cardDb), cardDb),
    },
    {
      name: "both-trigger-windows",
      shape: "DAMAGE_STEP with battle.pendingTriggerLifeCard and turn.pendingTriggerFromEffect both set, battle REVEAL_TRIGGER prompt pending, empty stack (real engine; review finding A)",
      snapshot: snapshot(bothTriggerWindows(cardDb), cardDb),
    },
    {
      name: "effect-damage-trigger-window",
      shape: "turn.pendingTriggerFromEffect with its REVEAL_TRIGGER prompt",
      snapshot: snapshot(
        {
          ...battleReady,
          turn: {
            ...battleReady.turn,
            pendingTriggerFromEffect: {
              lifeCard: { instanceId: "life-golden-effect", cardId: CARDS.TRIGGER.id, face: "DOWN" },
              damagedPlayerIndex: 1,
              remainingDamages: 0,
              sourceCardInstanceId: p0Char,
              controllerIndex: 0,
            },
          },
          pendingPrompt: {
            options: {
              promptType: "REVEAL_TRIGGER",
              cards: [],
              effectDescription: "[Trigger] Play this card.",
              optional: false,
              timeoutMs: 30_000,
            },
            respondingPlayer: 1,
            resumeContext: null,
          },
        },
        cardDb
      ),
    },
    {
      name: "replacement-prompt",
      shape: "REPLACEMENT resume context",
      snapshot: snapshot(
        {
          ...battleReady,
          pendingPrompt: {
            options: { promptType: "OPTIONAL_EFFECT", effectDescription: "Trash 1 card instead?", cards: [] },
            respondingPlayer: 1,
            resumeContext: {
              type: "REPLACEMENT",
              effectId: "golden-replacement",
              targetInstanceId: p1Char,
              event: "WOULD_BE_KO",
            },
          },
        },
        cardDb
      ),
    },
    {
      name: "replacement-batch-prompt",
      shape: "REPLACEMENT_BATCH resume context",
      snapshot: snapshot(
        {
          ...battleReady,
          pendingPrompt: {
            options: { promptType: "OPTIONAL_EFFECT", effectDescription: "Trash 1 card instead?", cards: [] },
            respondingPlayer: 1,
            resumeContext: {
              type: "REPLACEMENT_BATCH",
              actionKind: "KO",
              event: "WOULD_BE_KO",
              allTargetIds: [p1Char, battleReady.players[1].characters[1]!.instanceId],
              protectedIds: [],
              pendingMatches: [
                { effectId: "golden-replacement", matchedTargetIds: [p1Char], optional: true },
              ],
              currentMatchIndex: 0,
              causingController: 0,
            },
          },
        },
        cardDb
      ),
    },
    {
      name: "stuck-damage-step",
      shape: "OPT-884: DAMAGE_STEP with an unanswered CHARACTER_KO_REPLACEMENT continuation whose target has left the field, no prompt, empty stack",
      snapshot: snapshot(
        {
          ...battleReady,
          turn: {
            ...battleReady.turn,
            battleSubPhase: "DAMAGE_STEP",
            battle: {
              battleId: "golden-stuck-battle",
              attackerInstanceId: p0Char,
              targetInstanceId: "char-1-gone",
              attackerPower: 5000,
              defenderPower: 4000,
              counterPowerAdded: 0,
              blockerActivated: false,
            },
            pendingBattleDamageContinuation: {
              battleId: "golden-stuck-battle",
              stage: "CHARACTER_KO_REPLACEMENT",
              targetInstanceId: "char-1-gone",
              causingPlayerIndex: 0,
              attackerIsCharacter: true,
            },
          },
        },
        cardDb
      ),
    },
    {
      name: "finished",
      shape: "terminal state",
      snapshot: snapshot(
        { ...battleReady, status: "FINISHED", winner: 0, winReason: "Opponent conceded" },
        cardDb,
        [checkpoint]
      ),
    },
  ];
  return states;
}
