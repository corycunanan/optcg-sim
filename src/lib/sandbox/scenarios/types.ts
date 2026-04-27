// Declarative scenario authoring contract for the Animation Sandbox.
//
// A scenario describes an initial board state and either a script of GameEvents
// (scripted mode) or a free-play playground (playground mode) that runs through
// the production BoardLayout. Scripted scenarios use the sandbox session
// provider (OPT-286) + runner (OPT-289) and bypass the engine. Playground
// scenarios use the engine-driven session adapter (OPT-305) so user actions
// flow through the real `runPipeline`.

import type {
  CardInstance,
  DonInstance,
  GameAction,
  GameEvent,
  LifeCard,
  PromptOptions,
  TurnState,
} from "@shared/game-types";

export type ScenarioCategory =
  | "playground"
  | "draws"
  | "movement"
  | "combat"
  | "ko"
  | "life"
  | "effects"
  | "prompts"
  | "phase";

export type ScenarioMode = "scripted" | "playground";

// Subset of PlayerState that scenarios author. Mirrors the slice BoardLayout
// reads from `me`/`opp` in board-layout.tsx; the sandbox provider hydrates
// this into a full PlayerState before passing it through.
export interface PartialPlayerState {
  playerId: string;
  leader: CardInstance;
  characters: (CardInstance | null)[];
  stage: CardInstance | null;
  hand: CardInstance[];
  deck: CardInstance[];
  trash: CardInstance[];
  life: LifeCard[];
  donCostArea: DonInstance[];
  donDeck: DonInstance[];
  sleeveUrl?: string | null;
  donArtUrl?: string | null;
}

// Subset of GameState scenarios author. The provider fills the remaining
// engine-only fields (effectStack, triggerRegistry, etc.) with empty stubs.
export interface PartialGameState {
  players: [PartialPlayerState, PartialPlayerState];
  turn: TurnState;
  myIndex: 0 | 1;
}

export type ScenarioStep =
  | { type: "event"; event: GameEvent; delayMs?: number }
  | { type: "wait"; ms: number }
  | { type: "prompt"; prompt: PromptOptions }
  | { type: "checkpoint"; label: string };

export interface ExpectedResponse {
  // Narrowed to GameAction's literal type union so scenarios can't typo
  // an action name. RESPOND_TO_PROMPT-style placeholders from the spec
  // map onto concrete action types like SELECT_TARGET / PLAYER_CHOICE /
  // REVEAL_TRIGGER / ARRANGE_TOP_CARDS / REDISTRIBUTE_DON.
  allowedActionTypes: GameAction["type"][];
  predicate: (action: GameAction) => boolean;
  hint?: string;
}

export interface Scenario {
  id: string;
  title: string;
  category: ScenarioCategory;
  description: string;
  initialState: PartialGameState;
  cardsUsed: string[];
  // Scripted scenarios fold a `script` of events through `applyEvent`.
  // Playground scenarios drive the engine directly — `script` and
  // `expectedResponse` are ignored. Default is "scripted" so the 21
  // existing scenarios remain unchanged.
  mode?: ScenarioMode;
  script?: ScenarioStep[];
  inputMode: "spectator" | "interactive";
  expectedResponse?: ExpectedResponse;
}
