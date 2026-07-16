import { describe, expect, it } from "vitest";
import {
  BLOCKED_REASON_COPY,
  parseEffectBlocks,
  segmentEffectText,
} from "@/lib/game/effect-clauses";

describe("parseEffectBlocks", () => {
  it("safely narrows schema effects to the client view", () => {
    expect(
      parseEffectBlocks({
        effects: [
          {
            id: "on_play_search",
            category: "auto",
            trigger: { keyword: "ON_PLAY", once_per_turn: true },
          },
          { id: "permanent", category: "permanent" },
          { id: 12, category: "auto" },
          null,
        ],
      })
    ).toEqual([
      {
        id: "on_play_search",
        category: "auto",
        triggerKeyword: "ON_PLAY",
      },
      { id: "permanent", category: "permanent" },
    ]);
  });

  it.each([null, undefined, {}, { effects: null }, { effects: "invalid" }])(
    "returns an empty list for malformed schema %#",
    (schema) => {
      expect(parseEffectBlocks(schema)).toEqual([]);
    }
  );
});

describe("segmentEffectText", () => {
  it.each([
    ["[Activate: Main]", "ACTIVATE_MAIN"],
    ["[On Play]", "ON_PLAY"],
    ["[When Attacking]", "WHEN_ATTACKING"],
    ["[When Attacked]", "WHEN_ATTACKED"],
    ["[On K.O.]", "ON_KO"],
    ["[On Block]", "ON_BLOCK"],
    ["[On Your Opponent's Attack]", "ON_OPPONENT_ATTACK"],
    ["[Counter]", "COUNTER"],
    ["[Main]", "MAIN_EVENT"],
    ["[Trigger]", "TRIGGER"],
    ["[End of Your Turn]", "END_OF_YOUR_TURN"],
    ["[End of Your Opponent's Turn]", "END_OF_OPPONENT_TURN"],
    ["[Start of Your Turn]", "START_OF_TURN"],
  ])("maps the %s timing token to %s", (token, triggerKeyword) => {
    expect(
      segmentEffectText(`${token} Resolve this effect.`, [
        { id: "matched", category: "auto", triggerKeyword },
      ])[0].blockId
    ).toBe("matched");
  });

  it("skips leading DON!! and once-per-turn modifiers when finding timing", () => {
    expect(
      segmentEffectText(
        "[DON!! x2] [Activate: Main] [Once Per Turn] Resolve this effect.",
        [
          {
            id: "activate",
            category: "activate",
            triggerKeyword: "ACTIVATE_MAIN",
          },
        ]
      )[0].blockId
    ).toBe("activate");
  });

  it("maps OP16-021 Moby Dick timing clauses", () => {
    const text =
      "[On Play] If your Leader has the {Whitebeard Pirates} type, look at 3 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order.\n[Activate: Main] You may trash this Stage: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.";
    const blocks = parseEffectBlocks({
      effects: [
        {
          id: "on_play_search",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
        },
        {
          id: "activate_give_don",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
        },
      ],
    });

    expect(segmentEffectText(text, blocks)).toEqual([
      { text: text.split("\n")[0], blockId: "on_play_search" },
      { text: text.split("\n")[1], blockId: "activate_give_don" },
    ]);
  });

  it("maps OP12-021 Ipponmatsu's bare permanent and leaves Blocker neutral", () => {
    const text =
      "If your Leader has the Slash attribute and you have 6 or more rested DON!! cards, this Character cannot be rested by your opponent's effects.\n[Blocker]";
    const blocks = parseEffectBlocks({
      effects: [
        {
          id: "OP12-021_keywords",
          category: "permanent",
          flags: { keywords: ["BLOCKER"] },
        },
        { id: "OP12-021_cannot_be_rested", category: "permanent" },
      ],
    });

    expect(segmentEffectText(text, blocks)).toEqual([
      {
        text: text.split("\n")[0],
        blockId: "OP12-021_cannot_be_rested",
      },
      { text: "[Blocker]", blockId: null },
    ]);
  });

  it("treats OP16-003 Edward.Newgate's Your Turn token as a modifier", () => {
    const text =
      "[Your Turn] Your Leader gains [Double Attack] and +2000 power.\n[On Play] You may reveal 2 Character cards with 8000 power from your hand: Give up to 1 of your opponent's Characters −6000 power during this turn.";
    const blocks = parseEffectBlocks({
      effects: [
        { id: "your_turn_leader_double_attack_power", category: "permanent" },
        {
          id: "on_play_reveal_debuff",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
        },
      ],
    });

    expect(
      segmentEffectText(text, blocks).map((clause) => clause.blockId)
    ).toEqual([
      "your_turn_leader_double_attack_power",
      "on_play_reveal_debuff",
    ]);
  });

  it("leaves same-trigger clauses neutral when matching is ambiguous", () => {
    const blocks = [
      { id: "first", category: "auto", triggerKeyword: "ON_PLAY" },
      { id: "second", category: "auto", triggerKeyword: "ON_PLAY" },
    ];

    expect(
      segmentEffectText(
        "[On Play] First effect.\n[On Play] Second effect.",
        blocks
      )
    ).toEqual([
      { text: "[On Play] First effect.", blockId: null },
      { text: "[On Play] Second effect.", blockId: null },
    ]);
  });

  it("keeps keyword-only reminder text neutral", () => {
    expect(
      segmentEffectText(
        "[Rush] (This card can attack on the turn in which it is played.)",
        [{ id: "permanent", category: "permanent" }]
      )
    ).toEqual([
      {
        text: "[Rush] (This card can attack on the turn in which it is played.)",
        blockId: null,
      },
    ]);
  });

  it("returns neutral clauses for empty or malformed block input", () => {
    expect(
      segmentEffectText("[On Play] Draw 1 card.\nBare effect.", [])
    ).toEqual([
      { text: "[On Play] Draw 1 card.", blockId: null },
      { text: "Bare effect.", blockId: null },
    ]);
    expect(segmentEffectText("[On Play] Draw 1 card.", null as never)).toEqual([
      { text: "[On Play] Draw 1 card.", blockId: null },
    ]);
  });
});

it("exports copy for all five blocked reasons", () => {
  expect(Object.keys(BLOCKED_REASON_COPY)).toEqual([
    "COST",
    "CONDITION",
    "PHASE",
    "ONCE_PER_TURN",
    "NO_TARGET",
  ]);
});
