import type { CardData } from "./game-types.js";

/** Game modes serialized from the Next.js app to the game worker. */
export type LobbyMode = "PVP" | "SOLITAIRE" | "PVCOMPUTER";

/** Host-selected pre-game flows serialized from the app to the game worker. */
export type PregameMode =
  | "PRIORITY_ROLL"
  | "HOST_FIRST"
  | "GUEST_FIRST"
  | "RANDOM_FIXED"
  | "SIDE_A_FIRST"
  | "SIDE_B_FIRST"
  | "SOLITAIRE_RANDOM";

type ActiveLobbyMode = Exclude<LobbyMode, "PVCOMPUTER">;

const PVP_PREGAME_MODES: readonly PregameMode[] = [
  "PRIORITY_ROLL",
  "HOST_FIRST",
  "GUEST_FIRST",
  "RANDOM_FIXED",
];

const SOLITAIRE_PREGAME_MODES: readonly PregameMode[] = [
  "SIDE_A_FIRST",
  "SIDE_B_FIRST",
  "SOLITAIRE_RANDOM",
];

/**
 * Resolve a pre-game mode at a server boundary.
 *
 * Stored or omitted values are rollout input and normalize to the target
 * lobby's default. Explicit cross-mode input is rejected, except for the
 * legacy Solitaire + PRIORITY_ROLL pairing, whose closest meaning is a
 * private server-side selection with no roll ceremony.
 */
export function resolvePregameMode(
  mode: ActiveLobbyMode,
  pregameMode: PregameMode | undefined,
  explicit: boolean
): PregameMode | null {
  if (mode === "PVP") {
    if (pregameMode === undefined) return "PRIORITY_ROLL";
    if (PVP_PREGAME_MODES.includes(pregameMode)) return pregameMode;
    return explicit ? null : "PRIORITY_ROLL";
  }

  if (pregameMode === undefined || pregameMode === "PRIORITY_ROLL") {
    return "SOLITAIRE_RANDOM";
  }
  if (SOLITAIRE_PREGAME_MODES.includes(pregameMode)) return pregameMode;
  return explicit ? null : "SOLITAIRE_RANDOM";
}

export interface DeckCardData<TCardData = CardData> {
  cardId: string;
  quantity: number;
  cardData: TCardData;
}

export interface PlayerInitData<TCardData = CardData> {
  userId: string;
  deck: DeckCardData<TCardData>[];
  leader: DeckCardData<TCardData>;
  sleeveUrl?: string | null;
  donArtUrl?: string | null;
  /** Fixed card order for testing: life and hand card assignments. */
  testOrder?: { life: string[]; hand: string[] } | null;
}

/** Wire payload serialized by Next.js and validated by the game worker. */
export interface GameInitPayload<TCardData = CardData> {
  gameId: string;
  player1: PlayerInitData<TCardData>;
  player2: PlayerInitData<TCardData>;
  format: string;
  mode: LobbyMode;
  pregameMode: PregameMode;
  /**
   * Deterministic d6 sequence for the pregame priority roll. Test-only.
   * Each roll consumes two values and ties consume another pair.
   */
  testPriorityRolls?: number[] | null;
}
