import type { CardData } from "./game-types.js";

/** Game modes serialized from the Next.js app to the game worker. */
export type LobbyMode = "PVP" | "SOLITAIRE" | "PVCOMPUTER";

/** Host-selected pre-game flows serialized from the app to the game worker. */
export type PregameMode =
  | "PRIORITY_ROLL"
  | "HOST_FIRST"
  | "GUEST_FIRST"
  | "RANDOM_FIXED";

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
