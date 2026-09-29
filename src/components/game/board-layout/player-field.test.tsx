import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveEffect,
  ActiveProhibition,
  CardDb,
  CardInstance,
  PlayerState,
} from "@shared/game-types";
import { ActiveEffectsProvider } from "@/contexts/active-effects-context";
import { PlayerField } from "./player-field";
import { InteractionModeProvider } from "./interaction-mode";

vi.mock("@/hooks/use-field-arrivals", () => ({
  useFieldArrivals: () => new Set<string>(),
}));

vi.mock("./deck-pile", () => ({ DeckPile: () => null }));
vi.mock("./don-zone", () => ({ DonZone: () => null }));
vi.mock("./drop-zones", () => ({
  DroppableCharSlot: () => null,
  DroppableOwnField: () => null,
  DroppableStageZone: () => null,
}));
vi.mock("./empty-slot", () => ({ EmptySlot: () => null }));
vi.mock("./field-card", () => ({
  PlayerFieldCard: ({
    card,
    blockerSelectable,
    selected,
    onSelect,
  }: {
    card: CardInstance;
    blockerSelectable?: boolean;
    selected?: boolean;
    onSelect?: () => void;
  }) => (
    <div
      data-testid={`field-card-${card.instanceId}`}
      data-blocker-selectable={String(!!blockerSelectable)}
      data-selected={String(!!selected)}
      onClick={onSelect}
    />
  ),
}));
vi.mock("./life-zone", () => ({ LifeZone: () => null }));
vi.mock("./trash-zone", () => ({ DroppableTrashZone: () => null }));

const printedBlocker = makeCard("blocker-1", "PRINTED-BLOCKER");
const highPowerBlocker = makeCard("high-power-blocker", "PRINTED-BLOCKER", 0, 6000);
const lowPowerBlocker = makeCard("low-power-blocker", "PRINTED-BLOCKER", 0, 4000);
const vanillaBlocker = makeCard("blocker-1", "VANILLA");
const attacker = makeCard("attacker-1", "ATTACKER", 1);

const cardDb = {
  "PRINTED-BLOCKER": {
    type: "Character",
    cost: 3,
    keywords: { blocker: true },
  },
  VANILLA: {
    type: "Character",
    keywords: {},
  },
  LEADER: {
    type: "Leader",
    keywords: {},
  },
  ATTACKER: {
    type: "Character",
    keywords: {},
  },
} as unknown as CardDb;

let renderer: ReactTestRenderer | null = null;

function makeCard(
  instanceId: string,
  cardId: string,
  controller: 0 | 1 = 0,
  effectivePower?: number,
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller,
    owner: controller,
    basePower: effectivePower,
    effectivePower,
  };
}

function makePlayer(character: CardInstance): PlayerState {
  return {
    leader: null,
    characters: [character, null, null, null, null],
    stage: null,
    donCostArea: [],
    hand: [],
    deck: [],
    trash: [],
    donDeck: [],
    life: [],
    removedFromGame: [],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: null,
    donArtUrl: null,
  } as unknown as PlayerState;
}

function keywordEffect(
  instanceId: string,
  keyword: "BLOCKER" | "UNBLOCKABLE",
): ActiveEffect {
  return {
    id: `grant-${keyword.toLowerCase()}`,
    sourceCardInstanceId: "source-1",
    appliesTo: [instanceId],
    modifiers: [{ type: "GRANT_KEYWORD", params: { keyword } }],
  };
}

function renderBlockerEligibility({
  character,
  activeEffects = [],
  prohibitions = [],
  attackerCard = null,
  blockerAlreadyDeclared = false,
}: {
  character: CardInstance;
  activeEffects?: ActiveEffect[];
  prohibitions?: ActiveProhibition[];
  attackerCard?: CardInstance | null;
  blockerAlreadyDeclared?: boolean;
}): boolean {
  act(() => {
    renderer = create(
      <ActiveEffectsProvider value={activeEffects}>
        <InteractionModeProvider value="full">
          <PlayerField
            me={makePlayer(character)}
            playerIndex={0}
            bottomPlayerIndex={0}
            owner="me"
            cardDb={cardDb}
            prohibitions={prohibitions}
            activeDragType={null}
            activeDrag={null}
            refreshWave={false}
            canInteract={false}
            canActivateMain={false}
            canDragCounter={false}
            inBlockStep
            selectedBlockerId={null}
            setSelectedBlockerId={vi.fn()}
            onAction={vi.fn()}
            onPreviewZone={vi.fn()}
            attackerInstanceId={attackerCard?.instanceId}
            attackerCard={attackerCard}
            blockerAlreadyDeclared={blockerAlreadyDeclared}
          />
        </InteractionModeProvider>
      </ActiveEffectsProvider>,
    );
  });

  if (!renderer) throw new Error("PlayerField renderer did not mount");
  return (
    renderer.root.findByProps({
      "data-testid": `field-card-${character.instanceId}`,
    }).props["data-blocker-selectable"] === "true"
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

describe("PlayerField blocker eligibility", () => {
  it("offers a character with printed Blocker", () => {
    expect(renderBlockerEligibility({ character: printedBlocker })).toBe(true);
  });

  it("offers a vanilla character granted Blocker at runtime", () => {
    expect(
      renderBlockerEligibility({
        character: vanillaBlocker,
        activeEffects: [keywordEffect(vanillaBlocker.instanceId, "BLOCKER")],
      }),
    ).toBe(true);
  });

  it("ignores a runtime Blocker grant for a different instance", () => {
    expect(
      renderBlockerEligibility({
        character: vanillaBlocker,
        activeEffects: [keywordEffect("different-card", "BLOCKER")],
      }),
    ).toBe(false);
  });

  it("offers no blocker when the attacker has runtime Unblockable", () => {
    expect(
      renderBlockerEligibility({
        character: printedBlocker,
        attackerCard: attacker,
        activeEffects: [keywordEffect(attacker.instanceId, "UNBLOCKABLE")],
      }),
    ).toBe(false);
  });

  it("offers no blocker after one was declared in the battle", () => {
    expect(
      renderBlockerEligibility({
        character: printedBlocker,
        blockerAlreadyDeclared: true,
      }),
    ).toBe(false);
  });
});

describe("PlayerField blocker prohibition eligibility", () => {
  it("hides a blocker matching an Usopp-style power prohibition", () => {
    expect(
      renderBlockerEligibility({
        character: highPowerBlocker,
        prohibitions: [
          blockerProhibition("CANNOT_ACTIVATE_BLOCKER", {
            controller: 1,
            scope: { controller: "OPPONENT", filter: { power_min: 5000 } },
          }),
        ],
      }),
    ).toBe(false);
  });

  it("keeps a blocker outside an Usopp-style power prohibition", () => {
    expect(
      renderBlockerEligibility({
        character: lowPowerBlocker,
        prohibitions: [
          blockerProhibition("CANNOT_ACTIVATE_BLOCKER", {
            controller: 1,
            scope: { controller: "OPPONENT", filter: { power_min: 5000 } },
          }),
        ],
      }),
    ).toBe(true);
  });

  it("hides a blocker covered by CANNOT_BE_RESTED", () => {
    expect(
      renderBlockerEligibility({
        character: printedBlocker,
        prohibitions: [
          blockerProhibition("CANNOT_BE_RESTED", {
            appliesTo: [printedBlocker.instanceId],
          }),
        ],
      }),
    ).toBe(false);
  });

  it.each(["CANNOT_BLOCK", "CANNOT_USE_BLOCKER"] as const)(
    "hides a blocker covered by %s",
    (prohibitionType) => {
      expect(
        renderBlockerEligibility({
          character: printedBlocker,
          prohibitions: [
            blockerProhibition(prohibitionType, {
              appliesTo: [printedBlocker.instanceId],
            }),
          ],
        }),
      ).toBe(false);
    },
  );

  it("keeps a printed-cost-3 blocker whose effective cost is 5", () => {
    const broadcastBlocker = {
      ...printedBlocker,
      effectiveCost: 5,
    } as CardInstance & { effectiveCost: number };

    expect(
      renderBlockerEligibility({
        character: broadcastBlocker,
        prohibitions: [
          blockerProhibition("CANNOT_ACTIVATE_BLOCKER", {
            controller: 1,
            scope: { controller: "OPPONENT", filter: { cost_max: 3 } },
          }),
        ],
      }),
    ).toBe(true);
  });

  it("hides a printed-cost-3 blocker with broadcast effective cost 0", () => {
    const broadcastBlocker = {
      ...printedBlocker,
      effectiveCost: 0,
    } as CardInstance & { effectiveCost: number };

    expect(
      renderBlockerEligibility({
        character: broadcastBlocker,
        prohibitions: [
          blockerProhibition("CANNOT_ACTIVATE_BLOCKER", {
            controller: 1,
            scope: { controller: "OPPONENT", filter: { cost_max: 0 } },
          }),
        ],
      }),
    ).toBe(false);
  });
});

describe("PlayerField aura-granted Blocker eligibility", () => {
  it("offers a character listed by a broadcast Blocker aura", () => {
    const auraGrant: ActiveEffect = {
      id: "saldeath-blocker-aura",
      sourceCardInstanceId: "saldeath-source",
      appliesTo: [vanillaBlocker.instanceId],
      modifiers: [{ type: "GRANT_KEYWORD", params: { keyword: "BLOCKER" } }],
    };

    expect(
      renderBlockerEligibility({
        character: vanillaBlocker,
        activeEffects: [auraGrant],
      }),
    ).toBe(true);
  });
});

function blockerProhibition(
  prohibitionType:
    | "CANNOT_ACTIVATE_BLOCKER"
    | "CANNOT_BE_RESTED"
    | "CANNOT_BLOCK"
    | "CANNOT_USE_BLOCKER",
  overrides: Record<string, unknown> = {},
): ActiveProhibition {
  return {
    id: `prohibition-${prohibitionType.toLowerCase()}`,
    sourceCardInstanceId: "source-1",
    prohibitionType,
    controller: 0,
    appliesTo: [],
    scope: {},
    usesRemaining: null,
    ...overrides,
  } as unknown as ActiveProhibition;
}

// OPT-834: OP16-048 can grant [Blocker] to an all-names Leader; the Leader is
// then a Block Step candidate on the same terms as a Character.
describe("PlayerField Leader blocker eligibility", () => {
  const leader: CardInstance = {
    ...makeCard("leader-1", "LEADER"),
    zone: "LEADER",
  };

  function renderLeader({
    card = leader,
    activeEffects = [],
    prohibitions = [],
    selectedBlockerId = null,
    setSelectedBlockerId = vi.fn(),
  }: {
    card?: CardInstance;
    activeEffects?: ActiveEffect[];
    prohibitions?: ActiveProhibition[];
    selectedBlockerId?: string | null;
    setSelectedBlockerId?: (id: string | null) => void;
  } = {}) {
    act(() => {
      renderer = create(
        <ActiveEffectsProvider value={activeEffects}>
          <InteractionModeProvider value="full">
            <PlayerField
              me={{ ...makePlayer(printedBlocker), leader: card }}
              playerIndex={0}
              bottomPlayerIndex={0}
              owner="me"
              cardDb={cardDb}
              prohibitions={prohibitions}
              activeDragType={null}
              activeDrag={null}
              refreshWave={false}
              canInteract={false}
              canActivateMain={false}
              canDragCounter={false}
              inBlockStep
              selectedBlockerId={selectedBlockerId}
              setSelectedBlockerId={setSelectedBlockerId}
              onAction={vi.fn()}
              onPreviewZone={vi.fn()}
            />
          </InteractionModeProvider>
        </ActiveEffectsProvider>,
      );
    });
    if (!renderer) throw new Error("PlayerField renderer did not mount");
    return renderer.root.findByProps({
      "data-testid": `field-card-${card.instanceId}`,
    });
  }

  it("offers an active Leader granted Blocker, and selecting it records the Leader", () => {
    const setSelectedBlockerId = vi.fn();
    const node = renderLeader({
      activeEffects: [keywordEffect(leader.instanceId, "BLOCKER")],
      setSelectedBlockerId,
    });
    expect(node.props["data-blocker-selectable"]).toBe("true");
    act(() => node.props.onClick());
    expect(setSelectedBlockerId).toHaveBeenCalledWith(leader.instanceId);
  });

  it("marks the selected Leader blocker", () => {
    const node = renderLeader({
      activeEffects: [keywordEffect(leader.instanceId, "BLOCKER")],
      selectedBlockerId: leader.instanceId,
    });
    expect(node.props["data-selected"]).toBe("true");
  });

  it("does not offer a Leader without a Blocker grant", () => {
    const node = renderLeader();
    expect(node.props["data-blocker-selectable"]).toBe("false");
    expect(node.props.onClick).toBeUndefined();
  });

  it("does not offer a rested Leader even with a Blocker grant", () => {
    const node = renderLeader({
      card: { ...leader, state: "RESTED" },
      activeEffects: [keywordEffect(leader.instanceId, "BLOCKER")],
    });
    expect(node.props["data-blocker-selectable"]).toBe("false");
  });

  it("does not offer a Leader whose Blocker is prohibited", () => {
    const node = renderLeader({
      activeEffects: [keywordEffect(leader.instanceId, "BLOCKER")],
      prohibitions: [
        blockerProhibition("CANNOT_BLOCK", { appliesTo: [leader.instanceId] }),
      ],
    });
    expect(node.props["data-blocker-selectable"]).toBe("false");
  });
});
