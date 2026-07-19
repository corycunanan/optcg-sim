import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  EffectAvailability,
} from "@shared/game-types";
import { EffectAvailabilityProvider } from "@/contexts/effect-availability-context";
import { CardTooltipContent } from "./card-tooltip-content";

const EFFECT_WRAPPER_CLASS =
  "text-xs text-gb-text leading-relaxed border-t border-gb-border-strong pt-3 flex flex-col gap-2";
const LEGACY_EFFECT_TEXT =
  "[On Play] Draw 1 card.  \n[Activate: Main] Rest this card. \t\n\nTrailing paragraph.  ";

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
  effectText: LEGACY_EFFECT_TEXT,
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

interface RenderOptions {
  cardData?: CardData;
  cardInstance?: CardInstance | null;
  effectAvailability?: Record<string, EffectAvailability[]>;
  withProvider?: boolean;
  attachedDonCount?: number;
}

function renderTooltip({
  cardData = data,
  cardInstance = card,
  effectAvailability,
  withProvider = true,
  attachedDonCount,
}: RenderOptions = {}) {
  const tooltip = (
    <CardTooltipContent
      data={cardData}
      cardId={cardData.id}
      card={cardInstance}
      attachedDonCount={attachedDonCount}
    />
  );

  return renderToStaticMarkup(
    withProvider ? (
      <EffectAvailabilityProvider effectAvailability={effectAvailability}>
        {tooltip}
      </EffectAvailabilityProvider>
    ) : (
      tooltip
    )
  );
}

function extractEffectBody(markup: string): string {
  const opening = `<div class="${EFFECT_WRAPPER_CLASS}">`;
  const start = markup.indexOf(opening);
  if (start === -1) throw new Error("Effect body not found");
  const end = markup.indexOf("</div>", start);
  if (end === -1) throw new Error("Effect body did not close");
  return markup.slice(start, end + "</div>".length);
}

function legacyEffectBody(effectText: string): string {
  const paragraphs = effectText
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p class="whitespace-pre-wrap">${paragraph}</p>`
    )
    .join("");

  return `<div class="${EFFECT_WRAPPER_CLASS}">${paragraphs}</div>`;
}

function expectLegacyEffectBody(markup: string, effectText = LEGACY_EFFECT_TEXT) {
  expect(extractEffectBody(markup)).toBe(legacyEffectBody(effectText));
}

function openingTagForBlock(effectBody: string, blockId: string): string {
  const marker = `data-effect-block="${blockId}"`;
  const markerIndex = effectBody.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Block ${blockId} not found`);
  const start = effectBody.lastIndexOf("<span", markerIndex);
  const end = effectBody.indexOf(">", markerIndex);
  return effectBody.slice(start, end + 1);
}

describe("CardTooltipContent effect availability", () => {
  it("preserves exact legacy paragraphs outside the provider", () => {
    expectLegacyEffectBody(renderTooltip({ withProvider: false }));
  });

  it("preserves exact legacy paragraphs when the provider has no card entries", () => {
    expectLegacyEffectBody(renderTooltip({ effectAvailability: {} }));
  });

  it("preserves exact legacy paragraphs when the card instance is null", () => {
    expectLegacyEffectBody(
      renderTooltip({
        cardInstance: null,
        effectAvailability: {
          "card-1": [{ effectId: "on-play", status: "usable" }],
        },
      })
    );
  });

  it("preserves exact legacy paragraphs for an unparseable schema", () => {
    expectLegacyEffectBody(
      renderTooltip({
        cardData: { ...data, effectSchema: null },
        effectAvailability: {
          "card-1": [{ effectId: "on-play", status: "usable" }],
        },
      })
    );
  });

  it("preserves exact legacy paragraphs when every clause is ambiguous", () => {
    const ambiguousData: CardData = {
      ...data,
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
          {
            id: "activate-main-a",
            category: "activated",
            trigger: { keyword: "ACTIVATE_MAIN" },
          },
          {
            id: "activate-main-b",
            category: "activated",
            trigger: { keyword: "ACTIVATE_MAIN" },
          },
        ],
      },
    };

    expectLegacyEffectBody(
      renderTooltip({
        cardData: ambiguousData,
        effectAvailability: {
          "card-1": [{ effectId: "on-play-a", status: "usable" }],
        },
      })
    );
  });

  it("styles only the matching clause while preserving raw clause text", () => {
    const effectBody = extractEffectBody(
      renderTooltip({
        effectAvailability: {
          "card-1": [
            { effectId: "on-play", status: "usable" },
            {
              effectId: "activate-main",
              status: "blocked",
              reason: "COST",
            },
          ],
        },
      })
    );
    const usableTag = openingTagForBlock(effectBody, "on-play");
    const blockedTag = openingTagForBlock(effectBody, "activate-main");

    expect(usableTag).toContain("border-l-2");
    expect(usableTag).toContain("border-gold-500");
    expect(usableTag).not.toContain("text-gb-text-muted");
    expect(blockedTag).toContain("text-gb-text-muted");
    expect(blockedTag).not.toContain("border-l-2");
    expect(effectBody).toContain("[On Play] Draw 1 card.  ");
    expect(effectBody).toContain("[Activate: Main] Rest this card. \t");
    expect(effectBody).toContain("Trailing paragraph.  ");
    expect(effectBody).toContain("cost unavailable");
  });
});

describe("CardTooltipContent attached DON detail", () => {
  it("shows the attached DON count for an expanded field-card tooltip", () => {
    const markup = renderTooltip({
      cardInstance: {
        ...card,
        attachedDon: [
          { instanceId: "don-1", state: "ACTIVE", attachedTo: card.instanceId },
          { instanceId: "don-2", state: "RESTED", attachedTo: card.instanceId },
        ],
      },
    });

    expect(markup).toContain("Attached DON");
    expect(markup).toContain(">2</span>");
  });

  it("uses the displayed preview count while DON redistribution is pending", () => {
    const markup = renderTooltip({
      cardInstance: card,
      attachedDonCount: 1,
    });

    expect(markup).toContain("Attached DON");
    expect(markup).toContain(">1</span>");
  });
});
