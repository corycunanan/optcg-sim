import { describe, expect, it } from "vitest";
import { endPhaseRig, synSchema, type EndPhaseRig } from "./opt-962-rig.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { parseStoredSession } from "../session/persistence.js";
import { runPipeline } from "../engine/pipeline.js";
import { CARDS } from "./helpers.js";

function restore(r: EndPhaseRig, location: string) {
  if (location === "memory") return;
  const wire = JSON.parse(
    JSON.stringify({
      state: toPersistedGameState(r.state),
      undoHistory: [toPersistedGameState(r.state)],
      cardDb: Object.fromEntries(r.db),
    })
  );
  const loaded = parseStoredSession(wire);
  r.state = location === "live" ? loaded.state : loaded.undoHistory[0];
}
function select(r: EndPhaseRig, ids: string[], location: string) {
  restore(r, location);
  r.act(
    { type: "SELECT_TARGET", selectedInstanceIds: ids },
    r.state.pendingPrompt?.respondingPlayer
  );
}
function attack(
  r: EndPhaseRig,
  attacker: string,
  target = r.state.players[1].leader.instanceId
) {
  r.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
}
const counterData = (text: string) => ({
  type: "Event" as const,
  cost: 0,
  power: null,
  counter: null,
  effectText: text,
});

describe.each(["memory", "live", "undo"])(
  "canonical battle windows (%s)",
  (location) => {
    it("OP16-080 reloads between Trigger-card cost and redirect target without reopening Blocker", () => {
      const r = endPhaseRig({ handSize: 0 });
      const teach = r.put("OP16-080", 1, "LEADER", {
        effectText: "[On Your Opponent's Attack]",
      });
      const payment = r.putSyn(
        "TRIGGER-PAYMENT-967",
        { ...CARDS.TRIGGER.effectSchema!, card_id: "TRIGGER-PAYMENT-967" },
        1,
        "HAND",
        {
          keywords: { ...CARDS.TRIGGER.keywords },
          triggerText: "[Trigger] Play this card.",
        }
      );
      const pirate = r.putSyn("PIRATE-967", null, 1, "CHARACTER", {
        types: ["Blackbeard Pirates"],
      });
      attack(r, r.state.players[0].leader.instanceId);
      expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      restore(r, location);
      r.act({ type: "PLAYER_CHOICE", choiceId: "accept" }, 1);
      expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      select(r, [payment.instanceId], location);
      expect(r.state.players[1].hand).toEqual([]);
      expect(r.state.turn.battle?.redirectWindow).toBe(true);
      expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(
        runPipeline(
          r.state,
          { type: "DECLARE_BLOCKER", blockerInstanceId: pirate.instanceId },
          r.db,
          1
        ).valid
      ).toBe(false);
      select(r, [pirate.instanceId], location);
      expect(r.state.turn.battle?.targetInstanceId).toBe(pirate.instanceId);
      expect(r.state.turn.battle?.redirectWindow).toBe(false);
      expect(r.state.pendingPrompt).toBeNull();
      expect(
        r.state.eventLog.filter((event) => event.type === "ATTACK_REDIRECTED")
      ).toHaveLength(1);
      expect(
        r.state.eventLog.filter((event) => event.type === "CARD_TRASHED")
      ).toHaveLength(1);
      expect(r.state.turn.battleSubPhase).toBe("BLOCK_STEP");
      expect(r.state.turn.battle?.targetLocked).toBe(true);
      expect(
        runPipeline(
          r.state,
          { type: "DECLARE_BLOCKER", blockerInstanceId: pirate.instanceId },
          r.db,
          1
        ).valid
      ).toBe(false);
      restore(r, location);
      r.act({ type: "PASS" }, 1);
      expect(r.state.turn.battleSubPhase).toBe("COUNTER_STEP");
      expect(r.state.turn.battle?.targetInstanceId).toBe(pirate.instanceId);
      expect(r.state.players[1].leader.instanceId).toBe(teach.instanceId);
    });

    // Canonical text: docs/cards/OP-02.md:272. OP02-045 is a Counter Event,
    // and the played Character must have no base effect. It cannot legally
    // supply a printed On Play effect; that distinct case follows below.
    it("OP02-045 plays a no-base-effect Character during Counter and preserves that battle", () => {
      const r = endPhaseRig({ handSize: 0 });
      const event = r.put(
        "OP02-045",
        1,
        "HAND",
        counterData(
          "[Counter] Up to 1 of your Leader or Character cards gains +6000 power during this battle. Then, play up to 1 Character card with a cost of 3 or less and no base effect from your hand."
        )
      );
      const vanilla = r.putSyn("VANILLA-967", null, 1, "HAND", {
        cost: 3,
        power: 4000,
      });
      attack(r, r.state.players[0].leader.instanceId);
      r.act({ type: "PASS" }, 1);
      r.act(
        {
          type: "USE_COUNTER_EVENT",
          cardInstanceId: event.instanceId,
          counterTargetInstanceId: r.state.players[1].leader.instanceId,
        },
        1
      );
      expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      select(r, [r.state.players[1].leader.instanceId], location);
      expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(
        r.state.pendingPrompt?.options.promptType === "SELECT_TARGET" &&
          r.state.pendingPrompt.options.validTargets
      ).toContain(vanilla.instanceId);
      select(r, [vanilla.instanceId], location);
      expect(
        r.state.players[1].characters.some((c) => c?.cardId === vanilla.cardId)
      ).toBe(true);
      expect(r.state.turn.battleSubPhase).toBe("COUNTER_STEP");
      expect(r.state.pendingPrompt).toBeNull();
      expect(
        r.state.eventLog.filter((e) => e.type === "CARD_PLAYED")
      ).toHaveLength(1);
      expect(
        r.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
      ).toHaveLength(1);
      expect(r.state.eventLog.some((e) => e.type === "CHARACTER_BATTLES")).toBe(
        false
      );
    });

    // Rules 7-1-3-2-2 and 8-6; docs/cards/OP-05.md:124 (OP05-018) and
    // :76 (OP05-011). Kuma is Revolutionary Army, <=5000 power, and its real
    // On Play can K.O. a <=2000 attacker before Counter Step closes.
    it("OP05-018 plays Kuma, whose On Play resolves inside Counter and removes the attacker", () => {
      const r = endPhaseRig({ handSize: 0 });
      const attacker = r.putSyn("ATTACKER-967", null, 0, "CHARACTER", {
        power: 1000,
      });
      const kuma = r.put("OP05-011", 1, "HAND", {
        types: ["Revolutionary Army"],
        cost: 2,
        power: 2000,
        effectText:
          "[On Play] K.O. up to 1 of your opponent's Characters with 2000 power or less.",
      });
      const event = r.put(
        "OP05-018",
        1,
        "HAND",
        counterData(
          "[Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle. Then, play up to 1 {Revolutionary Army} type Character card with 5000 power or less from your hand."
        )
      );
      attack(r, attacker.instanceId);
      r.act({ type: "PASS" }, 1);
      r.act(
        {
          type: "USE_COUNTER_EVENT",
          cardInstanceId: event.instanceId,
          counterTargetInstanceId: r.state.players[1].leader.instanceId,
        },
        1
      );
      select(r, [r.state.players[1].leader.instanceId], location);
      select(r, [kuma.instanceId], location);
      expect(r.state.turn.battleSubPhase).toBe("COUNTER_STEP");
      expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      select(r, [attacker.instanceId], location);
      expect(
        r.state.players[0].characters.some(
          (c) => c?.instanceId === attacker.instanceId
        )
      ).toBe(false);
      expect(
        r.state.players[1].characters.some((c) => c?.cardId === kuma.cardId)
      ).toBe(true);
      expect(r.state.turn.battle).toBeNull();
      expect(r.state.effectStack).toEqual([]);
      expect(r.state.eventLog.filter((e) => e.type === "CARD_KO")).toHaveLength(
        1
      );
      expect(
        r.state.eventLog.some((e) =>
          ["CHARACTER_BATTLES", "DAMAGE_DEALT", "COMBAT_VICTORY"].includes(
            e.type
          )
        )
      ).toBe(false);
    });

    // qa_op06.md:138-140 is the independent order oracle. The printed Zeff
    // cost is changed by a lasting effect for this FAQ's <=2-cost premise.
    it("Zeff mills before Crocodile's On Block puts Zeff on deck bottom", () => {
      const r = endPhaseRig({ handSize: 0, deckSize: 10 });
      r.db.set(r.state.players[0].leader.cardId, {
        ...r.db.get(r.state.players[0].leader.cardId)!,
        types: ["East Blue"],
      });
      const zeff = r.put("OP06-048", 0, "CHARACTER", { cost: 5, power: 6000 });
      r.state.activeEffects.push({
        id: "zeff-cost-967",
        sourceCardInstanceId: r.state.players[0].leader.instanceId,
        sourceEffectBlockId: "faq-cost-premise",
        category: "auto",
        modifiers: [{ type: "MODIFY_COST", params: { amount: -3 } }],
        appliesTo: [zeff.instanceId],
        duration: { type: "THIS_TURN" },
        expiresAt: { wave: "END_OF_TURN", turn: 3, player: 0 },
        controller: 0,
        timestamp: 0,
      });
      const croc = r.put(
        "ST03-003",
        1,
        "CHARACTER",
        { cost: 5, power: 5000, keywords: { ...CARDS.BLOCKER.keywords } },
        1
      );
      attack(r, r.state.players[0].leader.instanceId);
      r.act({ type: "DECLARE_BLOCKER", blockerInstanceId: croc.instanceId }, 1);
      expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      expect(r.state.pendingPrompt?.respondingPlayer).toBe(0);
      restore(r, location);
      r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      expect(r.state.players[0].deck).toHaveLength(6);
      expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      select(r, [zeff.instanceId], location);
      expect(r.state.players[0].deck.at(-1)?.cardId).toBe(zeff.cardId);
      const types = r.state.eventLog.map((e) => e.type);
      expect(types.indexOf("CARD_TRASHED")).toBeGreaterThanOrEqual(0);
      expect(types.indexOf("CARD_TRASHED")).toBeLessThan(
        types.indexOf("CARD_RETURNED_TO_DECK")
      );
      expect(r.state.turn.battleSubPhase).toBe("COUNTER_STEP");
    });

    // qa_op03.md:4-22: Ace's "is attacked" follows attack effects and the
    // Blocker choice, and does not activate if Blocker changes the target.
    it.each([false, true])(
      "Ace waits for Blocker choice (Blocker used=%s)",
      (blockerUsed) => {
        const r = endPhaseRig({ handSize: 0 });
        const attacker = r.putSyn(
          "ATTACKING-967",
          synSchema("ATTACKING-967", "Character", [
            {
              id: "attack-draw",
              category: "auto",
              trigger: { keyword: "WHEN_ATTACKING" },
              actions: [{ type: "DRAW", params: { amount: 1 } }],
            },
          ]),
          0,
          "CHARACTER"
        );
        r.putSyn(
          "OPPONENT-WATCH-967",
          synSchema("OPPONENT-WATCH-967", "Character", [
            {
              id: "opponent-draw",
              category: "auto",
              trigger: { keyword: "ON_OPPONENT_ATTACK" },
              actions: [{ type: "DRAW", params: { amount: 1 } }],
            },
          ]),
          1,
          "CHARACTER"
        );
        const ace = r.put("OP03-001", 1, "LEADER", {
          type: "Leader",
          power: 5000,
          life: 4,
        });
        const blocker = r.put("ST03-003", 1, "CHARACTER", {
          keywords: { ...CARDS.BLOCKER.keywords },
        });
        r.putSyn("ACE-EVENT-967", null, 1, "HAND", {
          ...counterData("[Counter]"),
          type: "Event",
        });
        attack(r, attacker.instanceId, ace.instanceId);
        expect(r.state.pendingPrompt).toBeNull();
        expect(
          r.state.eventLog
            .filter((e) => e.type === "CARD_DRAWN")
            .map((e) => e.playerIndex)
        ).toEqual([0, 1]);
        restore(r, location);
        r.act(
          blockerUsed
            ? { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId }
            : { type: "PASS" },
          1
        );
        if (blockerUsed) expect(r.state.pendingPrompt).toBeNull();
        else {
          expect(r.state.pendingPrompt?.options.promptType).toBe(
            "OPTIONAL_EFFECT"
          );
          restore(r, location);
          r.act({ type: "PLAYER_CHOICE", choiceId: "skip" });
        }
        expect(r.state.turn.battleSubPhase).toBe("COUNTER_STEP");
        expect(
          runPipeline(
            r.state,
            { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId },
            r.db,
            1
          ).valid
        ).toBe(false);
      }
    );
  }
);
