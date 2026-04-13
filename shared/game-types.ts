/**
 * Shared game types — single source of truth for both worker and client.
 *
 * Worker-only types (GameInitPayload, etc.) live in workers/game/src/types.ts.
 * Engine-internal types (PendingEvent, ExecuteResult) live there too.
 */

// ─── Zones ────────────────────────────────────────────────────────────────────

export type Zone =
  | "LEADER"
  | "CHARACTER"
  | "STAGE"
  | "COST_AREA"
  | "HAND"
  | "DECK"
  | "TRASH"
  | "LIFE"
  | "DON_DECK"
  | "REMOVED_FROM_GAME";

// ─── Card Instances ───────────────────────────────────────────────────────────

export interface CardInstance {
  instanceId: string;       // unique per game life; reset on zone change (rules §3-1-6)
  cardId: string;           // references Card.id in the card DB
  zone: Zone;
  state: "ACTIVE" | "RESTED";
  attachedDon: DonInstance[];
  turnPlayed: number | null; // for Rush check: can attack if turnPlayed === turn.number
  controller: 0 | 1;
  owner: 0 | 1;
}

export interface LifeCard {
  instanceId: string;
  cardId: string;
  face: "UP" | "DOWN";
}

export interface DonInstance {
  instanceId: string;
  state: "ACTIVE" | "RESTED";
  attachedTo: string | null; // CardInstance.instanceId, or null if in cost area / DON!! deck
}

// ─── Battle ───────────────────────────────────────────────────────────────────

export interface BattleContext {
  battleId: string;
  attackerInstanceId: string;
  targetInstanceId: string;
  attackerPower: number;    // computed at attack declaration
  defenderPower: number;    // recomputed after counters are applied
  counterPowerAdded: number;
  blockerActivated: boolean;
}

export type BattleSubPhase =
  | "ATTACK_STEP"
  | "BLOCK_STEP"      // Block before Counter per rules §7-1-2, §7-1-3
  | "COUNTER_STEP"
  | "DAMAGE_STEP"
  | "END_OF_BATTLE";

// ─── Turn & Phase ─────────────────────────────────────────────────────────────

// No ATTACK phase — battles are a Main Phase sub-state (rules §6-5-2)
export type Phase = "REFRESH" | "DRAW" | "DON" | "MAIN" | "END";

export interface PerformedAction {
  actionType: string;
  timestamp: number;
}

export interface TurnState {
  number: number;
  activePlayerIndex: 0 | 1;
  phase: Phase;
  battleSubPhase: BattleSubPhase | null;
  battle: BattleContext | null;
  oncePerTurnUsed: Record<string, string[]>; // effectId → instanceIds used this turn
  actionsPerformedThisTurn: PerformedAction[];
  extraTurnsPending?: number;
}

// ─── Player State ─────────────────────────────────────────────────────────────

export interface PlayerState {
  playerId: string;
  leader: CardInstance;
  characters: (CardInstance | null)[];  // fixed 5 slots; null = empty
  stage: CardInstance | null;    // max 1
  donCostArea: DonInstance[];
  hand: CardInstance[];
  deck: CardInstance[];          // ordered; index 0 = top
  trash: CardInstance[];         // ordered; index 0 = top (most recent)
  donDeck: DonInstance[];
  life: LifeCard[];              // ordered; index 0 = top (first removed on damage)
  removedFromGame: CardInstance[];
  deckList: DeckListEntry[];     // original deck composition (static, never changes)
  connected: boolean;
  awayReason: "LEFT" | "DISCONNECTED" | null;
  rejoinDeadlineAt: number | null;
  sleeveUrl: string | null;
  donArtUrl: string | null;
}

export interface DeckListEntry {
  cardId: string;
  count: number;
}

// ─── Effect / Modifier stubs (populated in M4) ────────────────────────────────

// These types exist so GameState has the right shape from the start.
// M3 always holds empty arrays here; M4 fills them in.
export interface ActiveEffect {
  id: string;
  sourceCardInstanceId: string;
  // Full type defined in M4
}

export interface ActiveProhibition {
  id: string;
  sourceCardInstanceId: string;
  // Full type defined in M4
}

export interface ScheduledActionEntry {
  id: string;
  // Full type defined in M4
}

export interface ActiveOneTimeModifier {
  id: string;
  // Full type defined in M4
}

export interface RegisteredTrigger {
  id: string;
  sourceCardInstanceId: string;
  effectBlockId: string;
  controller: 0 | 1;
  // Full type defined in M4
}

// ─── Game Events (Event Bus) ──────────────────────────────────────────────────

/**
 * Per-event-type payload map — single source of truth for all event payloads.
 * GameEvent and PendingEvent are both derived from this map.
 */
export interface GameEventPayloadMap {
  PHASE_CHANGED: { from: string; to: string };
  TURN_STARTED: Record<string, never>;
  TURN_ENDED: Record<string, never>;
  CARD_PLAYED: { cardId: string; cardInstanceId: string; zone: Zone; source: string };
  CARD_KO: { cardInstanceId: string; cardId: string; cause: string; causingController?: 0 | 1; causeCardInstanceId?: string; preKO_donCount: number };
  CARD_DRAWN: { cardId: string; cardInstanceId?: string; source?: string };
  CARD_TRASHED: { cardId?: string; cardInstanceId?: string; count?: number; reason: string; from?: string };
  CARD_RETURNED_TO_HAND: { cardInstanceId: string; cardId: string; source?: string };
  CARD_ADDED_TO_HAND_FROM_LIFE: { cardId?: string; cardInstanceId?: string; count?: number };
  LIFE_CARD_FACE_CHANGED: { face: "UP" | "DOWN" };
  ATTACK_DECLARED: { attackerInstanceId: string; targetInstanceId: string; attackerPower: number };
  BLOCK_DECLARED: { blockerInstanceId: string };
  COUNTER_USED: { cardId: string; counterValue?: number; counterTargetInstanceId?: string; cardInstanceId?: string; type?: string };
  BATTLE_RESOLVED: Record<string, never>;
  DAMAGE_DEALT: { amount: number; attackerInstanceId: string; attackerType: string; target?: string; lethal?: boolean };
  TRIGGER_ACTIVATED: { cardId: string; activated?: boolean };
  DON_GIVEN_TO_CARD: { targetInstanceId?: string; count: number };
  DON_DETACHED: { count?: number };
  DON_PLACED_ON_FIELD: { count: number };
  DON_STATE_CHANGED: Record<string, never>;
  CARD_STATE_CHANGED: { cardInstanceId?: string; targetInstanceId?: string; newState?: string; error?: string };
  POWER_MODIFIED: { targetInstanceId: string; amount?: number; value?: number };
  GAME_OVER: { winner?: 0 | 1 | null; reason: string };
  CARD_RETURNED_TO_DECK: { cardInstanceId: string; cardId?: string; position?: string };
  DON_SET_ACTIVE: { count: number };
  DON_RESTED: { count: number };
  CARDS_REVEALED: { cards: Array<{ instanceId: string; cardId: string }>; source?: string; visibility?: string };
  EFFECTS_NEGATED: { targetInstanceIds: string[] };
  LIFE_CARD_TO_DECK: { count: number };
  LIFE_SCRIED: { cards: Array<{ instanceId: string; cardId: string }>; count: number };
  ATTACK_REDIRECTED: { newTargetInstanceId: string };
  CARD_REMOVED_FROM_LIFE: { cardInstanceId: string };
  EXTRA_TURN_GRANTED: Record<string, never>;
  EVENT_ACTIVATED: { cardId?: string; cardInstanceId: string; source?: string };
  LIFE_CARD_TURNED_FACE_UP: { count: number };
  LIFE_CARD_TURNED_FACE_DOWN: { count: number };
  COMBAT_VICTORY: { cardInstanceId: string; targetInstanceId: string };
  CHARACTER_BATTLES: { cardInstanceId: string; targetInstanceId: string };
  LIFE_COUNT_BECOMES_ZERO: Record<string, never>;
  DRAW_OUTSIDE_DRAW_PHASE: { count: number };
}

/** Union of all event type strings. */
export type GameEventType = keyof GameEventPayloadMap;

/** Fully typed game event — discriminated union keyed by `type`. */
export type GameEvent = {
  [K in GameEventType]: {
    type: K;
    playerIndex: 0 | 1;
    payload: GameEventPayloadMap[K];
    timestamp: number;
  };
}[GameEventType];

/**
 * Pre-emission event shape used internally by the engine.
 * Same payload typing as GameEvent but playerIndex/payload are optional
 * (defaults applied by emitEvent).
 */
export type PendingGameEvent = {
  [K in GameEventType]: {
    type: K;
    playerIndex?: 0 | 1;
    payload?: GameEventPayloadMap[K];
  };
}[GameEventType];

// ─── Effect Stack ────────────────────────────────────────────────────────────

export type EffectStackPhase =
  | "AWAITING_OPTIONAL_RESPONSE"
  | "AWAITING_COST_SELECTION"
  | "AWAITING_TARGET_SELECTION"
  | "AWAITING_ARRANGE_CARDS"
  | "AWAITING_PLAYER_CHOICE"
  | "INTERRUPTED_BY_TRIGGERS"
  | "AWAITING_TRIGGER_ORDER_SELECTION";

export interface EffectStackFrame {
  id: string;
  sourceCardInstanceId: string;
  controller: 0 | 1;
  /** EffectBlock — typed as unknown in shared layer, cast in worker */
  effectBlock: unknown;
  phase: EffectStackPhase;

  // Action chain state
  pausedAction: unknown | null;
  remainingActions: unknown[];
  resultRefs: [string, unknown][];
  validTargets: string[];

  // Cost tracking
  costs: unknown[];
  currentCostIndex: number;
  costsPaid: boolean;
  oncePerTurnMarked: boolean;
  costResultRefs: [string, { targetInstanceIds: string[]; count: number }][];

  // Queued triggers waiting to resolve after this frame
  pendingTriggers: QueuedTrigger[];

  // Simultaneous triggers awaiting player ordering choice
  simultaneousTriggers?: QueuedTrigger[];

  // Events accumulated during partial execution
  accumulatedEvents: PendingGameEvent[];
}

export interface QueuedTrigger {
  sourceCardInstanceId: string;
  controller: 0 | 1;
  /** EffectBlock — typed as unknown in shared layer, cast in worker */
  effectBlock: unknown;
  triggeringEvent: PendingGameEvent;
}

// ─── Pending Prompt State ─────────────────────────────────────────────────────

export interface PendingPromptState {
  options: PromptOptions;
  respondingPlayer: 0 | 1;
  resumeContext: unknown; // cast to ResumeContext in worker
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  id: string;
  players: [PlayerState, PlayerState];
  turn: TurnState;
  // M4 stubs — always empty arrays in M3
  activeEffects: ActiveEffect[];
  prohibitions: ActiveProhibition[];
  scheduledActions: ScheduledActionEntry[];
  oneTimeModifiers: ActiveOneTimeModifier[];
  triggerRegistry: RegisteredTrigger[];
  pendingPrompt: PendingPromptState | null;
  effectStack: EffectStackFrame[];
  // Log
  eventLog: GameEvent[];
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED";
  winner: 0 | 1 | null;
  winReason: string | null;
}

// ─── Card DB snapshot (loaded at game init) ───────────────────────────────────

// Minimal card data the DO needs at runtime — fetched once from the Next.js API
// on game init and stored in DO storage.
export type CardDb = Record<string, CardData>;

export interface CardData {
  id: string;
  name: string;
  type: "Leader" | "Character" | "Event" | "Stage";
  color: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string[];   // Strike, Slash, Ranged, Special, Wisdom (§2-4)
  types: string[];       // Tribes, e.g. ["Straw Hat Crew"] (§2-5)
  effectText: string;
  triggerText: string | null;
  keywords: KeywordSet;
  effectSchema: unknown | null; // M4: parsed effect JSON
  imageUrl: string | null;
}

export interface KeywordSet {
  rush: boolean;
  rushCharacter: boolean;  // Rush: Character variant
  doubleAttack: boolean;
  banish: boolean;
  blocker: boolean;
  trigger: boolean;        // has a [Trigger] effect on the card
  unblockable: boolean;
}

// ─── Game Actions (Client → Server) ──────────────────────────────────────────

export type GameAction =
  | { type: "ADVANCE_PHASE" }
  | { type: "PLAY_CARD"; cardInstanceId: string; position?: number }
  | { type: "ATTACH_DON"; targetInstanceId: string; count: number }
  | { type: "ACTIVATE_EFFECT"; cardInstanceId: string; effectId: string }
  | { type: "DECLARE_ATTACK"; attackerInstanceId: string; targetInstanceId: string }
  | { type: "DECLARE_BLOCKER"; blockerInstanceId: string }
  | { type: "USE_COUNTER"; cardInstanceId: string; counterTargetInstanceId: string }
  | { type: "USE_COUNTER_EVENT"; cardInstanceId: string; counterTargetInstanceId: string }
  | { type: "REVEAL_TRIGGER"; reveal: boolean }  // true = reveal and activate, false = add to hand
  | { type: "ARRANGE_TOP_CARDS"; keptCardInstanceId: string; orderedInstanceIds: string[]; destination: "top" | "bottom" }
  | { type: "SELECT_TARGET"; selectedInstanceIds: string[] }
  | {
      type: "REDISTRIBUTE_DON";
      transfers: Array<{
        fromCardInstanceId: string;
        donInstanceId: string;
        toCardInstanceId: string;
      }>;
    }
  | { type: "PLAYER_CHOICE"; choiceId: string }
  | { type: "PASS" }
  | { type: "CONCEDE" }
  | { type: "MANUAL_EFFECT"; description: string }
  | { type: "UNDO" };

// ─── WebSocket messages ───────────────────────────────────────────────────────

// Server → Client
export type ServerMessage =
  | { type: "game:state"; state: GameState; canUndo?: boolean }
  | { type: "game:update"; action: GameAction; state: GameState; canUndo?: boolean }
  | { type: "game:prompt"; options: PromptOptions }
  | { type: "game:error"; message: string }
  | { type: "game:over"; winner: 0 | 1 | null; reason: string }
  | { type: "game:player_disconnected"; playerIndex: 0 | 1 }
  | { type: "game:player_reconnected"; playerIndex: 0 | 1 }
  | { type: "game:undo"; playerIndex: 0 | 1; canUndo: boolean };

// Client → Server
export type ClientMessage =
  | { type: "game:action"; action: GameAction }
  | { type: "game:leave" };

// ─── Prompt Options — discriminated union keyed by promptType ────────────────

export type PromptType = PromptOptions["promptType"];

export type PromptOptions =
  | SelectBlockerPrompt
  | SelectCounterTargetPrompt
  | SelectAttackTargetPrompt
  | RevealTriggerPrompt
  | SelectCardToTrashPrompt
  | ArrangeTopCardsPrompt
  | SelectTargetPrompt
  | RedistributeDonPrompt
  | PlayerChoicePrompt
  | OptionalEffectPrompt;

export interface SelectBlockerPrompt {
  promptType: "SELECT_BLOCKER";
  validTargets: string[];
  optional: boolean;
  timeoutMs: number;
}

export interface SelectCounterTargetPrompt {
  promptType: "SELECT_COUNTER_TARGET";
  validTargets: string[];
  optional?: boolean;
  timeoutMs?: number;
}

export interface SelectAttackTargetPrompt {
  promptType: "SELECT_ATTACK_TARGET";
  validTargets: string[];
  optional?: boolean;
  timeoutMs?: number;
}

export interface RevealTriggerPrompt {
  promptType: "REVEAL_TRIGGER";
  cards: CardInstance[];
  effectDescription: string;
  optional: boolean;
  timeoutMs: number;
}

export interface SelectCardToTrashPrompt {
  promptType: "SELECT_CARD_TO_TRASH";
  cards: CardInstance[];
  validTargets: string[];
  countMin: number;
  countMax: number;
  effectDescription?: string;
}

export interface ArrangeTopCardsPrompt {
  promptType: "ARRANGE_TOP_CARDS";
  cards: CardInstance[];
  effectDescription: string;
  canSendToBottom: boolean;
  validTargets?: string[];
  restDestination?: string;
}

export interface SelectTargetPrompt {
  promptType: "SELECT_TARGET";
  cards: CardInstance[];
  validTargets: string[];
  effectDescription: string;
  countMin: number;
  countMax: number;
  ctaLabel: string;
  blindSelection?: boolean;
  aggregateConstraint?: { property: "power" | "cost"; operator: "<=" | ">=" | "=="; value: number };
  uniquenessConstraint?: { field: "name" | "color" };
  namedDistribution?: { names: string[] };
  dualTargets?: {
    slots: Array<{
      validIds: string[];
      countMin: number;
      countMax: number;
    }>;
  };
}

export interface RedistributeDonPrompt {
  promptType: "REDISTRIBUTE_DON";
  validSourceCardIds: string[];
  validTargetCardIds: string[];
  maxTransfers: number;
  effectDescription: string;
}

export interface PlayerChoicePrompt {
  promptType: "PLAYER_CHOICE";
  choices: { id: string; label: string }[];
  effectDescription: string;
}

export interface OptionalEffectPrompt {
  promptType: "OPTIONAL_EFFECT";
  effectDescription: string;
  cards?: CardInstance[];
}
