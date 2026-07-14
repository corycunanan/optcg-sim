import type { CardData, GameState, LobbyMode } from "../types.js";
import { ALL_GAME_EVENT_TYPES } from "../../../../shared/game-types.js";
import { ALL_ACTION_TYPES } from "../engine/effect-types.js";
import {
  allocateEngineId,
  ensureExecutionContext,
} from "../engine/execution-context.js";
import { buildGameResultCallbackPayload } from "../util/result.js";
import {
  CONSUMED_TOKEN_JTIS_STORAGE_KEY,
  type TokenJtiStorage,
} from "../util/token-replay.js";
import { parseCardData } from "../util/validate.js";

export interface SessionStorage extends TokenJtiStorage {
  setAlarm(timestamp: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface SessionSnapshot {
  state: GameState;
  cardDb: Map<string, CardData>;
  mode: LobbyMode;
  testPriorityRolls: number[] | null;
  undoHistory: GameState[];
}

export interface StoredSession {
  state: GameState;
  cardDb: Record<string, CardData>;
  /** Legacy OPT-366 field retained for structured-clone compatibility. */
  mulliganDone?: [boolean, boolean];
  mode?: LobbyMode;
  testPriorityRolls?: number[] | null;
  undoHistory?: GameState[];
}

export interface ResultCallbackConfig {
  nextJsUrl: string;
  workerSecret: string;
}

/** Durable storage and result-callback boundary for a GameSession. */
export class SessionRepository {
  constructor(
    private readonly storage: SessionStorage,
    private readonly resultCallback: ResultCallbackConfig,
    private readonly fetchResult?: typeof fetch
  ) {}

  async initializeTokenLedger(): Promise<void> {
    await this.storage.put(CONSUMED_TOKEN_JTIS_STORAGE_KEY, {});
  }

  async save(snapshot: SessionSnapshot): Promise<SessionSnapshot> {
    const state = ensurePromptId(snapshot.state);
    const stored: StoredSession = {
      state,
      cardDb: Object.fromEntries(snapshot.cardDb),
      mode: snapshot.mode,
      testPriorityRolls: snapshot.testPriorityRolls,
      undoHistory: snapshot.undoHistory,
    };
    await this.storage.put("session", stored);
    return { ...snapshot, state };
  }

  async load(): Promise<SessionSnapshot | null> {
    const raw = await this.storage.get<unknown>("session");
    if (!raw) return null;
    const stored = parseStoredSession(raw);
    return {
      state: ensureExecutionContext(stored.state),
      cardDb: new Map(Object.entries(stored.cardDb)),
      mode: stored.mode ?? "PVP",
      testPriorityRolls: stored.testPriorityRolls ?? null,
      undoHistory: stored.undoHistory ?? [],
    };
  }

  async writeResult(state: GameState): Promise<void> {
    const body = buildGameResultCallbackPayload(state);
    const url = `${this.resultCallback.nextJsUrl}/api/game/result`;
    const response = await (this.fetchResult ?? fetch)(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.resultCallback.workerSecret}`,
      },
      body: JSON.stringify(body),
    }).catch((error: unknown) => {
      console.error("[GameSession] writeResultToDb fetch failed:", url, error);
      return null;
    });
    if (!response?.ok) {
      const text = (await response?.text().catch(() => "")) ?? "";
      if (response) {
        console.error(
          "[GameSession] writeResultToDb HTTP",
          response.status,
          text.slice(0, 300)
        );
      }
    }
  }

  async syncAlarm(state: GameState): Promise<void> {
    const nextDeadline = state.players.reduce<number | null>(
      (current, player) => {
        if (player.connected || player.rejoinDeadlineAt === null)
          return current;
        if (current === null) return player.rejoinDeadlineAt;
        return Math.min(current, player.rejoinDeadlineAt);
      },
      null
    );

    if (nextDeadline === null) {
      await this.storage.deleteAlarm();
      return;
    }
    await this.storage.setAlarm(nextDeadline);
  }
}

const KNOWN_ACTION_TYPES = new Set<string>(ALL_ACTION_TYPES);
const KNOWN_EVENT_TYPES = new Set<string>(ALL_GAME_EVENT_TYPES);
const KNOWN_MODIFIER_TYPES = new Set<string>([
  ...ALL_ACTION_TYPES,
  "SET_POWER",
  "MODIFY_POWER",
  "SET_COST",
  "MODIFY_COST",
  "GRANT_KEYWORD",
  "REMOVE_KEYWORD",
  "REPLACEMENT_EFFECT",
  "NEGATE_EFFECTS_FLAG",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    KNOWN_EVENT_TYPES.has(value.type)
  );
}

function isKnownAction(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.type !== "string" ||
    !KNOWN_ACTION_TYPES.has(value.type)
  ) {
    return false;
  }
  const params = value.params;
  if (!isRecord(params)) return params === undefined;
  if (value.type === "PLAYER_CHOICE" || value.type === "OPPONENT_CHOICE") {
    return (
      Array.isArray(params.options) &&
      params.options.every(
        (branch) => Array.isArray(branch) && branch.every(isKnownAction)
      )
    );
  }
  if (value.type === "OPPONENT_ACTION" || value.type === "SCHEDULE_ACTION") {
    return isKnownAction(params.action);
  }
  return true;
}

function hasKnownActions(values: unknown): boolean {
  return Array.isArray(values) && values.every(isKnownAction);
}

function hasValidEffectBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.actions === undefined || hasKnownActions(value.actions)) &&
    (value.replacement_actions === undefined ||
      hasKnownActions(value.replacement_actions))
  );
}

function hasValidModifier(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.type !== "string" ||
    !KNOWN_MODIFIER_TYPES.has(value.type)
  )
    return false;
  if (!isRecord(value.params)) return value.params === undefined;
  return (
    value.params.replacement_actions === undefined ||
    hasKnownActions(value.params.replacement_actions)
  );
}

function hasValidActiveEffect(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.modifiers) &&
    value.modifiers.every(hasValidModifier)
  );
}

function hasValidOneTimeModifier(value: unknown): boolean {
  return isRecord(value) && hasValidModifier(value.modification);
}

function hasValidProhibition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const override = value.conditionalOverride;
  if (override === undefined || override === null) return true;
  if (!isRecord(override)) return false;
  return override.action === undefined || isKnownAction(override.action);
}

function hasValidBatchResumeMarker(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    isRecord(value) &&
    value.pausedAction !== undefined &&
    isKnownAction(value.pausedAction)
  );
}

function hasValidSimultaneousGroup(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    (value.actions === undefined || hasKnownActions(value.actions)) &&
    (value.followingActions === undefined ||
      hasKnownActions(value.followingActions))
  );
}

function hasValidStackFrame(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    value.pausedAction !== null &&
    value.pausedAction !== undefined &&
    !isKnownAction(value.pausedAction)
  ) {
    return false;
  }
  if (
    value.remainingActions !== undefined &&
    !hasKnownActions(value.remainingActions)
  )
    return false;
  if (
    value.effectBlock !== undefined &&
    !hasValidEffectBlock(value.effectBlock)
  )
    return false;
  if (
    !hasValidBatchResumeMarker(value.batchResumeMarker) ||
    !hasValidSimultaneousGroup(value.simultaneousGroup)
  )
    return false;
  for (const key of ["pendingTriggers", "simultaneousTriggers"] as const) {
    const triggers = value[key];
    if (triggers === undefined) continue;
    if (
      !Array.isArray(triggers) ||
      triggers.some(
        (trigger) =>
          !isRecord(trigger) || !isKnownEvent(trigger.triggeringEvent)
      )
    )
      return false;
  }
  return true;
}

function hasValidPrompt(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const resume = value.resumeContext;
  if (!isRecord(resume)) return typeof resume === "string" || resume === null;
  if (
    resume.pausedAction !== null &&
    resume.pausedAction !== undefined &&
    !isKnownAction(resume.pausedAction)
  ) {
    return false;
  }
  return (
    (resume.remainingActions === undefined ||
      hasKnownActions(resume.remainingActions)) &&
    hasValidBatchResumeMarker(resume.batchResumeMarker)
  );
}

function parseStoredGameState(raw: unknown): GameState {
  if (!isRecord(raw)) throw new Error("Stored session state must be an object");
  const requiredArrays = [
    "activeEffects",
    "prohibitions",
    "scheduledActions",
    "oneTimeModifiers",
    "triggerRegistry",
    "effectStack",
    "eventLog",
  ] as const;
  if (
    typeof raw.id !== "string" ||
    !Array.isArray(raw.players) ||
    raw.players.length !== 2 ||
    !raw.players.every(isRecord) ||
    !isRecord(raw.turn) ||
    !requiredArrays.every((key) => Array.isArray(raw[key])) ||
    !["IN_PROGRESS", "FINISHED", "ABANDONED"].includes(String(raw.status)) ||
    (raw.winner !== null && raw.winner !== 0 && raw.winner !== 1) ||
    !hasValidPrompt(raw.pendingPrompt ?? null)
  ) {
    throw new Error("Stored session state has an invalid root shape");
  }
  if (!Array.isArray(raw.eventLog) || !raw.eventLog.every(isKnownEvent)) {
    throw new Error("Stored session contains an unknown event variant");
  }
  if (
    !Array.isArray(raw.scheduledActions) ||
    !raw.scheduledActions.every(
      (entry) => isRecord(entry) && isKnownAction(entry.action)
    )
  ) {
    throw new Error(
      "Stored session contains an unknown scheduled action variant"
    );
  }
  if (
    !Array.isArray(raw.effectStack) ||
    !raw.effectStack.every(hasValidStackFrame)
  ) {
    throw new Error(
      "Stored session contains an invalid effect-stack action or event"
    );
  }
  if (
    !Array.isArray(raw.triggerRegistry) ||
    !raw.triggerRegistry.every(
      (entry) => isRecord(entry) && hasValidEffectBlock(entry.effectBlock)
    )
  ) {
    throw new Error("Stored session contains an invalid registered trigger");
  }
  if (
    !Array.isArray(raw.activeEffects) ||
    !raw.activeEffects.every(hasValidActiveEffect) ||
    !Array.isArray(raw.oneTimeModifiers) ||
    !raw.oneTimeModifiers.every(hasValidOneTimeModifier) ||
    !Array.isArray(raw.prohibitions) ||
    !raw.prohibitions.every(hasValidProhibition)
  ) {
    throw new Error(
      "Stored session contains an invalid runtime effect variant"
    );
  }
  // The durable snapshot root, event discriminants, and every persisted action
  // carrier have now been checked. Internal code only receives this refined type.
  return raw as unknown as GameState;
}

export function parseStoredSession(raw: unknown): StoredSession {
  if (!isRecord(raw) || !isRecord(raw.cardDb)) {
    throw new Error("Stored session must contain a cardDb object");
  }
  const cardDb: Record<string, CardData> = {};
  for (const [key, value] of Object.entries(raw.cardDb)) {
    const card = parseCardData(value);
    if (card.id !== key)
      throw new Error(
        `Stored cardDb key '${key}' does not match CardData.id '${card.id}'`
      );
    cardDb[key] = card;
  }
  const mode = raw.mode ?? "PVP";
  if (mode !== "PVP" && mode !== "SOLITAIRE" && mode !== "PVCOMPUTER") {
    throw new Error("Stored session mode is invalid");
  }
  const testPriorityRolls = raw.testPriorityRolls ?? null;
  if (!isPriorityRollSequence(testPriorityRolls)) {
    throw new Error("Stored session testPriorityRolls is invalid");
  }
  const undoHistoryRaw = raw.undoHistory ?? [];
  if (!Array.isArray(undoHistoryRaw))
    throw new Error("Stored session undoHistory is invalid");
  return {
    state: parseStoredGameState(raw.state),
    cardDb,
    mode,
    testPriorityRolls,
    undoHistory: undoHistoryRaw.map(parseStoredGameState),
  };
}

function isPriorityRollSequence(value: unknown): value is number[] | null {
  return (
    value === null ||
    (Array.isArray(value) &&
      value.every(
        (roll): roll is number =>
          typeof roll === "number" &&
          Number.isInteger(roll) &&
          roll >= 1 &&
          roll <= 6
      ))
  );
}

function ensurePromptId(state: GameState): GameState {
  if (!state.pendingPrompt || state.pendingPrompt.promptId) return state;
  const allocated = allocateEngineId(state, "prompt");
  return {
    ...allocated.state,
    pendingPrompt: {
      ...state.pendingPrompt,
      promptId: allocated.id,
    },
  };
}
