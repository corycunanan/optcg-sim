"use client";

import React, { useState } from "react";
import type {
  CardData,
  CardDb,
  CardInstance,
  KeywordSet,
} from "@shared/game-types";
import { Card } from "@/components/game/card";
import type { CardState, CardVariant } from "@/components/game/card";
import { Button, TooltipProvider } from "@/components/ui";

/**
 * Internal preview page for the `<Card>` primitive. Not linked from the app —
 * exists for visual QA of the variant × state matrix, the 3D flip, and the
 * size tokens.
 */

const SAMPLE_CARDS: CardData[] = [
  {
    id: "OP01-001",
    name: "Monkey.D.Luffy",
    type: "Leader",
    color: ["Red"],
    cost: null,
    power: 5000,
    counter: null,
    life: 5,
    attribute: ["Strike"],
    types: ["Supernovas", "Straw Hat Crew"],
    effectText: "[DON!! x1] Your attack is unblockable.",
    triggerText: null,
    keywords: makeEmptyKeywords(),
    effectSchema: null,
    imageUrl: "/images/cards/image%2029.png",
  },
  {
    id: "OP01-013",
    name: "Nami",
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 1000,
    counter: 1000,
    life: null,
    attribute: ["Special"],
    types: ["Straw Hat Crew"],
    effectText: "[On Play] Look at the top 5 cards of your deck…",
    triggerText: null,
    keywords: makeEmptyKeywords(),
    effectSchema: null,
    imageUrl: "/images/cards/image%2029.png",
  },
  {
    id: "OP01-025",
    name: "Roronoa Zoro",
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 5000,
    counter: 1000,
    life: null,
    attribute: ["Slash"],
    types: ["Supernovas", "Straw Hat Crew"],
    effectText: "Rush.",
    triggerText: null,
    keywords: { ...makeEmptyKeywords(), rush: true },
    effectSchema: null,
    imageUrl: "/images/cards/image%2029.png",
  },
];

const CARD_DB: CardDb = Object.fromEntries(SAMPLE_CARDS.map((c) => [c.id, c]));

const LUFFY_INSTANCE: CardInstance = {
  instanceId: "luffy-preview",
  cardId: "OP01-001",
  zone: "LEADER",
  state: "ACTIVE",
  attachedDon: [],
  turnPlayed: null,
  controller: 0,
  owner: 0,
};

const ZORO_INSTANCE: CardInstance = {
  instanceId: "zoro-preview",
  cardId: "OP01-025",
  zone: "CHARACTER",
  state: "ACTIVE",
  attachedDon: [
    { instanceId: "d1", state: "ACTIVE", attachedTo: "zoro-preview" },
    { instanceId: "d2", state: "ACTIVE", attachedTo: "zoro-preview" },
  ],
  turnPlayed: null,
  controller: 0,
  owner: 0,
};

const STATES: CardState[] = [
  "rest",
  "active",
  "selected",
  "invalid",
  "dragging",
  "in-flight",
  "attacking",
  "blocking",
  "kod",
];

const VARIANTS: CardVariant[] = ["field", "hand", "modal", "life", "trash"];

function makeEmptyKeywords(): KeywordSet {
  return {
    rush: false,
    rushCharacter: false,
    doubleAttack: false,
    banish: false,
    blocker: false,
    trigger: false,
    unblockable: false,
  };
}

export default function CardPreviewPage() {
  // Toggle meaning: "flip every card from its baseline face state." XOR'd
  // with each card's intended face so cards that default to face-down (like
  // the life-zone overlay example) flip to face-up when the toggle is on.
  const [flipped, setFlipped] = useState(false);
  const flip = (baseFaceDown: boolean) => flipped !== baseFaceDown;

  const [resting, setResting] = useState(false);

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto bg-gb-board p-8 text-gb-text">
        <div className="mx-auto max-w-6xl space-y-12">
          <header className="space-y-2">
            <h1 className="font-serif text-4xl text-gb-text-bright">
              Card Primitive Preview
            </h1>
            <p className="text-sm text-gb-text-subtle">
              Internal visual QA for the{" "}
              <code className="rounded bg-gb-surface-raised px-1 py-0.5 text-xs">
                {"<Card>"}
              </code>{" "}
              primitive (OPT-266). Not linked from the app.
            </p>
            <label className="inline-flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                checked={flipped}
                onChange={(e) => setFlipped(e.target.checked)}
                className="size-4"
              />
              <span className="text-sm">Flip all cards (face ↔ sleeve)</span>
            </label>
          </header>

          <Section title="Variants — default (state=active)">
            <Row>
              {VARIANTS.map((variant) => (
                <Labeled key={variant} label={variant}>
                  <Card
                    data={{ card: LUFFY_INSTANCE, cardDb: CARD_DB }}
                    variant={variant}
                    faceDown={flip(false)}
                  />
                </Labeled>
              ))}
            </Row>
          </Section>

          <Section title="States — variant=field">
            <Row>
              {STATES.map((state) => (
                <Labeled key={state} label={state}>
                  <Card
                    data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                    variant="field"
                    state={state}
                    faceDown={flip(false)}
                    overlays={{
                      donCount: 2,
                      highlightRing:
                        state === "selected"
                          ? "selected"
                          : state === "invalid"
                            ? "invalid"
                            : state === "attacking"
                              ? "attacker"
                              : state === "blocking"
                                ? "selected"
                                : undefined,
                    }}
                  />
                </Labeled>
              ))}
            </Row>
          </Section>

          {/* Board-cell simulation: the card sits in a SQUARE (112×112)
              slot — same footprint the character row uses on the real board
              — so the rotated silhouette reads like it does in game. */}
          <Section title="Board simulation — active ↔ rest toggle">
            <div className="flex items-center gap-6">
              <Button
                variant="secondary"
                onClick={() => setResting((r) => !r)}
                aria-pressed={resting}
              >
                {resting ? "Rest" : "Active"}
              </Button>
              <div className="flex h-28 w-28 items-center justify-center rounded bg-gb-surface/50">
                <Card
                  data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                  variant="field"
                  state={resting ? "rest" : "active"}
                  faceDown={flip(false)}
                  overlays={{ donCount: 2 }}
                />
              </div>
            </div>
          </Section>

          <Section title="Sizes — size token matrix">
            <Row>
              {(["field", "hand", "modal", "preview"] as const).map((size) => (
                <Labeled key={size} label={size}>
                  <Card
                    data={{ card: LUFFY_INSTANCE, cardDb: CARD_DB }}
                    variant="modal"
                    size={size}
                    faceDown={flip(false)}
                  />
                </Labeled>
              ))}
            </Row>
          </Section>

          <Section title="Overlays — count + DON + ring">
            <Row>
              <Labeled label="count=4">
                <Card
                  data={{ card: null, cardId: "OP01-001", cardDb: CARD_DB }}
                  variant="life"
                  faceDown={flip(true)}
                  overlays={{ countBadge: 4 }}
                />
              </Labeled>
              <Labeled label="don=3">
                <Card
                  data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                  variant="field"
                  faceDown={flip(false)}
                  overlays={{ donCount: 3 }}
                />
              </Labeled>
              <Labeled label="selected ring">
                <Card
                  data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                  variant="field"
                  state="selected"
                  faceDown={flip(false)}
                  overlays={{ highlightRing: "selected" }}
                />
              </Labeled>
              <Labeled label="invalid ring">
                <Card
                  data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                  variant="modal"
                  state="invalid"
                  faceDown={flip(false)}
                  overlays={{ highlightRing: "invalid" }}
                />
              </Labeled>
              <Labeled label="empty life">
                <Card
                  data={{ cardDb: CARD_DB }}
                  variant="life"
                  empty
                  emptyLabel="LIFE"
                />
              </Labeled>
            </Row>
          </Section>

          {/* OPT-273: battle-state rings layered on top of the game rotation
              the card would have during that battle phase. Attacker uses a
              sustained pulse, counter uses a one-shot fade, blocker is static. */}
          <Section title="Battle-state rings (OPT-273)">
            <Row>
              <Labeled label="attacker (rested)">
                <div className="flex h-28 w-28 items-center justify-center">
                  <Card
                    data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                    variant="field"
                    state="attacking"
                    faceDown={flip(false)}
                    overlays={{ donCount: 2, highlightRing: "attacker" }}
                  />
                </div>
              </Labeled>
              <Labeled label="blocker-eligible">
                <Card
                  data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                  variant="field"
                  state="active"
                  faceDown={flip(false)}
                  overlays={{ highlightRing: "blocker" }}
                />
              </Labeled>
              <Labeled label="blocker-selected">
                <Card
                  data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                  variant="field"
                  state="blocking"
                  faceDown={flip(false)}
                  overlays={{ highlightRing: "selected" }}
                />
              </Labeled>
              <Labeled label="counter pulse">
                <Card
                  data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                  variant="field"
                  state="rest"
                  faceDown={flip(false)}
                  overlays={{ highlightRing: "counter" }}
                />
              </Labeled>
              <Labeled label="KO (shrink)">
                <Card
                  data={{ card: ZORO_INSTANCE, cardDb: CARD_DB }}
                  variant="field"
                  state="kod"
                  faceDown={flip(false)}
                />
              </Labeled>
            </Row>
          </Section>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-gb-text-dim">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-6">{children}</div>;
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      <span className="text-xs text-gb-text-subtle">{label}</span>
    </div>
  );
}
