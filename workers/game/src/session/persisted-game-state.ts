import { z } from "zod";
import type { GameEventType } from "../types.js";

const PlayerIndex = z.union([z.literal(0), z.literal(1)]);
const FiniteNumber = z.number().finite();
const NonNegativeInteger = z.number().int().nonnegative();
const NullableString = z.string().nullable();
const StringArray = z.array(z.string());

const DonInstance = z.strictObject({
  instanceId: z.string(),
  state: z.enum(["ACTIVE", "RESTED"]),
  attachedTo: NullableString,
});

const CardInstance = z.strictObject({
  instanceId: z.string(),
  cardId: z.string(),
  zone: z.enum([
    "LEADER",
    "CHARACTER",
    "STAGE",
    "COST_AREA",
    "HAND",
    "DECK",
    "TRASH",
    "LIFE",
    "DON_DECK",
    "REMOVED_FROM_GAME",
  ]),
  state: z.enum(["ACTIVE", "RESTED"]),
  attachedDon: z.array(DonInstance),
  turnPlayed: z.number().int().nullable(),
  controller: PlayerIndex,
  owner: PlayerIndex,
});

const LifeCard = z.strictObject({
  instanceId: z.string(),
  cardId: z.string(),
  face: z.enum(["UP", "DOWN"]),
});

const PlayerState = z.strictObject({
  playerId: z.string(),
  leader: CardInstance,
  characters: z.tuple([
    CardInstance.nullable(),
    CardInstance.nullable(),
    CardInstance.nullable(),
    CardInstance.nullable(),
    CardInstance.nullable(),
  ]),
  stage: CardInstance.nullable(),
  donCostArea: z.array(DonInstance),
  hand: z.array(CardInstance),
  deck: z.array(CardInstance),
  trash: z.array(CardInstance),
  donDeck: z.array(DonInstance),
  life: z.array(LifeCard),
  removedFromGame: z.array(CardInstance),
  deckList: z.array(
    z.strictObject({ cardId: z.string(), count: NonNegativeInteger })
  ),
  connected: z.boolean(),
  awayReason: z.enum(["LEFT", "DISCONNECTED"]).nullable(),
  rejoinDeadlineAt: FiniteNumber.nullable(),
  sleeveUrl: NullableString,
  donArtUrl: NullableString,
});

const BattleContext = z.strictObject({
  battleId: z.string(),
  attackerInstanceId: z.string(),
  targetInstanceId: z.string(),
  attackerPower: FiniteNumber,
  defenderPower: FiniteNumber,
  counterPowerAdded: FiniteNumber,
  blockerActivated: z.boolean(),
  damagesRemaining: NonNegativeInteger.optional(),
  pendingTriggerLifeCard: LifeCard.optional(),
});

const PerformedAction = z.strictObject({
  actionType: z.string(),
  timestamp: FiniteNumber,
  controller: PlayerIndex.optional(),
  cardId: z.string().optional(),
  cardType: z.string().optional(),
  baseCost: FiniteNumber.optional(),
  attackerInstanceId: z.string().optional(),
  targetType: z.enum(["LEADER", "CHARACTER"]).optional(),
  targetController: PlayerIndex.optional(),
});

const TurnState = z.strictObject({
  number: NonNegativeInteger,
  activePlayerIndex: PlayerIndex,
  firstPlayerIndex: PlayerIndex.optional(),
  phase: z.enum(["REFRESH", "DRAW", "DON", "MAIN", "END"]),
  battleSubPhase: z
    .enum([
      "ATTACK_STEP",
      "BLOCK_STEP",
      "COUNTER_STEP",
      "DAMAGE_STEP",
      "END_OF_BATTLE",
    ])
    .nullable(),
  battle: BattleContext.nullable(),
  oncePerTurnUsed: z.record(z.string(), StringArray),
  actionsPerformedThisTurn: z.array(PerformedAction),
  extraTurnsPending: NonNegativeInteger.optional(),
  pendingTriggerFromEffect: z
    .strictObject({
      lifeCard: LifeCard,
      damagedPlayerIndex: PlayerIndex,
      remainingDamages: NonNegativeInteger,
      sourceCardInstanceId: z.string(),
      controllerIndex: PlayerIndex,
    })
    .nullable()
    .optional(),
  pendingBattleDamageContinuation: z
    .strictObject({
      battleId: z.string(),
      lifeCardInstanceId: z.string(),
      damagedPlayerIndex: PlayerIndex,
      stage: z.enum(["LIFE_REMOVAL", "DAMAGE"]),
    })
    .nullable()
    .optional(),
  deckHitZeroThisTurn: z.tuple([z.boolean(), z.boolean()]),
  triggerStagingInstanceIds: StringArray.optional(),
});

const PromptOptions = z.discriminatedUnion("promptType", [
  z.strictObject({
    promptType: z.literal("SELECT_BLOCKER"),
    validTargets: StringArray,
    optional: z.boolean(),
    timeoutMs: FiniteNumber,
  }),
  z.strictObject({
    promptType: z.literal("REVEAL_TRIGGER"),
    cards: z.array(CardInstance),
    effectDescription: z.string(),
    optional: z.boolean(),
    timeoutMs: FiniteNumber,
  }),
  z.strictObject({
    promptType: z.literal("ARRANGE_TOP_CARDS"),
    cards: z.array(CardInstance),
    effectDescription: z.string(),
    canSendToBottom: z.boolean(),
    validTargets: StringArray.optional(),
    restDestination: z.string().optional(),
    maxKeep: NonNegativeInteger.optional(),
  }),
  z.strictObject({
    promptType: z.literal("SELECT_TARGET"),
    cards: z.array(CardInstance),
    validTargets: StringArray,
    effectDescription: z.string(),
    countMin: NonNegativeInteger,
    countMax: NonNegativeInteger,
    ctaLabel: z.string(),
    blindSelection: z.boolean().optional(),
    aggregateConstraint: z
      .strictObject({
        property: z.enum(["power", "cost"]),
        operator: z.enum(["<=", ">=", "=="]),
        value: FiniteNumber,
      })
      .optional(),
    uniquenessConstraint: z
      .strictObject({ field: z.enum(["name", "color"]) })
      .optional(),
    namedDistribution: z.strictObject({ names: StringArray }).optional(),
    dualTargets: z
      .strictObject({
        slots: z.array(
          z.strictObject({
            validIds: StringArray,
            countMin: NonNegativeInteger,
            countMax: NonNegativeInteger,
          })
        ),
      })
      .optional(),
  }),
  z.strictObject({
    promptType: z.literal("REDISTRIBUTE_DON"),
    validSourceCardIds: StringArray,
    validTargetCardIds: StringArray,
    maxTransfers: NonNegativeInteger,
    effectDescription: z.string(),
  }),
  z.strictObject({
    promptType: z.literal("PLAYER_CHOICE"),
    choices: z.array(z.strictObject({ id: z.string(), label: z.string() })),
    effectDescription: z.string(),
    source: z.enum(["PREGAME", "EFFECT"]).optional(),
    donReturn: z
      .strictObject({
        count: NonNegativeInteger,
        sources: z.array(
          z.strictObject({
            id: z.string(),
            label: z.string(),
            max: NonNegativeInteger,
            kind: z.enum(["COST_ACTIVE", "COST_RESTED", "ATTACHED"]),
          })
        ),
      })
      .optional(),
  }),
  z.strictObject({
    promptType: z.literal("OPTIONAL_EFFECT"),
    effectDescription: z.string(),
    cards: z.array(CardInstance).optional(),
  }),
]);

const PendingPrompt = z.strictObject({
  promptId: z.string().optional(),
  options: PromptOptions,
  respondingPlayer: PlayerIndex,
  resumeContext: z.unknown(),
});

const ExecutionContext = z.strictObject({
  version: z.literal(1),
  seed: z.string(),
  rngState: FiniteNumber,
  idCounter: NonNegativeInteger,
  clockEpochMs: FiniteNumber,
  clockCounter: NonNegativeInteger,
  actionBudget: z.strictObject({
    limit: NonNegativeInteger,
    consumed: NonNegativeInteger,
  }),
  trace: z.strictObject({ gameId: z.string(), traceId: z.string() }),
});

const PregameState = z.strictObject({
  phase: z.enum([
    "PRIORITY_ROLLING",
    "PRIORITY_CHOICE",
    "START_OF_GAME_FX",
    "HAND_DEAL",
    "MULLIGAN_DECISIONS",
    "LIFE_PLACEMENT",
    "DONE",
  ]),
  priorityRolls: z.tuple([FiniteNumber, FiniteNumber]).nullable(),
  priorityDeciderIndex: PlayerIndex.nullable(),
  firstPlayerIndex: PlayerIndex.nullable(),
  mulliganDecisions: z.tuple([z.boolean().nullable(), z.boolean().nullable()]),
  startOfGameEffectsResolved: z.tuple([z.boolean(), z.boolean()]),
});

const StackFrameCore = z.strictObject({
  id: z.string(),
  sourceCardInstanceId: z.string(),
  controller: PlayerIndex,
  remainingActionsController: PlayerIndex.optional(),
  effectBlock: z.unknown(),
  phase: z.enum([
    "AWAITING_OPTIONAL_RESPONSE",
    "AWAITING_COST_SELECTION",
    "AWAITING_TARGET_SELECTION",
    "AWAITING_ARRANGE_CARDS",
    "AWAITING_PLAYER_CHOICE",
    "INTERRUPTED_BY_TRIGGERS",
    "AWAITING_TRIGGER_ORDER_SELECTION",
    "AWAITING_BATCH_RESUME",
  ]),
  pausedAction: z.unknown().nullable(),
  remainingActions: z.array(z.unknown()),
  resultRefs: z.array(z.tuple([z.string(), z.unknown()])),
  validTargets: StringArray,
  priorActionSucceeded: z.boolean().optional(),
  simultaneousGroup: z.unknown().optional(),
  replacementBatchContinuation: z.unknown().optional(),
  costs: z.array(z.unknown()),
  currentCostIndex: NonNegativeInteger,
  costsPaid: z.boolean(),
  oncePerTurnMarked: z.boolean(),
  costResultRefs: z.array(
    z.tuple([
      z.string(),
      z.strictObject({ targetInstanceIds: StringArray, count: FiniteNumber }),
    ])
  ),
  costReplacementAction: z.unknown().optional(),
  costReplacementChecked: z.boolean().optional(),
  pendingTriggers: z.array(z.unknown()),
  simultaneousTriggers: z.array(z.unknown()),
  accumulatedEvents: z.array(z.unknown()),
  ruleTrashForPlay: z.unknown().optional(),
  stateDistributionForPlay: z.unknown().optional(),
  batchResumeMarker: z.unknown().optional(),
  costArrangeStage: z.boolean().optional(),
});

const PersistedGameStateV2 = z.strictObject({
  id: z.string(),
  executionContext: ExecutionContext,
  players: z.tuple([PlayerState, PlayerState]),
  turn: TurnState,
  pregame: PregameState.nullable(),
  activeEffects: z.array(z.unknown()),
  prohibitions: z.array(z.unknown()),
  scheduledActions: z.array(z.unknown()),
  oneTimeModifiers: z.array(z.unknown()),
  triggerRegistry: z.array(z.unknown()),
  pendingPrompt: PendingPrompt.nullable(),
  promptRespondingPlayer: PlayerIndex.nullable().optional(),
  effectStack: z.array(StackFrameCore),
  eventLog: z.array(z.unknown()),
  status: z.enum(["IN_PROGRESS", "FINISHED", "ABANDONED"]),
  winner: PlayerIndex.nullable(),
  winReason: NullableString,
  engineOutcome: z.unknown().nullable().optional(),
  engineActionCount: NonNegativeInteger.optional(),
});

const CardRef = z.strictObject({ instanceId: z.string(), cardId: z.string() });
const EmptyPayload = z.strictObject({});
const EventPayloadSchemas = {
  PHASE_CHANGED: z.strictObject({ from: z.string(), to: z.string() }),
  TURN_STARTED: EmptyPayload,
  TURN_ENDED: EmptyPayload,
  CARD_PLAYED: z.strictObject({
    cardId: z.string(),
    cardInstanceId: z.string(),
    zone: z.string(),
    source: z.string(),
    playedRested: z.boolean().optional(),
    sourceZone: z.string().optional(),
  }),
  CARD_KO: z.strictObject({
    cardInstanceId: z.string(),
    newCardInstanceId: z.string().optional(),
    cardId: z.string(),
    cause: z.string(),
    causingController: PlayerIndex.optional(),
    causeCardInstanceId: z.string().optional(),
    preKO_donCount: FiniteNumber,
  }),
  CARD_DRAWN: z.strictObject({
    cardId: z.string(),
    cardInstanceId: z.string().optional(),
    source: z.string().optional(),
  }),
  CARD_TRASHED: z.strictObject({
    cardId: z.string().optional(),
    cardInstanceId: z.string().optional(),
    newCardInstanceId: z.string().optional(),
    count: FiniteNumber.optional(),
    reason: z.string(),
    from: z.string().optional(),
  }),
  CARD_RETURNED_TO_HAND: z.strictObject({
    cardInstanceId: z.string(),
    newCardInstanceId: z.string().optional(),
    cardId: z.string(),
    source: z.string().optional(),
  }),
  CARD_ADDED_TO_HAND_FROM_LIFE: z.strictObject({
    cardId: z.string().optional(),
    cardInstanceId: z.string().optional(),
    count: FiniteNumber.optional(),
  }),
  LIFE_CARD_FACE_CHANGED: z.strictObject({ face: z.enum(["UP", "DOWN"]) }),
  ATTACK_DECLARED: z.strictObject({
    attackerInstanceId: z.string(),
    targetInstanceId: z.string(),
    attackerPower: FiniteNumber,
  }),
  ATTACK_TARGET_FINAL: z.strictObject({
    attackerInstanceId: z.string(),
    targetInstanceId: z.string(),
    redirected: z.boolean(),
  }),
  BLOCK_DECLARED: z.strictObject({ blockerInstanceId: z.string() }),
  COUNTER_USED: z.strictObject({
    cardId: z.string(),
    counterValue: FiniteNumber.optional(),
    counterTargetInstanceId: z.string().optional(),
    cardInstanceId: z.string().optional(),
    type: z.string().optional(),
  }),
  BATTLE_RESOLVED: EmptyPayload,
  DAMAGE_DEALT: z.strictObject({
    amount: FiniteNumber,
    attackerInstanceId: z.string(),
    attackerType: z.string(),
    target: z.string().optional(),
    lethal: z.boolean().optional(),
  }),
  TRIGGER_ACTIVATED: z.strictObject({
    cardId: z.string(),
    activated: z.boolean().optional(),
  }),
  DON_GIVEN_TO_CARD: z.strictObject({
    targetInstanceId: z.string().optional(),
    count: FiniteNumber,
  }),
  DON_DETACHED: z.strictObject({ count: FiniteNumber.optional() }),
  DON_PLACED_ON_FIELD: z.strictObject({ count: FiniteNumber }),
  DON_STATE_CHANGED: EmptyPayload,
  CARD_STATE_CHANGED: z.strictObject({
    cardInstanceId: z.string().optional(),
    targetInstanceId: z.string().optional(),
    newState: z.string().optional(),
    error: z.string().optional(),
  }),
  POWER_MODIFIED: z.strictObject({
    targetInstanceId: z.string(),
    amount: FiniteNumber.optional(),
    value: FiniteNumber.optional(),
  }),
  GAME_OVER: z.strictObject({
    winner: PlayerIndex.nullable().optional(),
    reason: z.string(),
    diagnostic: z.unknown().optional(),
  }),
  CARD_RETURNED_TO_DECK: z.strictObject({
    cardInstanceId: z.string(),
    newCardInstanceId: z.string().optional(),
    cardId: z.string().optional(),
    position: z.string().optional(),
  }),
  DON_SET_ACTIVE: z.strictObject({ count: FiniteNumber }),
  DON_RESTED: z.strictObject({ count: FiniteNumber }),
  CARDS_REVEALED: z.strictObject({
    cards: z.array(CardRef),
    source: z.string().optional(),
    visibility: z.enum(["BOTH", "CONTROLLER_ONLY"]),
    visibleTo: PlayerIndex.optional(),
  }),
  EFFECTS_NEGATED: z.strictObject({ targetInstanceIds: StringArray }),
  LIFE_CARD_TO_DECK: z.strictObject({ count: FiniteNumber }),
  LIFE_SCRIED: z.strictObject({ cards: z.array(CardRef), count: FiniteNumber }),
  LIFE_REORDERED: z.strictObject({ orderedInstanceIds: StringArray }),
  ATTACK_REDIRECTED: z.strictObject({ newTargetInstanceId: z.string() }),
  CARD_REMOVED_FROM_LIFE: z.strictObject({
    cardInstanceId: z.string(),
    newCardInstanceId: z.string().optional(),
  }),
  EXTRA_TURN_GRANTED: EmptyPayload,
  EVENT_ACTIVATED_FROM_HAND: z.strictObject({
    cardId: z.string().optional(),
    cardInstanceId: z.string(),
    costReducedAmount: FiniteNumber.optional(),
  }),
  EVENT_MAIN_RESOLVED_FROM_TRASH: z.strictObject({
    cardId: z.string().optional(),
    cardInstanceId: z.string(),
  }),
  EVENT_TRIGGER_RESOLVED: z.strictObject({
    cardId: z.string().optional(),
    cardInstanceId: z.string(),
  }),
  LIFE_CARD_TURNED_FACE_UP: z.strictObject({ count: FiniteNumber }),
  LIFE_CARD_TURNED_FACE_DOWN: z.strictObject({ count: FiniteNumber }),
  COMBAT_VICTORY: z.strictObject({
    cardInstanceId: z.string(),
    targetInstanceId: z.string(),
  }),
  CHARACTER_BATTLES: z.strictObject({
    cardInstanceId: z.string(),
    targetInstanceId: z.string(),
  }),
  END_OF_BATTLE: z.strictObject({
    attackerInstanceId: z.string(),
    targetInstanceId: z.string(),
    aborted: z.boolean(),
  }),
  BATTLE_ABORTED: z.strictObject({
    attackerInstanceId: z.string(),
    targetInstanceId: z.string(),
    reason: z.enum(["ATTACKER_LEFT_FIELD", "TARGET_LEFT_FIELD"]),
  }),
  LIFE_COUNT_BECOMES_ZERO: EmptyPayload,
  DRAW_OUTSIDE_DRAW_PHASE: z.strictObject({ count: FiniteNumber }),
  PREGAME_PRIORITY_ROLLED: z.strictObject({
    rolls: z.tuple([FiniteNumber, FiniteNumber]),
    priorityDeciderIndex: PlayerIndex,
  }),
  PREGAME_FIRST_PLAYER_DECIDED: z.strictObject({
    firstPlayerIndex: PlayerIndex,
  }),
  MULLIGAN_DECISION: z.strictObject({ redrew: z.boolean() }),
} satisfies Record<GameEventType, z.ZodType>;

export function validatePersistedGameStateCore(raw: unknown): string | null {
  const result = PersistedGameStateV2.safeParse(raw);
  if (result.success) return null;
  const issue = result.error.issues[0];
  return `${issue.path.join(".") || "state"}: ${issue.message}`;
}

export function hasValidEventPayload(
  type: GameEventType,
  payload: unknown
): boolean {
  return EventPayloadSchemas[type].safeParse(payload).success;
}
