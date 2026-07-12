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
  // OPT-239: damage count locked at Damage Step entry. 2 for [Double Attack],
  // 1 otherwise. Decremented each time a damage is dealt to Leader life, so
  // the [Trigger] resume path knows whether another damage is still owed.
  damagesRemaining?: number;
  // Battle damage that reveals a Life card with [Trigger] pauses the battle
  // until the damaged player accepts or declines that trigger.
  pendingTriggerLifeCard?: LifeCard;
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
  /**
   * For CHARACTER_KO records: owner of the K.O.'d character.
   * For ATTACKED records: the attacking player (OPT-413).
   * For PLAY_CARD / USE_COUNTER_EVENT / DECLARE_BLOCKER records: the player
   * who performed the action (OPT-443).
   */
  controller?: 0 | 1;
  /**
   * PLAY_CARD / USE_COUNTER_EVENT / DECLARE_BLOCKER records (OPT-443):
   * snapshot of the acted card's PRINTED properties, captured before
   * execution (zone transitions reassign instanceIds and Events leave the
   * field immediately, so a post-hoc lookup is unreliable).
   * ACTION_PERFORMED_THIS_TURN conditions scope on these. Legacy entries
   * missing the snapshot fail closed because their card category/filter
   * cannot be verified.
   */
  cardId?: string;
  /** Upper-cased printed category: "CHARACTER" | "EVENT" | "STAGE". */
  cardType?: string;
  /** Printed (base) cost — "base cost of N or more" conditions (OP15-002). */
  baseCost?: number;
  /** ATTACKED records: the attacking card. */
  attackerInstanceId?: string;
  /**
   * ATTACKED records: what the attack's FINAL target was (post-redirect) —
   * OP16-080 FAQ: a redirected attack counts against the card actually
   * battled, so this is recorded at battle end, not declaration.
   */
  targetType?: "LEADER" | "CHARACTER";
  targetController?: 0 | 1;
}

export interface TurnState {
  number: number;
  activePlayerIndex: 0 | 1;
  /**
   * OPT-366: index of the player who took the first turn of the game (set by
   * the pregame priority decision). Anchors §6-3-1 first-turn skip-draw,
   * §6-4-1 first-turn 1-DON!!, and the turn-number increment boundary.
   * Optional — read sites default to 0 so tests / legacy paths that bypass
   * the pregame flow keep their pre-OPT-366 behavior (player 0 always first).
   */
  firstPlayerIndex?: 0 | 1;
  phase: Phase;
  battleSubPhase: BattleSubPhase | null;
  battle: BattleContext | null;
  oncePerTurnUsed: Record<string, string[]>; // effectId → instanceIds used this turn
  actionsPerformedThisTurn: PerformedAction[];
  extraTurnsPending?: number;
  // OPT-259 (F6): effect-sourced damage (DEAL_DAMAGE) reveals a Life card
  // with [Trigger]. The damaged player must decide to activate or decline,
  // after which the damage loop resumes for any remaining iterations.
  // Battle damage uses `battle.pendingTriggerLifeCard` instead — effect damage
  // is decoupled so it can happen outside the battle phase.
  pendingTriggerFromEffect?: {
    lifeCard: LifeCard;
    damagedPlayerIndex: 0 | 1;
    remainingDamages: number;  // damages still to deal AFTER the current one resolves
    sourceCardInstanceId: string;
    controllerIndex: 0 | 1;    // controller of the effect that dealt the damage
  } | null;
  // OPT-441: a battle-damage [Trigger] effect may pause on the effect stack.
  // Keep the completed Life damage's battle identity until that stack (and any
  // CARD_REMOVED_FROM_LIFE auto effects queued behind it) fully unwinds, then
  // resume the remaining Double Attack damage through the normal pipeline.
  pendingBattleDamageContinuation?: {
    battleId: string;
    lifeCardInstanceId: string;
    damagedPlayerIndex: 0 | 1;
    stage: "LIFE_REMOVAL" | "DAMAGE";
  } | null;
  // Per-turn sticky flag: set to true the first time a player's deck transitions
  // to 0 cards during the current turn. Consumed by the end-of-turn defeat check
  // for Leaders with LOSS_CONDITION_MOD/DELAYED_LOSS (e.g., OP15-022 Brook).
  deckHitZeroThisTurn: [boolean, boolean];
  // OPT-257 (F4): instance IDs currently in trigger-resolution staging — Life
  // cards that have been moved to trash for an activated [Trigger] but whose
  // effect block has not yet built its candidate list. Per Bandai rulings the
  // staging card is NOT yet "in trash" for trash-targeting effects (e.g.
  // OP14-082 Trigger "Play X from trash" must not be able to pick itself).
  // Filtered out of TRASH source-zone candidates and TRASH_COUNT queries.
  // Cleared once resolveEffect returns — by then any pending prompt's valid
  // targets have already been locked in.
  triggerStagingInstanceIds?: string[];
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
  CARD_PLAYED: { cardId: string; cardInstanceId: string; zone: Zone; source: string; playedRested?: boolean; sourceZone?: Zone };
  CARD_KO: { cardInstanceId: string; cardId: string; cause: string; causingController?: 0 | 1; causeCardInstanceId?: string; preKO_donCount: number };
  CARD_DRAWN: { cardId: string; cardInstanceId?: string; source?: string };
  CARD_TRASHED: { cardId?: string; cardInstanceId?: string; count?: number; reason: string; from?: string };
  CARD_RETURNED_TO_HAND: { cardInstanceId: string; cardId: string; source?: string };
  CARD_ADDED_TO_HAND_FROM_LIFE: { cardId?: string; cardInstanceId?: string; count?: number };
  LIFE_CARD_FACE_CHANGED: { face: "UP" | "DOWN" };
  ATTACK_DECLARED: { attackerInstanceId: string; targetInstanceId: string; attackerPower: number };
  // OPT-246: emitted at BLOCK_STEP → COUNTER_STEP boundary. Marks the
  // moment the attack target is locked in (after any [Blocker] redirect),
  // and is the firing window for "When this is attacked" effects.
  ATTACK_TARGET_FINAL: { attackerInstanceId: string; targetInstanceId: string; redirected: boolean };
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
  CARDS_REVEALED: {
    cards: Array<{ instanceId: string; cardId: string }>;
    source?: string;
    visibility: "BOTH" | "CONTROLLER_ONLY";
    visibleTo?: 0 | 1;
  };
  EFFECTS_NEGATED: { targetInstanceIds: string[] };
  LIFE_CARD_TO_DECK: { count: number };
  LIFE_SCRIED: { cards: Array<{ instanceId: string; cardId: string }>; count: number };
  ATTACK_REDIRECTED: { newTargetInstanceId: string };
  CARD_REMOVED_FROM_LIFE: { cardInstanceId: string };
  EXTRA_TURN_GRANTED: Record<string, never>;
  EVENT_ACTIVATED_FROM_HAND: { cardId?: string; cardInstanceId: string; costReducedAmount?: number };
  EVENT_MAIN_RESOLVED_FROM_TRASH: { cardId?: string; cardInstanceId: string };
  EVENT_TRIGGER_RESOLVED: { cardId?: string; cardInstanceId: string };
  LIFE_CARD_TURNED_FACE_UP: { count: number };
  LIFE_CARD_TURNED_FACE_DOWN: { count: number };
  COMBAT_VICTORY: { cardInstanceId: string; targetInstanceId: string };
  CHARACTER_BATTLES: { cardInstanceId: string; targetInstanceId: string };
  END_OF_BATTLE: { attackerInstanceId: string; targetInstanceId: string; aborted: boolean };
  BATTLE_ABORTED: { attackerInstanceId: string; targetInstanceId: string; reason: "ATTACKER_LEFT_FIELD" | "TARGET_LEFT_FIELD" };
  LIFE_COUNT_BECOMES_ZERO: Record<string, never>;
  DRAW_OUTSIDE_DRAW_PHASE: { count: number };
  // OPT-366: pre-game flow events
  PREGAME_PRIORITY_ROLLED: { rolls: [number, number]; priorityDeciderIndex: 0 | 1 };
  PREGAME_FIRST_PLAYER_DECIDED: { firstPlayerIndex: 0 | 1 };
  MULLIGAN_DECISION: { redrew: boolean };
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
    /**
     * OPT-173: set true after `scanEventsForTriggers` has matched this event
     * against the trigger registry. Subsequent scans skip it so a triggered
     * effect's inner multi-target drain (which scans its own per-frame events
     * via `pendingBatchTriggers`) does not double-fire when the outer pipeline
     * re-scans the same events at the LIFO trigger-queue boundary.
     */
    __scannedForTriggers?: boolean;
    /**
     * The event is already present in GameState.eventLog but still needs its
     * trigger-matching pass. Used when an event must be published before a
     * prompt while its auto effects wait for the current effect stack.
     */
    __alreadyEmitted?: boolean;
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
  | "AWAITING_TRIGGER_ORDER_SELECTION"
  // OPT-172: multi-target action paused mid-batch so a triggered effect from
  // frame N can fully resolve before frame N+1 begins (rule 6-2). Frame carries
  // a BatchResumeMarker identifying which action to re-invoke and with what
  // remaining-batch state once pendingTriggers drain.
  | "AWAITING_BATCH_RESUME";

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
  /** Result of the action that paused before this continuation. */
  priorActionSucceeded?: boolean;
  /** Outer replacement batch to continue after a nested substitute prompt. */
  replacementBatchContinuation?: unknown;

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
  /** Server-generated identity for this exact prompt instance. */
  promptId?: string;
  options: PromptOptions;
  respondingPlayer: 0 | 1;
  resumeContext: unknown; // cast to ResumeContext in worker
}

// ─── Pre-game state (OPT-366) ────────────────────────────────────────────────

/**
 * OPT-366: pre-game state machine state, surfaced on GameState so clients
 * render the priority-roll / first-or-second / mulligan overlays.
 *
 *   PRIORITY_ROLLING → PRIORITY_CHOICE → START_OF_GAME_FX → HAND_DEAL
 *   → MULLIGAN_DECISIONS → LIFE_PLACEMENT → DONE
 *
 * `pregame` is non-null only during the pre-game flow. Once DONE drains into
 * the first player's REFRESH/DRAW/DON/MAIN auto-phases, it is set to null
 * and the rest of the game proceeds normally.
 */
export type PregamePhase =
  | "PRIORITY_ROLLING"
  | "PRIORITY_CHOICE"
  | "START_OF_GAME_FX"
  | "HAND_DEAL"
  | "MULLIGAN_DECISIONS"
  | "LIFE_PLACEMENT"
  | "DONE";

export interface PregameState {
  phase: PregamePhase;
  /** Final two d6 values from the (last, non-tied) priority roll. */
  priorityRolls: [number, number] | null;
  /** Player index that won the priority roll (will choose first/second). */
  priorityDeciderIndex: 0 | 1 | null;
  /** Player index who will go first this game (set after PRIORITY_CHOICE). */
  firstPlayerIndex: 0 | 1 | null;
  /** Per-player mulligan decision. null = pending, true = redrew, false = kept. */
  mulliganDecisions: [boolean | null, boolean | null];
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  id: string;
  players: [PlayerState, PlayerState];
  turn: TurnState;
  // OPT-366: pre-game flow state. null once the game is past §5-2-1-8.
  pregame: PregameState | null;
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
  | { type: "REVEAL_TRIGGER"; reveal: boolean; promptId?: string }  // true = reveal and activate, false = add to hand
  | { type: "ARRANGE_TOP_CARDS"; keptCardInstanceId: string; keptCardInstanceIds?: string[]; orderedInstanceIds: string[]; destination: "top" | "bottom"; promptId?: string }
  | { type: "SELECT_TARGET"; selectedInstanceIds: string[]; promptId?: string }
  | {
      type: "REDISTRIBUTE_DON";
      transfers: Array<{
        fromCardInstanceId: string;
        donInstanceId: string;
        toCardInstanceId: string;
      }>;
      promptId?: string;
    }
  | { type: "PLAYER_CHOICE"; choiceId: string; promptId?: string }
  | { type: "PASS"; promptId?: string }
  | { type: "CONCEDE" }
  | { type: "MANUAL_EFFECT"; description: string }
  | { type: "UNDO" };

// ─── WebSocket messages ───────────────────────────────────────────────────────

// Server → Client
export type ServerMessage =
  | { type: "game:state"; state: GameState; canUndo?: boolean }
  | { type: "game:update"; action: GameAction; state: GameState; canUndo?: boolean }
  | { type: "game:prompt"; promptId?: string; options: PromptOptions }
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
  /** How many cards may be kept/picked ("play up to N"). Defaults to 1. */
  maxKeep?: number;
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
  source?: "PREGAME" | "EFFECT";
  donReturn?: {
    count: number;
    sources: Array<{
      id: string;
      label: string;
      max: number;
      kind: "COST_ACTIVE" | "COST_RESTED" | "ATTACHED";
    }>;
  };
}

export interface OptionalEffectPrompt {
  promptType: "OPTIONAL_EFFECT";
  effectDescription: string;
  cards?: CardInstance[];
}
