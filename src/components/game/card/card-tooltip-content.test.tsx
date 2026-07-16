import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  EffectAvailability,
} from "@shared/game-types";
import { EffectAvailabilityProvider } from "@/contexts/effect-availability-context";
import { CardTooltipContent } from "./card-tooltip-content";

const card: CardInstance = {
  instanceId: "card-1",
  cardId: "OP01-001",
  zone: "CHARACTER",
  state: "ACTIVE",
  attachedDon: [],
  turnPlayed: null,
  controller: 0,
  owner: 0,
};

const data: CardData = {
  id: "OP01-001",
  name: "Test Card",
  type: "Character",
  color: ["Red"],
  cost: 1,
  power: 1000,
  counter: 1000,
  life: null,
  attribute: ["Strike"],
  types: ["Test"],
  effectText: "[On Play] Draw 1 card.\n[Activate: Main] Rest this card.",
  triggerText: null,
  keywords: {
    rush: false,
    rushCharacter: false,
    doubleAttack: false,
    banish: false,
    blocker: false,
    trigger: false,
    unblockable: false,
  },
  effectSchema: {
    effects: [
      {
        id: "on-play",
        category: "triggered",
        trigger: { keyword: "ON_PLAY" },
      },
      {
        id: "activate-main",
        category: "activated",
        trigger: { keyword: "ACTIVATE_MAIN" },
      },
    ],
  },
  imageUrl: null,
};

function renderTooltip(
  effectAvailability?: Record<string, EffectAvailability[]>,
  cardData: CardData = data
) {
  return renderToStaticMarkup(
    <EffectAvailabilityProvider effectAvailability={effectAvailability}>
      <CardTooltipContent data={cardData} cardId={cardData.id} card={card} />
    </EffectAvailabilityProvider>
  );
}

describe("CardTooltipContent effect availability", () => {
  it("adds a gold affordance to usable clauses", () => {
    const markup = renderTooltip({
      "card-1": [{ effectId: "on-play", status: "usable" }],
    });

    expect(markup).toContain("border-l-2");
    expect(markup).toContain("border-gold-500");
    expect(markup).toContain("text-gb-text-bright");
  });

  it("dims blocked clauses and shows their terse reason", () => {
    const markup = renderTooltip({
      "card-1": [
        { effectId: "activate-main", status: "blocked", reason: "COST" },
      ],
    });

    expect(markup).toContain("text-gb-text-muted");
    expect(markup).toContain("cost unavailable");
  });

  it("leaves an unmapped clause neutral", () => {
    const markup = renderTooltip(undefined, {
      ...data,
      effectText: "[On Play] Draw 1 card.",
      effectSchema: {
        effects: [
          {
            id: "on-play-a",
            category: "triggered",
            trigger: { keyword: "ON_PLAY" },
          },
          {
            id: "on-play-b",
            category: "triggered",
            trigger: { keyword: "ON_PLAY" },
          },
        ],
      },
    });

    expect(markup).toContain(
      '<p class="whitespace-pre-wrap">[On Play] Draw 1 card.</p>'
    );
    expect(markup).not.toContain("border-l-2");
  });

  it("leaves mapped clauses neutral outside an availability provider", () => {
    const markup = renderToStaticMarkup(
      <CardTooltipContent data={data} cardId={data.id} card={card} />
    );

    expect(markup).toContain(
      '<p class="whitespace-pre-wrap">[On Play] Draw 1 card.</p>'
    );
    expect(markup).not.toContain("border-l-2");
    expect(markup).not.toContain("used this turn");
    expect(markup).not.toContain("cost unavailable");
  });
});
