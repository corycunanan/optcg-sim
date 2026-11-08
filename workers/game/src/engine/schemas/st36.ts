/**
 * ST36 Effect Schemas — STARTER DECK -YELLOW Eustass"Captain"Kid- [ST-36]
 *
 * New IDs ST36-001..005. Reprints are authored in their origin sets.
 * Rulings: docs/FAQs/qa_st-36.md.
 */
import type { Cost, EffectSchema } from "../effect-types.js";

/** "Turn 1 card from the top or bottom of your Life cards face-<face>". */
function turnTopOrBottomLife(type: "TURN_LIFE_FACE_UP" | "TURN_LIFE_FACE_DOWN"): Cost {
  return {
    type: "CHOICE",
    labels: ["Top Life card", "Bottom Life card"],
    options: [
      [{ type, amount: 1, position: "TOP" }],
      [{ type, amount: 1, position: "BOTTOM" }],
    ],
  };
}

// ─── ST36-001 Cavendish (Character) ────────────────────────────────────────

export const ST36_001_CAVENDISH: EffectSchema = {
  card_id: "ST36-001",
  card_name: "Cavendish",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_trash_add_life",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN", up_to: true },
        },
      ],
    },
  ],
};

// ─── ST36-002 Killer (Character) ───────────────────────────────────────────

export const ST36_002_KILLER: EffectSchema = {
  card_id: "ST36-002",
  card_name: "Killer",
  card_type: "Character",
  effects: [
    {
      // FAQ: [Your Turn] — the [On Play] does not activate on the opponent's turn.
      id: "your_turn_on_play_add_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Kid Pirates" },
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN", up_to: true },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: { type: "LIFE_COUNT", controller: "OPPONENT", operator: "<=", value: 3 },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── ST36-003 Scratchmen Apoo (Character) ──────────────────────────────────

export const ST36_003_SCRATCHMEN_APOO: EffectSchema = {
  card_id: "ST36-003",
  card_name: "Scratchmen Apoo",
  card_type: "Character",
  effects: [
    {
      // FAQ: the draw resolves even when the Leader is not {Supernovas}.
      id: "trigger_draw_set_leader_base_power",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "SET_BASE_POWER",
          chain: "THEN",
          target: { type: "YOUR_LEADER", filter: { traits: ["Supernovas"] } },
          params: { value: 7000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST36-004 Bartolomeo (Character) ───────────────────────────────────────

export const ST36_004_BARTOLOMEO: EffectSchema = {
  card_id: "ST36-004",
  card_name: "Bartolomeo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_supernovas_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Supernovas"] } }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
  ],
};

// ─── ST36-005 Eustass"Captain"Kid (Character) ──────────────────────────────

export const ST36_005_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "ST36-005",
  card_name: "Eustass\"Captain\"Kid",
  card_type: "Character",
  effects: [
    {
      // FAQ: unusable when both the top and bottom Life cards are face-down.
      id: "opponent_attack_redirect_to_kid",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true, optional: true },
      costs: [turnTopOrBottomLife("TURN_LIFE_FACE_DOWN")],
      actions: [
        {
          type: "REDIRECT_ATTACK",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { name: "Eustass\"Captain\"Kid", base_power_min: 5000 },
          },
        },
      ],
    },
    {
      // FAQ: unusable when both the top and bottom Life cards are face-up.
      id: "activate_give_don_leader",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [turnTopOrBottomLife("TURN_LIFE_FACE_UP")],
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

export const ST36_SCHEMAS: Record<string, EffectSchema> = {
  "ST36-001": ST36_001_CAVENDISH,
  "ST36-002": ST36_002_KILLER,
  "ST36-003": ST36_003_SCRATCHMEN_APOO,
  "ST36-004": ST36_004_BARTOLOMEO,
  "ST36-005": ST36_005_EUSTASS_CAPTAIN_KID,
};
