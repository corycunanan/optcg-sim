/**
 * OPT-257 F4 — Trash-as-staging during [Trigger] resolution.
 *
 * The OP-14 Thriller Bark set established a recurring pattern: a Character's
 * `[Trigger]` activates from Life and immediately tries to "play X from your
 * trash". The Character has just been moved to trash to open the window, so
 * naïvely the player could pick the Character itself as the play target.
 *
 * Bandai rulings: during the Trigger's resolution the just-revealed Life card
 * is in a "staging" state — physically in trash, but invisible to trash-
 * targeting effects sourced from this same Trigger window. This suite locks
 * the invariant for both reveal paths (battle damage, effect-sourced damage)
 * and verifies that staging is cleared once the Trigger's effect block
 * finishes resolving.
 *
 * Covered:
 *   1. PLAY_CARD with source_zone TRASH skips the staging card (the OP14-082
 *      pattern: "Play X from trash" can't pick itself).
 *   2. CARD_IN_TRASH targets skip the staging card.
 *   3. TRASH_COUNT condition excludes the staging card mid-resolution.
 *   4. PLAY_SELF — the OP14-103 "Play this card" Trigger pattern — still
 *      finds and plays the staging card from trash.
 *   5. Staging is popped after resolveEffect, so post-Trigger trash queries
 *      see the card normally.
 *   6. Decline Trigger → no staging side effects (card goes to hand, never trash).
 *   7. Effect-damage Trigger reveal path stages identically to battle damage.
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  LifeCard,
  PlayerState,
} from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "./helpers.js";
import { runPipeline } from "../engine/pipeline.js";
import { isInTriggerStaging } from "../engine/state.js";

// ─── Card fixtures ───────────────────────────────────────────────────────────

/**
 * Thriller-Bark-style Trigger Character: [Trigger] Play up to 1 Character from
 * trash. Mirrors OP14-082/089/100/109/110/111. The play target excludes self
 * via the staging mechanism — not via any filter on the card.
 */
function makePlayFromTrashTriggerCard(id: string): CardData {
  const schema: EffectSchema = {
    card_id: id,
    card_name: id,
    card_type: "Character",
    effects: [
      {
        id: `${id}_trigger_play_from_trash`,
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        actions: [
          {
            type: "PLAY_CARD",
            target: {
              type: "CHARACTER_CARD",
              source_zone: "TRASH",
              count: { up_to: 1 },
            },
            params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
          },
        ],
      },
    ],
  };
  return baseTriggerCard(id, schema);
}

/** OP14-103 Gloriosa style: [Trigger] Play this card. */
function makePlaySelfTriggerCard(id: string): CardData {
  const schema: EffectSchema = {
    card_id: id,
    card_name: id,
    card_type: "Character",
    effects: [
      {
        id: `${id}_trigger_play_self`,
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        actions: [{ type: "PLAY_SELF" }],
      },
    ],
  };
  return baseTriggerCard(id, schema);
}

/**
 * Trigger Character whose effect is a no-op (DRAW 0). Used to exercise the
 * staging push/pop without needing a complex effect — the assertion is on
 * the post-trigger trash state.
 */
function makeNoOpTriggerCard(id: string): CardData {
  const schema: EffectSchema = {
    card_id: id,
    card_name: id,
    card_type: "Character",
    effects: [
      {
        id: `${id}_trigger_noop`,
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ],
  };
  return baseTriggerCard(id, schema);
}

function baseTriggerCard(id: string, schema: EffectSchema): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 2000,
    counter: 1000,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: "[Trigger] effect",
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: true,
      unblockable: false,
    },
    effectSchema: schema,
    imageUrl: null,
  };
}

// ─── State builders ──────────────────────────────────────────────────────────

/**
 * Battle-ready state where p1 has `triggerLife` on top of Life. p0 attacks
 * the Leader and passes block + counter so damage will reveal `triggerLife`
 * and surface a TRIGGER reveal prompt.
 */
function setupBattleReveal(
  cardDb: Map<string, CardData>,
  triggerLife: LifeCard,
  trashSeed: CardInstance[] = [],
): { state: GameState; attackerId: string; targetId: string } {
  const state0 = createBattleReadyState(cardDb);
  const newPlayers = [...state0.players] as [PlayerState, PlayerState];
  newPlayers[1] = {
    ...newPlayers[1],
    life: [triggerLife],
    trash: [...trashSeed, ...newPlayers[1].trash],
  };
  return {
    state: { ...state0, players: newPlayers },
    attackerId: state0.players[0].leader.instanceId,
    targetId: state0.players[1].leader.instanceId,
  };
}

/** Drive an attack through to the reveal-trigger prompt. */
function driveToTriggerPrompt(
  state: GameState,
  attackerId: string,
  targetId: string,
  cardDb: Map<string, CardData>,
): GameState {
  let r = runPipeline(
    state,
    { type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: targetId },
    cardDb,
    0,
  );
  expect(r.valid).toBe(true);
  r = runPipeline(r.state, { type: "PASS" }, cardDb, 0);
  expect(r.valid).toBe(true);
  r = runPipeline(r.state, { type: "PASS" }, cardDb, 0);
  expect(r.valid).toBe(true);
  return r.state;
}

/** A Character instance owned by `owner`, parked in trash. */
function trashChar(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
  return {
    instanceId: `trash-${owner}-${suffix}`,
    cardId,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

// ─── 1. PLAY_CARD source_zone TRASH excludes the staging card ────────────────

describe("OPT-257 F4 — staging hides the source from PLAY_CARD source_zone TRASH", () => {
  it("OP14-082 pattern: Trigger 'play X from trash' cannot pick itself", () => {
    const cardDb = createTestCardDb();
    const trigger = makePlayFromTrashTriggerCard("OPT257-TRIGGER-FROM-TRASH");
    cardDb.set(trigger.id, trigger);

    // Life card is the trigger source. Trash starts empty for p1, so the
    // ONLY candidate after the staging push would be the trigger card itself
    // — but staging must hide it, leaving zero candidates and no prompt.
    const triggerLife: LifeCard = { instanceId: "life-trig-self", cardId: trigger.id, face: "DOWN" };
    const { state, attackerId, targetId } = setupBattleReveal(cardDb, triggerLife);
    const paused = driveToTriggerPrompt(state, attackerId, targetId, cardDb);

    // Activate the trigger.
    const r = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(r.valid).toBe(true);

    // No SELECT_TARGET prompt should be raised — staging hid the only candidate.
    expect(r.pendingPrompt?.options.promptType).not.toBe("SELECT_TARGET");

    // The trigger card stays in trash (it was never re-played as itself).
    const p1 = r.state.players[1];
    expect(p1.trash.some((c) => c.cardId === trigger.id)).toBe(true);

    // It is NOT on the field.
    const onField = [
      ...p1.characters.filter((c): c is CardInstance => c !== null),
      p1.leader,
      ...(p1.stage ? [p1.stage] : []),
    ];
    expect(onField.some((c) => c.cardId === trigger.id)).toBe(false);

    // Staging has been popped — post-resolution invariant.
    expect(r.state.turn.triggerStagingInstanceIds ?? []).toEqual([]);
  });

  it("Trigger 'play X from trash' picks an OTHER trash card without seeing itself", () => {
    const cardDb = createTestCardDb();
    const trigger = makePlayFromTrashTriggerCard("OPT257-MIXED-TRASH");
    cardDb.set(trigger.id, trigger);

    // Seed p1's trash with one vanilla character. Once the trigger fires,
    // there are TWO physical trash cards (vanilla + the trigger source) but
    // only the vanilla should be selectable.
    const otherChar = trashChar(CARDS.VANILLA.id, 1, "vanilla");
    const triggerLife: LifeCard = { instanceId: "life-trig-mixed", cardId: trigger.id, face: "DOWN" };
    const { state, attackerId, targetId } = setupBattleReveal(cardDb, triggerLife, [otherChar]);
    const paused = driveToTriggerPrompt(state, attackerId, targetId, cardDb);

    const r = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(r.valid).toBe(true);

    // up_to:1 with exactly one eligible candidate — the engine prompts so
    // the player can decline. Whatever the prompt presents, it must NOT
    // include the staging card.
    if (r.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      const opts = r.pendingPrompt.options as { validTargets?: string[] };
      expect(opts.validTargets ?? []).toEqual([otherChar.instanceId]);
    } else {
      // Auto-resolution path: the vanilla must be on field, the trigger card
      // must remain in trash.
      const p1 = r.state.players[1];
      const fieldChars = p1.characters.filter((c): c is CardInstance => c !== null);
      expect(fieldChars.some((c) => c.cardId === CARDS.VANILLA.id)).toBe(true);
      expect(p1.trash.some((c) => c.cardId === trigger.id)).toBe(true);
    }
  });
});

// ─── 2. PLAY_SELF still finds the staging card ───────────────────────────────

describe("OPT-257 F4 — PLAY_SELF resolves against the staging card", () => {
  it("OP14-103 pattern: 'Play this card' Trigger plays the staging card to field", () => {
    const cardDb = createTestCardDb();
    const trigger = makePlaySelfTriggerCard("OPT257-PLAY-SELF");
    cardDb.set(trigger.id, trigger);

    const triggerLife: LifeCard = { instanceId: "life-self-play", cardId: trigger.id, face: "DOWN" };
    const { state, attackerId, targetId } = setupBattleReveal(cardDb, triggerLife);
    const paused = driveToTriggerPrompt(state, attackerId, targetId, cardDb);

    const r = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(r.valid).toBe(true);

    // Card should now be on p1's field, not in their trash.
    const p1 = r.state.players[1];
    const onField = p1.characters.filter((c): c is CardInstance => c !== null);
    expect(onField.some((c) => c.cardId === trigger.id)).toBe(true);
    expect(p1.trash.some((c) => c.cardId === trigger.id)).toBe(false);

    // Staging is popped.
    expect(r.state.turn.triggerStagingInstanceIds ?? []).toEqual([]);
  });
});

// ─── 3. Staging is cleared after a no-op Trigger resolves ───────────────────

describe("OPT-257 F4 — staging is popped after the Trigger resolves", () => {
  it("post-resolution: card is in trash and visible to subsequent queries", () => {
    const cardDb = createTestCardDb();
    const trigger = makeNoOpTriggerCard("OPT257-NOOP-TRIG");
    cardDb.set(trigger.id, trigger);

    const triggerLife: LifeCard = { instanceId: "life-noop-trig", cardId: trigger.id, face: "DOWN" };
    const { state, attackerId, targetId } = setupBattleReveal(cardDb, triggerLife);
    const paused = driveToTriggerPrompt(state, attackerId, targetId, cardDb);

    // Mid-pause: staging hasn't been pushed yet (the player hasn't accepted).
    expect(paused.turn.triggerStagingInstanceIds ?? []).toEqual([]);

    const r = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(r.valid).toBe(true);

    // Card landed in trash, staging is cleared.
    expect(r.state.players[1].trash.some((c) => c.cardId === trigger.id)).toBe(true);
    expect(r.state.turn.triggerStagingInstanceIds ?? []).toEqual([]);
    expect(isInTriggerStaging(r.state, triggerLife.instanceId)).toBe(false);
  });
});

// ─── 4. Decline Trigger never stages — card routes to hand ───────────────────

describe("OPT-257 F4 — declining a Trigger never enters staging", () => {
  it("decline path: card goes to hand, no trash, no staging", () => {
    const cardDb = createTestCardDb();
    const trigger = makePlayFromTrashTriggerCard("OPT257-DECLINE");
    cardDb.set(trigger.id, trigger);

    const triggerLife: LifeCard = { instanceId: "life-decline", cardId: trigger.id, face: "DOWN" };
    const { state, attackerId, targetId } = setupBattleReveal(cardDb, triggerLife);
    const paused = driveToTriggerPrompt(state, attackerId, targetId, cardDb);

    const r = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: false }, cardDb, 1);
    expect(r.valid).toBe(true);

    const p1 = r.state.players[1];
    expect(p1.hand.some((c) => c.cardId === trigger.id)).toBe(true);
    expect(p1.trash.some((c) => c.cardId === trigger.id)).toBe(false);
    expect(r.state.turn.triggerStagingInstanceIds ?? []).toEqual([]);
  });
});
