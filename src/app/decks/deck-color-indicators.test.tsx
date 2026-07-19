import { afterEach, describe, expect, it } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DeckColorIndicators } from "./deck-color-indicators";

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("DeckColorIndicators", () => {
  it("labels every color and renders a non-color text signifier", () => {
    act(() => {
      renderer = create(<DeckColorIndicators colors={["Red", "Blue"]} />);
    });

    const indicators = renderer!.root.findAll(
      (node) => node.props.role === "img"
    );

    expect(indicators.map((node) => node.props["aria-label"])).toEqual([
      "Red deck color",
      "Blue deck color",
    ]);
    expect(
      indicators.map((node) =>
        node
          .findAll(
            (child) =>
              child.props["aria-hidden"] === "true" &&
              child.children.some((value) => typeof value === "string")
          )[0]
          ?.children.join("")
      )
    ).toEqual(["Red", "Blue"]);
  });
});
