/**
 * OPT-953 — value-layer contract fixtures, one per FAQ ruling.
 *
 * Contract: docs/game-engine/VALUE-LAYER-CONTRACT.md. Each `it` names the FAQ
 * file and line it encodes. Authored schemas come from the production
 * registry; card data carries only the printed stats the ruling needs.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameState } from "../types.js";
import type { ActionOf, ActionType, EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { transitionCard } from "../engine/zone-transition.js";
import { getEffectiveBasePower, getEffectiveFieldCost, getEffectivePower } from "../engine/modifiers.js";
import { matchesFilter } from "../engine/conditions.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";
import {
  executeCopyPower,
  executeModifyCost,
  executeModifyPower,
  executeSetBasePower,
  executeSwapBasePower,
} from "../engine/effect-resolver/actions/modifiers.js";
import { executeSetCost } from "../engine/effect-resolver/actions/effects.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

type Zone = "CHARACTER" | "LEADER";

function fixture(activePlayer: 0 | 1 = 0) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.turn.activePlayerIndex = activePlayer;
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });
  let serial = 0;

  function def(id: string, data: Partial<CardData> = {}, schema?: EffectSchema | null) {
    const authored = schema === undefined ? getEffectSchema(id) : schema;
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: authored?.card_name ?? id,
      effectText: "",
      counter: null,
      ...data,
      effectSchema: authored ?? null,
    });
  }

  function put(id: string, owner: 0 | 1, zone: Zone = "CHARACTER", don = 0) {
    if (!db.has(id)) def(id);
    const instanceId = `${id}-${owner}-${serial++}`;
    const card: CardInstance = {
      instanceId,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: Array.from({ length: don }, (_, i) => ({
        instanceId: `don-${instanceId}-${i}`,
        state: "ACTIVE" as const,
        attachedTo: instanceId,
      })),
      turnPlayed: zone === "LEADER" ? null : 1,
    };
    const p = state.players[owner];
    if (zone === "LEADER") p.leader = card;
    else p.characters[p.characters.findIndex((c) => !c)] = card;
    state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }

  /** Run the first authored action of `type` on `source`'s schema through its handler. */
  function resolve<T extends ActionType>(
    type: T,
    source: CardInstance,
    run: (state: GameState, action: ActionOf<T>) => { state: GameState },
  ) {
    const schema = db.get(source.cardId)!.effectSchema!;
    const action = schema.effects.flatMap((e) => e.actions ?? []).find((a) => a.type === type);
    expect(action, `${source.cardId} authors ${type}`).toBeDefined();
    state = run(state, action as ActionOf<T>).state;
  }

  function leave(card: CardInstance) {
    const moved = transitionCard(state, card.instanceId, "TRASH", { position: "TOP" });
    expect(moved).toBeTruthy();
    state = moved!.state;
  }

  const live = (card: CardInstance) =>
    state.players[card.controller].characters.find((c) => c?.instanceId === card.instanceId) ??
    (state.players[card.controller].leader.instanceId === card.instanceId ? state.players[card.controller].leader : undefined);
  const data = (card: CardInstance) => db.get(card.cardId)!;
  const base = (card: CardInstance) => getEffectiveBasePower(live(card)!, data(card), state, db);
  const power = (card: CardInstance) => getEffectivePower(live(card)!, data(card), state, db);
  const cost = (card: CardInstance) => getEffectiveFieldCost(data(card), state, card.instanceId, db);

  return {
    db, def, put, resolve, leave, live, base, power, cost,
    get state() { return state; },
    set state(next: GameState) { state = next; },
  };
}

const noMap = () => new Map();

describe("OPT-953 power layer P1: base-power settings", () => {
  it("OP13-084 Ju Peter — qa_op13.md:186: a Five Elders Character's base power becomes 7000", () => {
    const f = fixture(0);
    f.def("OP13-084", { cost: 7, power: 5000, types: ["Celestial Dragons", "Five Elders"] });
    f.def("OP13-082", { cost: 10, power: 12000, types: ["Celestial Dragons", "Five Elders"] }, null);
    f.put("OP13-084", 0);
    const elders = f.put("OP13-082", 0);
    f.state.players[0].trash = Array.from({ length: 10 }, (_, i) => ({ ...elders, instanceId: `trash-${i}`, zone: "TRASH" as const }));
    expect(f.base(elders)).toBe(7000);
    f.state.players[0].trash.pop();
    expect(f.base(elders)).toBe(12000);
  });

  it("OP13-084 with OP14-003 — qa_op14_eb04.md:30: filters read the set base (Mars at 7000 is not '5000 base power or less')", () => {
    // Pipeline coverage of the K.O. itself: opt-833-base-power-pipeline.test.ts.
    const f = fixture(0);
    f.def("OP13-084", { cost: 7, power: 5000, types: ["Celestial Dragons", "Five Elders"] });
    f.def("OP13-091", { cost: 6, power: 5000, types: ["Celestial Dragons", "Five Elders"] });
    f.put("OP13-084", 0);
    const mars = f.put("OP13-091", 0);
    f.state.players[0].trash = Array.from({ length: 10 }, (_, i) => ({ ...mars, instanceId: `trash-${i}`, zone: "TRASH" as const }));
    expect(f.base(mars)).toBe(7000);
    expect(matchesFilter(f.live(mars)!, { base_power_max: 5000 }, f.db, f.state)).toBe(false);
  });

  it("OP14-001 Law — qa_op14_eb04.md:12: the swapped value survives the other Character leaving", () => {
    const f = fixture(1);
    f.def("OP14-001", { type: "Leader", power: 5000, life: 4, cost: null });
    f.def("S953-A", { power: 6000, types: ["Supernovas"] }, null);
    f.def("S953-B", { power: 2000, types: ["Heart Pirates"] }, null);
    const law = f.put("OP14-001", 0, "LEADER");
    const a = f.put("S953-A", 0);
    const b = f.put("S953-B", 0);
    f.resolve("SWAP_BASE_POWER", law, (s, action) =>
      executeSwapBasePower(s, action, law.instanceId, 0, f.db, noMap(), [a.instanceId, b.instanceId]));
    expect(f.base(a)).toBe(2000);
    expect(f.base(b)).toBe(6000);
    f.leave(a);
    expect(f.base(b)).toBe(6000);
  });

  it("OP14-001 with PRB02-002 — qa_op14_eb04.md:16: base 0 from the swap, then −2000 from a modifier, is −2000", () => {
    const f = fixture(1);
    f.def("OP14-001", { type: "Leader", power: 5000, life: 4, cost: null });
    f.def("PRB02-002", { power: 6000, types: ["Supernovas", "Heart Pirates"] });
    f.def("OP14-013", { power: 0, types: ["Supernovas", "Straw Hat Crew"] }, null);
    const leader = f.put("OP14-001", 0, "LEADER");
    const law = f.put("PRB02-002", 0);
    const luffy = f.put("OP14-013", 0);
    // PRB02-002's replacement substitute: "give this Character −2000 power during this turn".
    f.state = executeModifyPower(
      f.state, { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: -2000 } },
      law.instanceId, 0, f.db, noMap(), [law.instanceId],
    ).state;
    f.resolve("SWAP_BASE_POWER", leader, (s, action) =>
      executeSwapBasePower(s, action, leader.instanceId, 0, f.db, noMap(), [law.instanceId, luffy.instanceId]));
    expect(f.base(law)).toBe(0);
    expect(f.power(law)).toBe(-2000);
  });

  it("OP14-017 Chambres — qa_op14_eb04.md:44: an opponent pair keeps the swap after one leaves", () => {
    const f = fixture(0);
    f.def("OP14-017", { type: "Event", cost: 2, power: null });
    f.def("S953-OPP-A", { power: 9000 }, null);
    f.def("S953-OPP-B", { power: 3000 }, null);
    const event = f.put("OP14-017", 0);
    const a = f.put("S953-OPP-A", 1);
    const b = f.put("S953-OPP-B", 1);
    f.resolve("SWAP_BASE_POWER", event, (s, action) =>
      executeSwapBasePower(s, action, event.instanceId, 0, f.db, noMap(), [a.instanceId, b.instanceId]));
    f.leave(event);
    f.leave(b);
    expect(f.base(a)).toBe(3000);
  });

  it.each([
    ["OP15-070", "Fuza", "faq_op15-eb04.md:328", "UNBLOCKABLE"],
    ["OP15-071", "Holly", "faq_op15-eb04.md:335", "DOUBLE_ATTACK"],
  ] as const)("%s %s — %s: a Leader with every name gets the keyword and base power 6000 on the opponent's turn", (id, _name, _faq, keyword) => {
    const f = fixture(1);
    const allNames: EffectSchema = {
      card_id: "S953-ALL",
      card_type: "Leader",
      rule_modifications: [{ rule_type: "TREATED_AS_ALL_IDENTITIES", names: true, types: true, attributes: true }],
      effects: [],
    };
    f.def("S953-ALL", { type: "Leader", power: 5000, life: 4, cost: null, color: ["Purple"] }, allNames);
    f.def(id, { cost: 4, power: 5000, color: ["Purple"] });
    const leader = f.put("S953-ALL", 0, "LEADER");
    const self = f.put(id, 0);
    expect(f.base(leader)).toBe(6000);
    expect(f.base(self)).toBe(6000);
    expect(hasEffectiveKeyword(f.live(leader)!, f.db.get(leader.cardId)!, keyword, f.state, f.db)).toBe(true);
    // Own turn: the [Opponent's Turn] setting is off.
    f.state = { ...f.state, turn: { ...f.state.turn, activePlayerIndex: 0 } };
    expect(f.base(leader)).toBe(5000);
  });

  it("ST26-005 Luffy — qa_st-23-28.md:77: two 7000 settings leave base power 7000 (§4-9-2-1)", () => {
    const f = fixture(0);
    f.def("ST26-005", { cost: 5, power: 6000 });
    f.def("S953-SHC", { type: "Leader", power: 5000, life: 4, cost: null, types: ["Straw Hat Crew"], color: ["Red", "Purple"] }, null);
    const leader = f.put("S953-SHC", 0, "LEADER");
    const luffy = f.put("ST26-005", 0);
    for (let i = 0; i < 2; i++) {
      f.resolve("SET_BASE_POWER", luffy, (s, action) =>
        executeSetBasePower(s, action, luffy.instanceId, 0, f.db, noMap(), [leader.instanceId]));
    }
    expect(f.base(leader)).toBe(7000);
    // DON!! (P3) and modifiers (P2) sit on top of the setting.
    expect(f.power(leader)).toBe(7000);
  });

  it("OP06-009 Shuraiya — qa_op06.md:30: the copied base is captured at activation; a later Counter on the opponent's Leader does not change it", () => {
    const f = fixture(0);
    f.def("OP06-009", { cost: 4, power: 3000 });
    const shuraiya = f.put("OP06-009", 0);
    const oppLeader = f.state.players[1].leader;
    f.resolve("COPY_POWER", shuraiya, (s, action) =>
      executeCopyPower(s, action, shuraiya.instanceId, 0, f.db, noMap()));
    expect(f.base(shuraiya)).toBe(5000);
    f.state = {
      ...f.state,
      turn: {
        ...f.state.turn,
        battle: {
          battleId: "b953", attackerInstanceId: shuraiya.instanceId, targetInstanceId: oppLeader.instanceId,
          attackerPower: 5000, defenderPower: 6000, counterPowerAdded: 1000, blockerActivated: false,
          step: "COUNTER_STEP", redirectWindow: false, blockerLocked: false, targetLocked: false,
        },
      },
    };
    expect(f.power(oppLeader)).toBe(6000);
    expect(f.base(shuraiya)).toBe(5000);
  });

  it("OP06-009 with EB03-004 — qa_eb03.md:15: 'no Character with 6000 base power or more' sees Shuraiya's set base", () => {
    const f = fixture(1);
    f.def("S953-MULTI", { type: "Leader", power: 6000, life: 4, cost: null, color: ["Red", "Green"] }, null);
    f.def("EB03-004", { cost: 3, power: 2000 });
    f.def("OP06-009", { cost: 4, power: 3000 });
    f.def("S953-OPP6", { type: "Leader", power: 6000, life: 4, cost: null }, null);
    f.put("S953-MULTI", 0, "LEADER");
    f.put("S953-OPP6", 1, "LEADER");
    const carina = f.put("EB03-004", 0);
    const shuraiya = f.put("OP06-009", 0);
    expect(f.power(carina)).toBe(6000);
    f.resolve("COPY_POWER", shuraiya, (s, action) =>
      executeCopyPower(s, action, shuraiya.instanceId, 0, f.db, noMap()));
    expect(f.base(shuraiya)).toBe(6000);
    expect(f.power(carina)).toBe(2000);
  });
});

describe("OPT-953 cost layers C1-C2", () => {
  function kuzanBoard() {
    const f = fixture(0);
    f.def("OP02-121", { cost: 9, power: 10000 });
    f.def("S953-COST6", { cost: 6, power: 6000 }, null);
    const kuzan = f.put("OP02-121", 0);
    const target = f.put("S953-COST6", 1);
    return { f, kuzan, target };
  }

  it("OP02-121 Kuzan — qa_op02.md:458: 6 −5 −2 shows 0, and becomes 4 after Kuzan leaves (negative intermediate kept)", () => {
    const { f, kuzan, target } = kuzanBoard();
    expect(f.cost(target)).toBe(1);
    f.state = executeModifyCost(
      f.state, { type: "MODIFY_COST", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } }, params: { amount: -2 } },
      "OP02-106-src", 0, f.db, noMap(), [target.instanceId],
    ).state;
    expect(f.cost(target)).toBe(0);
    f.leave(kuzan);
    expect(f.cost(target)).toBe(4);
  });

  it("OP03-091 Helmeppo with Kuzan — qa_op03.md:218: set to 0 under Kuzan's −5 stays 0 after Kuzan leaves", () => {
    const { f, kuzan, target } = kuzanBoard();
    f.def("OP03-091", { cost: 2, power: 2000 });
    const helmeppo = f.put("OP03-091", 0);
    f.resolve("SET_COST", helmeppo, (s, action) =>
      executeSetCost(s, action, helmeppo.instanceId, 0, f.db, noMap(), [target.instanceId]));
    expect(f.cost(target)).toBe(0);
    f.leave(kuzan);
    expect(f.cost(target)).toBe(0);
  });

  function usoppBoard() {
    // Opponent's turn for Usopp's controller (player 1): player 0 is the turn player.
    const f = fixture(0);
    f.def("OP10-042", { type: "Leader", power: 5000, life: 4, cost: null, types: ["Dressrosa"] });
    f.def("OP04-089", { cost: 3, power: 4000, types: ["Dressrosa"] }, null);
    f.put("OP10-042", 1, "LEADER");
    const bartolomeo = f.put("OP04-089", 1);
    return { f, bartolomeo };
  }
  const autoCost = (amount: number) => ({
    type: "MODIFY_COST" as const,
    target: { type: "CHARACTER" as const, controller: "OPPONENT" as const, count: { up_to: 1 } },
    params: { amount },
  });

  it("OP10-042 Usopp with Tsuru — qa_op10.md:285: permanent +1 first (4), then auto −2: 2, Usopp stays", () => {
    const { f, bartolomeo } = usoppBoard();
    expect(f.cost(bartolomeo)).toBe(4);
    f.state = executeModifyCost(f.state, autoCost(-2), "OP02-106-src", 0, f.db, noMap(), [bartolomeo.instanceId]).state;
    expect(f.cost(bartolomeo)).toBe(2);
  });

  it("OP10-042 Usopp with Kaku — qa_op10.md:289: 4 then −3 is 1, Usopp's 'cost 2 or more' fails and drops: 0", () => {
    const { f, bartolomeo } = usoppBoard();
    f.state = executeModifyCost(f.state, autoCost(-3), "OP07-080-src", 0, f.db, noMap(), [bartolomeo.instanceId]).state;
    expect(f.cost(bartolomeo)).toBe(0);
  });

  it("OP10-042 Usopp with Issho — qa_op10.md:293: the turn player's permanent −3 first (0), so Usopp never applies", () => {
    const { f, bartolomeo } = usoppBoard();
    f.def("OP03-078", { cost: 7, power: 7000 });
    f.put("OP03-078", 0, "CHARACTER", 1);
    expect(f.cost(bartolomeo)).toBe(0);
  });
});
