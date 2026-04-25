// Curated CardData bundle for the Animation Sandbox. Each entry is a real
// card snapshot copied from the live DB; the sandbox passes this object as
// the `cardDb` prop on `BoardLayout` so scenarios can reference card IDs
// without hitting `useCardDatabase`, the API, or remote fetches.
//
// Coverage is hand-picked to satisfy the animation cases enumerated in
// OPT-287 (per-color leaders, vanilla Character, Blocker, Counter,
// Double Attack, Rush, [On Play] prompt, [On K.O.] trigger, Event with
// [Trigger], Stage, high-cost Character). Add a new entry below when a
// scenario needs a card outside this set.

import type { CardData } from "@shared/game-types";
import { extractKeywords } from "@/lib/game/keywords";

const IMG_BASE = "https://optcg-images.corymcunanan.workers.dev/cards";

type SandboxCardInput = Omit<
  CardData,
  "keywords" | "effectSchema" | "imageUrl"
> & {
  imageUrl?: string;
};

function build(input: SandboxCardInput): CardData {
  return {
    ...input,
    keywords: extractKeywords(input.effectText, input.triggerText),
    effectSchema: null,
    imageUrl: input.imageUrl ?? `${IMG_BASE}/${input.id}.webp`,
  };
}

const SANDBOX_CARDS: SandboxCardInput[] = [
  // ─── Leaders ────────────────────────────────────────────────
  {
    id: "OP01-001",
    name: "Roronoa Zoro",
    type: "Leader",
    color: ["Red"],
    cost: null,
    power: 5000,
    counter: null,
    life: 5,
    attribute: ["Slash"],
    types: ["Supernovas", "Straw Hat Crew"],
    effectText: "[DON!! x1] [Your Turn] All of your Characters gain +1000 power.",
    triggerText: null,
  },
  {
    id: "OP01-060",
    name: "Donquixote Doflamingo",
    type: "Leader",
    color: ["Blue"],
    cost: null,
    power: 5000,
    counter: null,
    life: 5,
    attribute: ["Special"],
    types: ["The Seven Warlords of the Sea", "Donquixote Pirates"],
    effectText:
      "[DON!! x2] [When Attacking] ➀ (You may rest the specified number of DON!! cards in your cost area.): Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested.",
    triggerText: null,
  },
  {
    id: "OP01-031",
    name: "Kouzuki Oden",
    type: "Leader",
    color: ["Green"],
    cost: null,
    power: 5000,
    counter: null,
    life: 5,
    attribute: ["Slash"],
    types: ["Land of Wano", "Kouzuki Clan"],
    effectText:
      "[Activate: Main] [Once Per Turn] You can trash 1 {Land of Wano} type card from your hand: Set up to 2 of your DON!! cards as active.",
    triggerText: null,
  },

  // ─── Red roster ─────────────────────────────────────────────
  {
    // Vanilla 1-cost Character — "summon arrival" demos.
    id: "OP01-010",
    name: "Komachiyo",
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 3000,
    counter: 1000,
    life: null,
    attribute: ["Strike"],
    types: ["Animal", "Land of Wano"],
    effectText: "",
    triggerText: null,
  },
  {
    // [Blocker] — combat/blocker-intercepts.
    id: "ST01-006",
    name: "Tony Tony.Chopper",
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 1000,
    counter: null,
    life: null,
    attribute: ["Strike"],
    types: ["Animal", "Straw Hat Crew"],
    effectText:
      "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
    triggerText: null,
  },
  {
    // 2000-counter vanilla — combat/counter-from-hand.
    id: "OP11-003",
    name: "Usopp",
    type: "Character",
    color: ["Red"],
    cost: 5,
    power: 6000,
    counter: 2000,
    life: null,
    attribute: ["Ranged"],
    types: ["Straw Hat Crew"],
    effectText: "",
    triggerText: null,
  },
  {
    // Native [Rush] — combat/rush-attack.
    id: "OP01-025",
    name: "Roronoa Zoro",
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 5000,
    counter: null,
    life: null,
    attribute: ["Slash"],
    types: ["Supernovas", "Straw Hat Crew"],
    effectText:
      "[Rush] (This card can attack on the turn in which it is played.)",
    triggerText: null,
  },
  {
    // Pure [Double Attack] — combat/double-attack-vs-life.
    id: "P-028",
    name: "Portgas.D.Ace",
    type: "Character",
    color: ["Red"],
    cost: 5,
    power: 6000,
    counter: null,
    life: null,
    attribute: ["Special"],
    types: ["Whitebeard Pirates"],
    effectText: "[Double Attack] (This card deals 2 damage.)",
    triggerText: null,
  },
  {
    // [On Play] target — effects/on-play-select-target.
    id: "OP05-010",
    name: "Nico Robin",
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 2000,
    counter: 1000,
    life: null,
    attribute: ["Strike"],
    types: ["Straw Hat Crew"],
    effectText:
      "[On Play] K.O. up to 1 of your opponent's Characters with 1000 power or less.",
    triggerText: null,
  },
  {
    // Event with [Trigger] — prompts/reveal-trigger.
    id: "OP01-030",
    name: "In Two Years!! At the Sabaody Archipelago!!",
    type: "Event",
    color: ["Red"],
    cost: 1,
    power: null,
    counter: null,
    life: null,
    attribute: [],
    types: ["Straw Hat Crew"],
    effectText:
      "[Main] Look at 5 cards from the top of your deck; reveal up to 1 {Straw Hat Crew} type Character card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    triggerText: "[Trigger] Activate this card's [Main] effect.",
  },

  // ─── Blue roster ────────────────────────────────────────────
  {
    id: "OP02-060",
    name: "Mohji",
    type: "Character",
    color: ["Blue"],
    cost: 1,
    power: 3000,
    counter: 1000,
    life: null,
    attribute: ["Strike"],
    types: ["Animal", "Buggy Pirates"],
    effectText: "",
    triggerText: null,
  },
  {
    id: "OP03-052",
    name: "Merry",
    type: "Character",
    color: ["Blue"],
    cost: 1,
    power: 3000,
    counter: 1000,
    life: null,
    attribute: ["Wisdom"],
    types: ["East Blue", "Kuroneko Pirates"],
    effectText: "",
    triggerText: null,
  },
  {
    // Stage card — movement scenarios using stage zone.
    id: "OP09-060",
    name: "Emptee Bluffs Island",
    type: "Stage",
    color: ["Blue"],
    cost: 1,
    power: null,
    counter: null,
    life: null,
    attribute: [],
    types: ["Cross Guild"],
    effectText:
      "[Activate: Main] You may place 2 cards from your hand at the bottom of your deck in any order and rest this Stage: If your Leader has the {Cross Guild} type, draw 2 cards.",
    triggerText: null,
  },

  // ─── Green roster ───────────────────────────────────────────
  {
    id: "OP01-036",
    name: "Otsuru",
    type: "Character",
    color: ["Green"],
    cost: 1,
    power: 3000,
    counter: 1000,
    life: null,
    attribute: ["Wisdom"],
    types: ["Land of Wano"],
    effectText: "",
    triggerText: null,
  },
  {
    id: "OP02-033",
    name: "Jinbe",
    type: "Character",
    color: ["Green"],
    cost: 2,
    power: 4000,
    counter: 1000,
    life: null,
    attribute: ["Strike"],
    types: ["Fish-Man", "Sun Pirates"],
    effectText: "",
    triggerText: null,
  },
  {
    // High-cost Green Character — DON-attach demos.
    id: "OP13-028",
    name: "Shanks",
    type: "Character",
    color: ["Green"],
    cost: 10,
    power: 12000,
    counter: null,
    life: null,
    attribute: ["Slash"],
    types: ["FILM", "The Four Emperors", "Red-Haired Pirates"],
    effectText:
      "[On Play] Set all of your DON!! cards as active. Then, you cannot play cards from your hand during this turn.",
    triggerText: null,
  },

  // ─── Cross-color utility ────────────────────────────────────
  {
    // [On K.O.] trigger — ko/character-koed-by-effect.
    id: "OP02-087",
    name: "Minotaur",
    type: "Character",
    color: ["Purple"],
    cost: 4,
    power: 5000,
    counter: 1000,
    life: null,
    attribute: ["Strike"],
    types: ["Impel Down", "Jailer Beast"],
    effectText:
      "[Double Attack] (This card deals 2 damage.)\n[On K.O.] If your Leader has the {Impel Down} type, add up to 1 DON!! card from your DON!! deck and rest it.",
    triggerText: null,
  },
  {
    // High-cost Character — DON-attach demos.
    id: "OP14-069",
    name: "Donquixote Doflamingo",
    type: "Character",
    color: ["Purple"],
    cost: 10,
    power: 10000,
    counter: null,
    life: null,
    attribute: ["Special"],
    types: ["The Seven Warlords of the Sea", "Donquixote Pirates"],
    effectText:
      "[On Play] DON!! −3: Choose one:\n• If your Leader has the {Donquixote Pirates} type, K.O. up to 1 of your opponent's Characters with a cost of 8 or less.\n• Up to 3 of your opponent's Characters with a cost of 7 or less cannot be rested until the end of your opponent's next End Phase.",
    triggerText: null,
  },
];

export const SANDBOX_CARD_DB: Record<string, CardData> = Object.fromEntries(
  SANDBOX_CARDS.map((c) => [c.id, build(c)]),
);

export const SANDBOX_CARD_IDS = SANDBOX_CARDS.map((c) => c.id);
