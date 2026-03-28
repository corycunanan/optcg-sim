/**
 * PRB01 Effect Schemas
 *
 * Red (Sanji): PRB01-001
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Sanji (PRB01-001)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PRB01-001 Sanji (Leader) — Activate:Main grant Rush
// [Activate: Main] [Once Per Turn] Up to 1 of your Characters without an [On Play]
// effect and with a cost of 8 or less gains [Rush] during this turn.
// (This card can attack on the turn in which it is played.)

export const PRB01_001_SANJI: EffectSchema = {
  card_id: "PRB01-001",
  card_name: "Sanji",
  card_type: "Leader",
  effects: [
    {
      id: "activate_rush_grant",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              lacks_effect_type: "ON_PLAY",
              cost_max: 8,
            },
          },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const PRB01_SCHEMAS: Record<string, EffectSchema> = {
  "PRB01-001": PRB01_001_SANJI,
};
