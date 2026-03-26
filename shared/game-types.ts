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
}

// ─── Player State ─────────────────────────────────────────────────────────────

export interface PlayerState {
  playerId: string;
  leader: CardInstance;
  characters: CardInstance[];    // max 5
  stage: CardInstance | null;    // max 1
  donCostArea: DonInstance[];
  hand: CardInstance[];
  deck: CardInstance[];          // ordered; index 0 = top
  trash: CardInstance[];         // ordered; index 0 = top (most recent)
  donDeck: DonInstance[];
  life: LifeCard[];              // ordered; index 0 = top (first removed on damage)
  removedFromGame: CardInstance[];
  connected: boolean;
  awayReason: "LEFT" | "DISCONNECTED" | null;
  rejoinDeadlineAt: number | null;
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

export type GameEventType =
  | "PHASE_CHANGED"
  | "TURN_STARTED"
  | "TURN_ENDED"
  | "CARD_PLAYED"
  | "CARD_KO"
  | "CARD_DRAWN"
  | "CARD_TRASHED"
  | "CARD_RETURNED_TO_HAND"
  | "CARD_ADDED_TO_HAND_FROM_LIFE"
  | "LIFE_CARD_FACE_CHANGED"
  | "ATTACK_DECLARED"
  | "BLOCK_DECLARED"
  | "COUNTER_USED"
  | "BATTLE_RESOLVED"
  | "DAMAGE_DEALT"
  | "TRIGGER_ACTIVATED"
  | "DON_GIVEN_TO_CARD"
  | "DON_DETACHED"
  | "DON_PLACED_ON_FIELD"
  | "DON_STATE_CHANGED"
  | "CARD_STATE_CHANGED"
  | "POWER_MODIFIED"
  | "GAME_OVER"
  | "CARD_RETURNED_TO_DECK"
  | "DON_SET_ACTIVE"
  | "DON_RESTED"
  | "CARDS_REVEALED"
  | "EFFECTS_NEGATED"
  | "LIFE_CARD_TO_DECK"
  | "LIFE_SCRIED";

export interface GameEvent {
  type: GameEventType;
  playerIndex: 0 | 1;
  payload: Record<string, unknown>;
  timestamp: number;
}

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

  // Queued triggers waiting to resolve after this frame
  pendingTriggers: QueuedTrigger[];

  // Simultaneous triggers awaiting player ordering choice
  simultaneousTriggers?: QueuedTrigger[];

  // Events accumulated during partial execution
  accumulatedEvents: { type: GameEventType; playerIndex?: 0 | 1; payload?: Record<string, unknown> }[];
}

export interface QueuedTrigger {
  sourceCardInstanceId: string;
  controller: 0 | 1;
  /** EffectBlock — typed as unknown in shared layer, cast in worker */
  effectBlock: unknown;
  triggeringEvent: { type: GameEventType; playerIndex?: 0 | 1; payload?: Record<string, unknown> };
}

// ─── Pending Prompt State ─────────────────────────────────────────────────────

export interface PendingPromptState {
  promptType: PromptType;
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
  | { type: "PLAYER_CHOICE"; choiceId: string }
  | { type: "PASS" }
  | { type: "CONCEDE" }
  | { type: "MANUAL_EFFECT"; description: string };

// ─── WebSocket messages ───────────────────────────────────────────────────────

// Server → Client
export type ServerMessage =
  | { type: "game:state"; state: GameState }
  | { type: "game:update"; action: GameAction; state: GameState }
  | { type: "game:prompt"; promptType: PromptType; options: PromptOptions }
  | { type: "game:error"; message: string }
  | { type: "game:over"; winner: 0 | 1 | null; reason: string }
  | { type: "game:player_disconnected"; playerIndex: 0 | 1 }
  | { type: "game:player_reconnected"; playerIndex: 0 | 1 };

// Client → Server
export type ClientMessage =
  | { type: "game:action"; action: GameAction }
  | { type: "game:leave" };

export type PromptType =
  | "SELECT_BLOCKER"
  | "SELECT_COUNTER_TARGET"
  | "SELECT_ATTACK_TARGET"
  | "REVEAL_TRIGGER"
  | "SELECT_CARD_TO_TRASH"   // e.g. 5-card overflow
  | "ARRANGE_TOP_CARDS"
  | "SELECT_TARGET"
  | "PLAYER_CHOICE"
  | "OPTIONAL_EFFECT";

export interface PromptOptions {
  validTargets?: string[];   // instanceIds
  optional?: boolean;
  timeoutMs?: number;
  // ARRANGE_TOP_CARDS
  canSendToBottom?: boolean;
  // Shared: ARRANGE_TOP_CARDS + SELECT_TARGET
  cards?: CardInstance[];
  effectDescription?: string;
  // SELECT_TARGET
  countMin?: number;
  countMax?: number;
  ctaLabel?: string;
  blindSelection?: boolean; // true when selecting from hidden cards (opponent's hand)
  // PLAYER_CHOICE
  choices?: { id: string; label: string }[];
}
