/**
 * OPT-475 machine-checked closure inventory.
 *
 * These cards were the complete conditional-reveal cohort after reconciling
 * the stale 19-card audit count with OP08-049's missing placement choice.
 */
export const CONDITIONAL_REVEAL_CARD_IDS = [
  "OP07-048",
  "OP08-049",
  "OP11-066",
  "OP11-071",
  "OP11-073",
  "OP11-074",
  "OP11-079",
  "OP11-081",
  "OP12-058",
  "OP14-044",
  "OP15-065",
  "ST13-007",
  "ST13-010",
  "ST13-014",
  "ST17-001",
  "ST22-003",
  "ST22-006",
  "ST22-007",
  "ST22-012",
  "ST22-016",
] as const;

export type ConditionalRevealCardId = typeof CONDITIONAL_REVEAL_CARD_IDS[number];

export const CHOSEN_COST_REVEAL_CARD_IDS = [
  "OP11-066",
  "OP11-071",
  "OP11-073",
  "OP11-074",
  "OP11-079",
  "OP11-081",
] as const satisfies readonly ConditionalRevealCardId[];
