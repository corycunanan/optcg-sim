import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveEffect,
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
  }: {
    card: CardInstance;
    blockerSelectable?: boolean;
  }) => (
    <div
      data-testid={`field-card-${card.instanceId}`}
      data-blocker-selectable={String(!!blockerSelectable)}
    />
  ),
}));
vi.mock("./life-zone", () => ({ LifeZone: () => null }));
vi.mock("./trash-zone", () => ({ DroppableTrashZone: () => null }));

const printedBlocker = makeCard("blocker-1", "PRINTED-BLOCKER");
const vanillaBlocker = makeCard("blocker-1", "VANILLA");
const attacker = makeCard("attacker-1", "ATTACKER", 1);

const cardDb = {
  "PRINTED-BLOCKER": {
    type: "Character",
    keywords: { blocker: true },
  },
  VANILLA: {
    type: "Character",
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
  attackerCard = null,
  blockerAlreadyDeclared = false,
}: {
  character: CardInstance;
  activeEffects?: ActiveEffect[];
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
