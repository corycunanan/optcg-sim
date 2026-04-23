import type { CardData, CardDb, CardInstance } from "@shared/game-types";

/**
 * `<Card>` primitive — unified public surface for all game card rendering.
 *
 * Zones/consumers compose this primitive; dnd-kit + zone registration stay in
 * consumer wrappers (field-card, hand-layer, etc.) so the primitive doesn't
 * couple to any particular drag/drop contract.
 */

export type CardVariant =
  | "field"  // board character / leader slot
  | "hand"   // card in a hand row
  | "modal"  // modal/dialog card (target picker, trash preview, arrange)
  | "life"   // life zone (face-down or revealed)
  | "trash"  // trash preview
  | "don";   // DON!! token in the cost area (custom art, no card data)

/**
 * Interaction + lifecycle state. Drives motion preset + visual treatment.
 *
 * `rest` = game-RESTED (rotated 90°, dimmed).
 * `active` = game-ACTIVE / default idle (upright, bright).
 * Remaining states layer on top for selection + drag/drop feedback.
 */
export type CardState =
  | "rest"
  | "active"
  | "selected"
  | "invalid"
  | "dragging"
  | "in-flight";

export type CardSize = "field" | "hand" | "modal" | "preview" | "don";

export type HighlightRingColor = "selected" | "valid" | "invalid";

export interface CardOverlays {
  /** +N DON badge (attached DON counter) — rendered along the bottom edge. */
  donCount?: number;
  /** Count badge (trash count, life count, deck size) — top-right corner. */
  countBadge?: number;
  /** Highlight ring color — selection / valid / invalid target feedback. */
  highlightRing?: HighlightRingColor;
  /** Optional label rendered on empty/face-down placeholders. */
  label?: string;
}

export interface CardInteraction {
  /** Makes the card respond to onClick + gives it a pointer cursor. */
  clickable?: boolean;
  /** Suppress the hover tooltip (e.g. during drag). */
  tooltipDisabled?: boolean;
}

export interface CardDataProp {
  card?: CardInstance | null;
  cardId?: string;
  cardDb: CardDb;
}

export interface CardProps {
  /**
   * Card data source. Optional so DON tokens (variant="don") can render
   * through `artUrl` without a cardDb lookup.
   */
  data?: CardDataProp;
  variant: CardVariant;
  state?: CardState;
  size?: CardSize;
  /** Flip to the back face (animated via 3D rotateY). */
  faceDown?: boolean;
  sleeveUrl?: string | null;
  /**
   * Direct image URL override for the front face — used by DON tokens
   * whose art isn't sourced from the card database. When set, suppresses
   * the tooltip (no card data to show).
   */
  artUrl?: string;
  interaction?: CardInteraction;
  overlays?: CardOverlays;
  /** Empty-slot placeholder (e.g. empty life zone) — takes precedence over data. */
  empty?: boolean;
  emptyLabel?: string;
  /**
   * Optional delay (seconds) merged into the state transition, for staggered
   * board updates (e.g. refresh-wave ripple across a character row).
   */
  motionDelay?: number;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export type ResolvedCardData = {
  cardId: string | undefined;
  data: CardData | null;
};
