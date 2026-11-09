/**
 * Official "cannot be in the same deck" pairs (OPT-1038).
 *
 * Per-card legality lives in `Card.banStatus`, which an admin sets by hand.
 * Pair bans are rare, change only with an official ban-list announcement, and
 * must be available to the client-side deck builder as well as the server-side
 * start gate, so they live here as a version-controlled constant rather than a
 * database table. Update this list (and its test) when a new ban list ships.
 *
 * IDs are base card numbers: alternate-art rows (`_p1`, `_r1`) match their base
 * number. Either card of a pair may be the Leader.
 */
export interface BannedPair {
  cardIds: readonly [string, string];
  /** Ban list effective date (YYYY-MM-DD). */
  effective: string;
}

export const BANNED_PAIRS: readonly BannedPair[] = [
  { cardIds: ["OP07-115", "EB04-058"], effective: "2026-10-12" },
  { cardIds: ["OP11-040", "OP11-067"], effective: "2026-10-12" },
  { cardIds: ["OP11-040", "OP08-069"], effective: "2026-10-12" },
];
