/**
 * OPT-774 — ST13-002 search destination and schema lint regression coverage.
 */

import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ActionOf } from "../engine/effect-types.js";
import { executeSearchDeck } from "../engine/effect-resolver/actions/draw-search.js";
import {
  handleArrangeSearchDeck,
  SEARCH_PICK_DESTINATIONS,
} from "../engine/effect-resolver/resume/deck.js";
import { resumeEffectChain } from "../engine/effect-resolver/resume.js";
import { ST13_002_PORTGAS_D_ACE } from "../engine/schemas/st13.js";
import type {
  CardInstance,
  GameState,
  PendingEvent,
  PlayerState,
  ResumeContext,
} from "../types.js";
import { CARDS, createTestCardDb } from "./helpers.js";

const linter = resolve(__dirname, "../engine/schemas/lint-schemas.sh");
const execOptions: ExecFileSyncOptionsWithStringEncoding = {
  cwd: resolve(__dirname, "../../../.."),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
};

function makeInstance(
  cardId: string,
  instanceId: string,
  zone: CardInstance["zone"],
  owner: 0 | 1,
): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

function emptyPlayer(playerId: string, leader: CardInstance): PlayerState {
  return {
    playerId,
    leader,
    characters: [null, null, null, null, null],
    stage: null,
    hand: [],
    deck: [],
    life: [],
    donDeck: [],
    donCostArea: [],
    trash: [],
    removedFromGame: [],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: null,
    donArtUrl: null,
  };
}

function makeState(): GameState {
  const p0 = emptyPlayer(
    "p0",
    makeInstance("ST13-002", "leader-0", "LEADER", 0),
  );
  p0.deck = [
    makeInstance("COST-1", "deck-1", "DECK", 0),
    makeInstance("COST-2", "deck-2", "DECK", 0),
    makeInstance("COST-5", "deck-3", "DECK", 0),
    makeInstance("COST-3", "deck-4", "DECK", 0),
    makeInstance("COST-4", "deck-5", "DECK", 0),
    makeInstance("DECK-REST", "deck-6", "DECK", 0),
  ];
  p0.life = [{ instanceId: "life-1", cardId: "LIFE-1", face: "DOWN" }];

  const p1 = emptyPlayer(
    "p1",
    makeInstance("LEADER-1", "leader-1", "LEADER", 1),
  );

  return {
    id: "game-opt-774",
    players: [p0, p1],
    turn: {
      number: 1,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      oncePerTurnUsed: {},
      actionsPerformedThisTurn: [],
      deckHitZeroThisTurn: [false, false],
    },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pregame: null,
    pendingPrompt: null,
    effectStack: [],
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
  } as unknown as GameState;
}

function st13SearchAction(): ActionOf<"SEARCH_DECK"> {
  const effect = ST13_002_PORTGAS_D_ACE.effects.find(
    (candidate) => candidate.id === "activate_search_to_life",
  );
  const action = effect?.actions?.[0];
  if (!action || action.type !== "SEARCH_DECK") {
    throw new Error("ST13-002 activate_search_to_life SEARCH_DECK action missing");
  }
  return action;
}

function invalidFixtureSource(): string {
  return `const SHARED_UNKNOWN_DESTINATION = "CONSTANT_UNKNOWN";
const SPREAD_PARAMS = { pick_destination: SHARED_UNKNOWN_DESTINATION };

export const OPT_774_LITERAL_FIXTURE = {
  card_id: "TEST-774-LITERAL",
  card_name: "Literal schema lint fixture",
  card_type: "Leader",
  effects: [{
    id: "literal_unknown",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    actions: [{
      type: "SEARCH_DECK",
      params: {
        look_at: 5,
        pick: { up_to: 1 },
        pick_destination: "LITERAL_UNKNOWN",
        rest_destination: "BOTTOM"
      }
    }]
  }]
};

export const OPT_774_CONSTANT_FIXTURE = {
  card_id: "TEST-774-CONSTANT",
  card_name: "Constant schema lint fixture",
  card_type: "Leader",
  effects: [{
    id: "constant_unknown",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    actions: [{
      type: "PLAYER_CHOICE",
      params: {
        options: [[{
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            pick_destination: SHARED_UNKNOWN_DESTINATION,
            rest_destination: "BOTTOM"
          }
        }]]
      }
    }]
  }]
};

export const OPT_774_SPREAD_FIXTURE = {
  card_id: "TEST-774-SPREAD",
  card_name: "Spread schema lint fixture",
  card_type: "Leader",
  effects: [{
    id: "spread_unknown",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    actions: [{
      type: "SCHEDULE_ACTION",
      params: {
        timing: "END_OF_THIS_TURN",
        action: {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            ...SPREAD_PARAMS,
            rest_destination: "BOTTOM"
          }
        }
      }
    }]
  }]
};

export const OPT_774_VALID_FIXTURE = {
  card_id: "TEST-774-VALID",
  card_name: "Valid schema lint fixture",
  card_type: "Leader",
  effects: [{
    id: "valid_life_top",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    actions: [{
      type: "SEARCH_DECK",
      params: {
        look_at: 5,
        pick: { up_to: 1 },
        pick_destination: "LIFE_TOP",
        rest_destination: "BOTTOM"
      }
    }]
  }]
};
`;
}

function validFixtureSource(): string {
  return `export const OPT_774_VALID_FIXTURE = {
  card_id: "TEST-774-VALID",
  card_name: "Valid schema lint fixture",
  card_type: "Leader",
  effects: [{
    id: "valid_life_top",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    actions: [{ type: "SEARCH_DECK", params: { pick_destination: "LIFE_TOP" } }]
  }]
};
`;
}

describe("OPT-774: ST13-002 search to face-up Life", () => {
  it("places the selected 5-cost Character on top of Life face-up", () => {
    const state = makeState();
    const cardDb = createTestCardDb();
    for (const cost of [1, 2, 3, 4, 5]) {
      const cardId = `COST-${cost}`;
      cardDb.set(cardId, {
        ...CARDS.VANILLA,
        id: cardId,
        name: cardId,
        cost,
      });
    }
    cardDb.set("ST13-002", {
      ...CARDS.LEADER,
      id: "ST13-002",
      name: "Portgas.D.Ace",
      effectSchema: ST13_002_PORTGAS_D_ACE,
    });

    const search = executeSearchDeck(
      state,
      st13SearchAction(),
      "leader-0",
      0,
      cardDb,
      new Map(),
    );
    const prompt = search.pendingPrompt;
    expect(prompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (!prompt || prompt.options.promptType !== "ARRANGE_TOP_CARDS") {
      throw new Error("ST13-002 search did not produce an arrange prompt");
    }
    expect(prompt.options.cards).toHaveLength(5);
    expect(prompt.options.validTargets).toEqual(["deck-3"]);

    const result = resumeEffectChain(
      state,
      prompt.resumeContext as ResumeContext,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "deck-3",
        orderedInstanceIds: ["deck-1", "deck-2", "deck-4", "deck-5"],
        destination: "bottom",
      },
      cardDb,
    );

    expect(result.state.players[0].life[0]).toMatchObject({
      cardId: "COST-5",
      face: "UP",
    });
    expect(result.state.players[0].hand).toHaveLength(0);
  });

  it("keeps the exported search destinations in lockstep with resume routing", () => {
    expect(SEARCH_PICK_DESTINATIONS).toEqual([
      "HAND",
      "TRASH",
      "LIFE",
      "LIFE_TOP",
    ]);

    for (const pickDestination of SEARCH_PICK_DESTINATIONS) {
      const state = makeState();
      const events: PendingEvent[] = [];
      const next = handleArrangeSearchDeck(
        state,
        {
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: "deck-3",
          orderedInstanceIds: ["deck-1", "deck-2", "deck-4", "deck-5"],
          destination: "bottom",
        },
        {
          ...st13SearchAction(),
          params: {
            ...st13SearchAction().params,
            pick_destination: pickDestination,
            face: "UP",
          },
        },
        0,
        ["deck-3"],
        events,
      );

      expect(next).not.toBeNull();
      const player = next!.players[0];
      switch (pickDestination) {
        case "HAND":
          expect(player.hand[0]?.cardId).toBe("COST-5");
          break;
        case "TRASH":
          expect(player.trash[0]?.cardId).toBe("COST-5");
          break;
        case "LIFE":
        case "LIFE_TOP":
          expect(player.life[0]).toMatchObject({
            cardId: "COST-5",
            face: "UP",
          });
          break;
      }
    }
  });

  it("rejects an unknown pick_destination and accepts LIFE_TOP", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "opt774-lint-"));
    const invalidFixture = join(fixtureDirectory, "invalid.ts");
    const validFixture = join(fixtureDirectory, "valid.ts");
    writeFileSync(invalidFixture, invalidFixtureSource());
    writeFileSync(validFixture, validFixtureSource());

    try {
      let output = "";
      try {
        execFileSync("node", [linter, invalidFixture], execOptions);
      } catch (error) {
        const commandError = error as { stdout?: string; stderr?: string };
        output = `${commandError.stdout ?? ""}${commandError.stderr ?? ""}`;
      }

      expect(output).toContain(
        'invalid.ts TEST-774-LITERAL literal_unknown action[0] pick_destination "LITERAL_UNKNOWN"',
      );
      expect(output).toContain(
        'invalid.ts TEST-774-CONSTANT constant_unknown action[1] pick_destination "CONSTANT_UNKNOWN"',
      );
      expect(output).toContain(
        'invalid.ts TEST-774-SPREAD spread_unknown action[1] pick_destination "CONSTANT_UNKNOWN"',
      );
      expect(output).not.toContain("TEST-774-VALID valid_life_top");
      expect(execFileSync("node", [linter, validFixture], execOptions)).toContain(
        "Schema validation clean — 1 card(s).",
      );
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });
});
