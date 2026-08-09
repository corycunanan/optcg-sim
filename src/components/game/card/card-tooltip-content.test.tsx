import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ActiveEffect,
  CardData,
  CardInstance,
  EffectAvailability,
} from "@shared/game-types";
import { ActiveEffectsProvider } from "@/contexts/active-effects-context";
import { EffectAvailabilityProvider } from "@/contexts/effect-availability-context";
import { CardTooltip } from "../use-card-tooltip";
import { CardTooltipContent } from "./card-tooltip-content";

const EFFECT_WRAPPER_CLASS =
  "text-gb-text flex flex-col gap-3 text-xs leading-relaxed";
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
  activeEffects?: unknown[];
  withProvider?: boolean;
  attachedDonCount?: number;
}

function renderTooltip({
  cardData = data,
  cardInstance = card,
  effectAvailability,
  activeEffects,
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

  const withAvailability = withProvider ? (
    <EffectAvailabilityProvider effectAvailability={effectAvailability}>
      {tooltip}
    </EffectAvailabilityProvider>
  ) : (
    tooltip
  );

  return renderToStaticMarkup(
    activeEffects ? (
      <ActiveEffectsProvider value={activeEffects as ActiveEffect[]}>
        {withAvailability}
      </ActiveEffectsProvider>
    ) : (
      withAvailability
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

/** Tags become spaces so adjacent badge/text spans stay word-separated. */
function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Nothing is lost or invented when bracket tokens move into badges: the body's
 * text content matches the source clause text with its brackets removed.
 */
function expectContentPreserved(effectBody: string, effectText: string) {
  expect(textOf(effectBody)).toBe(
    effectText.replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim()
  );
}

function expectNoAvailabilityStyling(effectBody: string) {
  expect(effectBody).not.toContain("text-gb-text-bright");
  expect(effectBody).not.toContain("text-gb-accent-green");
  expect(effectBody).not.toContain("text-gb-text-muted");
  expect(effectBody).not.toContain("used this turn");
  expect(effectBody).not.toContain("cost unavailable");
}

/**
 * The Tier-5 structure is unconditional: every clause shows its condition
 * badges and its exact remaining text even when no availability is known.
 */
function expectUngradedClauseBody(
  markup: string,
  effectText = LEGACY_EFFECT_TEXT
): string {
  const effectBody = extractEffectBody(markup);

  expect(effectBody).toContain(">On Play</span>");
  expect(effectBody).toContain(">Activate: Main</span>");
  expect(effectBody).not.toContain("[On Play]");
  expect(effectBody).toContain("Draw 1 card.  ");
  expect(effectBody).toContain("Rest this card. \t");
  expect(effectBody).toContain("Trailing paragraph.  ");
  expectNoAvailabilityStyling(effectBody);
  expectContentPreserved(effectBody, effectText);

  return effectBody;
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
  it("badges and preserves every clause outside the provider", () => {
    expectUngradedClauseBody(renderTooltip({ withProvider: false }));
  });

  it("badges and preserves every clause when the provider has no card entries", () => {
    expectUngradedClauseBody(renderTooltip({ effectAvailability: {} }));
  });

  it("badges and preserves every clause when the card instance is null", () => {
    expectUngradedClauseBody(
      renderTooltip({
        cardInstance: null,
        effectAvailability: {
          "card-1": [{ effectId: "on-play", status: "usable" }],
        },
      })
    );
  });

  it("badges and preserves every clause for an unparseable schema", () => {
    const effectBody = expectUngradedClauseBody(
      renderTooltip({
        cardData: { ...data, effectSchema: null },
        effectAvailability: {
          "card-1": [{ effectId: "on-play", status: "usable" }],
        },
      })
    );

    expect(effectBody).not.toContain("data-effect-block");
  });

  it("badges and preserves every clause when every clause is ambiguous", () => {
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

    const effectBody = expectUngradedClauseBody(
      renderTooltip({
        cardData: ambiguousData,
        effectAvailability: {
          "card-1": [{ effectId: "on-play-a", status: "usable" }],
        },
      })
    );

    expect(effectBody).not.toContain("data-effect-block");
  });

  it("greys only the unavailable clause and keeps every clause's own text", () => {
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

    expect(usableTag).toContain("text-gb-text-bright");
    expect(usableTag).not.toContain("text-gb-text-muted");
    expect(blockedTag).toContain("text-gb-text-muted");
    // Tier 5 opts out of gold and out of every internal rule.
    expect(effectBody).not.toContain("border-l-2");
    expect(effectBody).not.toContain("gold");
    expect(effectBody).not.toContain("border-t");
    expect(effectBody).toContain("Draw 1 card.  ");
    expect(effectBody).toContain("Rest this card. \t");
    expect(effectBody).toContain("Trailing paragraph.  ");
    expect(effectBody).toContain("cost unavailable");
  });

  it("lifts each clause's leading bracket tokens into condition badges", () => {
    const effectBody = extractEffectBody(
      renderTooltip({
        cardData: {
          ...data,
          effectText: "[Activate: Main] [Once Per Turn] Rest this card.",
        },
        effectAvailability: {
          "card-1": [{ effectId: "activate-main", status: "usable" }],
        },
      })
    );

    expect(effectBody).toContain(">Activate: Main</span>");
    expect(effectBody).toContain(">Once Per Turn</span>");
    expect(effectBody).toContain("Rest this card.");
    // Badges inherit the clause colour, so they grey with it.
    expect(effectBody).not.toContain("[Activate: Main]");
  });

  it("keeps the separator between alternative timing tokens", () => {
    const effectText = "[Main]/[Counter] Draw 1 card.";
    const effectBody = extractEffectBody(
      renderTooltip({
        cardData: { ...data, effectText },
        effectAvailability: {},
      })
    );

    expect(effectBody).toContain(">Main</span><span>/</span>");
    expect(effectBody).toContain(">Counter</span>");
    expect(effectBody).toContain("Draw 1 card.");
    expectContentPreserved(effectBody, effectText);
  });

  it("greys a clause's condition badges along with the clause", () => {
    const effectBody = extractEffectBody(
      renderTooltip({
        effectAvailability: {
          "card-1": [
            {
              effectId: "activate-main",
              status: "blocked",
              reason: "CONDITION",
            },
          ],
        },
      })
    );
    const blockedTag = openingTagForBlock(effectBody, "activate-main");

    // The badge carries no colour of its own, so it inherits the greyed clause.
    expect(blockedTag).toContain("text-gb-text-muted");
    expect(effectBody).toContain(">Activate: Main</span>");
    expect(effectBody).not.toContain("text-gb-text-muted bg-gb-surface-raised");
    expect(effectBody).toContain("condition not met");
  });
});

describe("CardTooltipContent status glyph row", () => {
  function statusesIn(markup: string): string[] {
    return Array.from(
      markup.matchAll(/data-tooltip-status="([^"]+)"/g),
      (match) => match[1]
    );
  }

  it("renders no glyph row when nothing is reachable for the card", () => {
    expect(statusesIn(renderTooltip({ effectAvailability: {} }))).toEqual([]);
  });

  it("maps every availability status onto its action glyph", () => {
    const markup = renderTooltip({
      effectAvailability: {
        "card-1": [
          { effectId: "on-play", status: "usable" },
          { effectId: "activate-main", status: "active" },
        ],
      },
    });

    expect(statusesIn(markup)).toEqual(["effect-ready", "effect-active"]);
  });

  it("treats a once-per-turn block as spent and other blocks as locked", () => {
    const spent = renderTooltip({
      effectAvailability: {
        "card-1": [
          {
            effectId: "activate-main",
            status: "blocked",
            reason: "ONCE_PER_TURN",
          },
        ],
      },
    });
    const locked = renderTooltip({
      effectAvailability: {
        "card-1": [
          { effectId: "activate-main", status: "blocked", reason: "COST" },
        ],
      },
    });

    expect(statusesIn(spent)).toEqual(["effect-spent"]);
    expect(statusesIn(locked)).toEqual(["effect-locked"]);
  });

  it("shows the rested state carried on the card instance", () => {
    const markup = renderTooltip({
      cardInstance: { ...card, state: "RESTED" },
      effectAvailability: {},
    });

    expect(statusesIn(markup)).toEqual(["rested"]);
  });

  it("shows negated effects and removed keywords from the active effects", () => {
    const markup = renderTooltip({
      effectAvailability: {},
      activeEffects: [
        {
          id: "negation",
          sourceCardInstanceId: "source-1",
          appliesTo: ["card-1"],
          modifiers: [{ type: "NEGATE_EFFECTS_FLAG" }],
        },
        {
          id: "keyword-removal",
          sourceCardInstanceId: "source-2",
          appliesTo: ["card-1"],
          modifiers: [
            { type: "REMOVE_KEYWORD", params: { keyword: "BLOCKER" } },
          ],
        },
        {
          id: "someone-else",
          sourceCardInstanceId: "source-3",
          appliesTo: ["card-2"],
          modifiers: [{ type: "NEGATE_EFFECTS_FLAG" }],
        },
      ],
    });

    expect(statusesIn(markup)).toEqual([
      "effects-negated",
      "keyword-removed",
    ]);
  });

  it("keeps a screen-reader label beside every glyph", () => {
    const markup = renderTooltip({
      effectAvailability: {
        "card-1": [{ effectId: "on-play", status: "usable" }],
      },
    });

    expect(markup).toContain('class="sr-only">Effect ready</span>');
  });
});

describe("CardTooltipContent modified stats", () => {
  it("keeps the value white and points the chevron pair up for a power buff", () => {
    const markup = renderTooltip({
      effectAvailability: {},
      activeEffects: [
        {
          id: "power-buff",
          sourceCardInstanceId: "source-1",
          appliesTo: ["card-1"],
          modifiers: [{ type: "MODIFY_POWER", params: { amount: 2000 } }],
        },
      ],
    });

    expect(markup).toContain('data-chevron-pair="up"');
    expect(markup).toContain("text-gb-accent-green");
    expect(markup).toContain(">3,000</span>");
    expect(markup).toContain("text-gb-text-bright flex items-center");
  });

  it("marks a cost increase as detrimental and a cost reduction as helpful", () => {
    const increased = renderTooltip({
      effectAvailability: {},
      activeEffects: [
        {
          id: "cost-up",
          sourceCardInstanceId: "source-1",
          appliesTo: ["card-1"],
          modifiers: [{ type: "MODIFY_COST", params: { amount: 2 } }],
        },
      ],
    });
    const reduced = renderTooltip({
      effectAvailability: {},
      activeEffects: [
        {
          id: "cost-down",
          sourceCardInstanceId: "source-1",
          appliesTo: ["card-1"],
          modifiers: [{ type: "MODIFY_COST", params: { amount: -1 } }],
        },
      ],
    });

    expect(increased).toContain('data-chevron-pair="up"');
    expect(increased).toContain("text-gb-accent-red");
    expect(reduced).toContain('data-chevron-pair="down"');
    expect(reduced).toContain("text-gb-accent-green");
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

describe("CardTooltip surface contract", () => {
  function tooltipTree() {
    const tree = CardTooltip({
      data,
      cardId: data.id,
      card,
      children: <span />,
    }) as React.ReactElement<{
      delayDuration?: number;
      children?: React.ReactNode;
    }>;

    return tree;
  }

  function tooltipContentProps(): Record<string, unknown> {
    const children = React.Children.toArray(tooltipTree().props.children);
    const content = children.find(
      (child): child is React.ReactElement<Record<string, unknown>> =>
        React.isValidElement(child) &&
        typeof (child.props as { className?: unknown }).className === "string"
    );
    if (!content) throw new Error("Tooltip content not found");
    return content.props;
  }

  it("keeps the instant, right-side placement contract", () => {
    expect(tooltipTree().props.delayDuration).toBe(0);
    expect(tooltipContentProps().side).toBe("right");
    expect(tooltipContentProps().sideOffset).toBe(8);
  });

  it("paints the Tier-5 information surface on board tokens", () => {
    const props = tooltipContentProps();
    const className = String(props.className);

    expect(props["data-tier5-surface"]).toBe(true);
    expect(className).toContain("bg-gb-surface-info");
    expect(className).toContain("gb-edge-info");
    expect(className).toContain("rounded-none");
    expect(className).toContain("shadow-none");
    // No transparency, no blur, no glow, and no app-side tokens.
    expect(className).not.toContain("backdrop");
    expect(className).not.toContain("/");
    expect(className).not.toContain("bg-surface-info");
  });

  it("renders the trigger alone when there is no card data", () => {
    expect(
      renderToStaticMarkup(
        <CardTooltip data={null} cardId={undefined}>
          <span>trigger</span>
        </CardTooltip>
      )
    ).toBe("<span>trigger</span>");
  });
});
