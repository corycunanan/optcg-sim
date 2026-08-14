import {
  act,
  create,
  type ReactTestRenderer,
  type ReactTestRendererJSON,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EffectText } from "./effect-text";

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

/** EB02-052 — two effects, a mid-sentence keyword, and a trait reference. */
const EB02_052 = [
  "If your Leader has the {Sky Island} type, this Character gains [Rush].",
  "[When Attacking] You may trash 1 card from your hand: If you have 1 or less Life cards, add up to 1 card from the top of your deck to the top of your Life cards. Then, this Character gains +1000 power during this turn.",
].join("\n");

function render(text: string) {
  act(() => {
    renderer = create(<EffectText text={text} />);
  });
  return renderer!;
}

function plainText(node: ReactTestRendererJSON | string): string {
  if (typeof node === "string") return node;
  return (node.children ?? [])
    .map((child) =>
      typeof child === "string"
        ? child
        : plainText(child as ReactTestRendererJSON)
    )
    .join("");
}

/** Text of a rendered instance, flattening any layers a chip is built from. */
type TestNode = ReactTestRenderer["root"];
function instanceText(node: TestNode): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : instanceText(child)))
    .join("");
}

describe("EffectText", () => {
  it("renders one paragraph per printed effect", () => {
    const paragraphs = render(EB02_052).root.findAllByType("p");
    expect(paragraphs).toHaveLength(2);
  });

  it("sets each recognized token as an inline chip of its family", () => {
    const chips = render(EB02_052)
      .root.findAll((node) => node.props["data-effect-notation"] !== undefined)
      .map((node) => [
        node.props["data-effect-notation"],
        instanceText(node),
      ]);

    expect(chips).toEqual([
      ["keyword", "Rush"],
      ["timing", "When Attacking"],
    ]);
  });

  it("gives the keyword and timing families distinct fills", () => {
    const [keyword, timing] = render(EB02_052).root.findAll(
      (node) => node.props["data-effect-notation"] !== undefined
    );

    // The keyword hexagon is two layers: `clip-path` does not carry a border,
    // so the frame paints the family keyline and the fill sits inside it.
    expect(keyword.props.className).toContain("effect-hex");
    expect(keyword.props.className).toContain("bg-effect-notation-edge");

    const [fill] = keyword
      .findAllByType("span")
      .filter((node) => node !== keyword);
    expect(fill.props.className).toContain("bg-effect-keyword");
    expect(fill.props.className).toContain("text-effect-keyword-fg");

    expect(timing.props.className).toContain("bg-effect-timing");
    expect(timing.props.className).not.toContain("effect-hex");
  });

  it.each(["Your Turn", "Opponent's Turn"])(
    "renders [%s] as a timing-blue chip",
    (label) => {
      const chip = render(`[${label}] Draw 1 card.`).root.find(
        (node) => node.props["data-effect-notation"] !== undefined
      );

      expect(chip.props["data-effect-notation"]).toBe("timing");
      expect(chip.props.className).toContain("bg-effect-timing");
      expect(chip.props.className).not.toContain("bg-effect-modifier");
    }
  );

  it("keeps [Once Per Turn] as a modifier-red chip", () => {
    const chip = render("[Once Per Turn] Draw 1 card.").root.find(
      (node) => node.props["data-effect-notation"] !== undefined
    );

    expect(chip.props["data-effect-notation"]).toBe("modifier");
    expect(chip.props.className).toContain("bg-effect-modifier");
    expect(chip.props.className).not.toContain("bg-effect-timing");
  });

  it("renders a trait as a quieter chip with no visible braces", () => {
    const trait = render(EB02_052).root.find(
      (node) => node.props["data-effect-trait"] !== undefined
    );

    expect(trait.props.children).toBe("Sky Island");
    expect(trait.props.className).toContain("bg-surface-2");
    expect(trait.props.className).not.toContain("bg-effect");
  });

  it("leaves no raw notation delimiters in the rendered text", () => {
    const rendered = plainText(render(EB02_052).toJSON() as ReactTestRendererJSON);

    expect(rendered).not.toContain("[");
    expect(rendered).not.toContain("{");
    expect(rendered).toContain("this Character gains Rush.");
  });

  it("keeps a referenced card name printed with its brackets", () => {
    const rendered = plainText(
      render(
        "Up to 1 of your Characters other than [Sabo] gains +2000 power."
      ).toJSON() as ReactTestRendererJSON
    );

    expect(rendered).toContain("[Sabo]");
    expect(
      renderer!.root.findAll(
        (node) => node.props["data-effect-notation"] !== undefined
      )
    ).toHaveLength(0);
  });

  it("renders trigger text led by its [Trigger] chip", () => {
    const chip = render("[Trigger] Draw 1 card.").root.find(
      (node) => node.props["data-effect-notation"] !== undefined
    );

    expect(chip.props["data-effect-notation"]).toBe("trigger");
    expect(chip.props.className).toContain("bg-effect-trigger");
    expect(chip.props.className).toContain("text-effect-trigger-fg");
  });

  it("renders effect text with no notation as a single paragraph", () => {
    const tree = render("Draw 1 card.");
    expect(tree.root.findAllByType("p")).toHaveLength(1);
    expect(plainText(tree.toJSON() as ReactTestRendererJSON)).toBe(
      "Draw 1 card."
    );
  });

  it("renders nothing when there is no effect text", () => {
    expect(render("   ").toJSON()).toBeNull();
  });

  it("preserves pre-wrap semantics on every paragraph", () => {
    for (const paragraph of render(EB02_052).root.findAllByType("p")) {
      expect(paragraph.props.className).toContain("whitespace-pre-wrap");
    }
  });
});
