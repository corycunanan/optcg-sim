import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DON_OPTIONS, SLEEVE_OPTIONS } from "@/lib/deck-builder/customization";

import { DonPicker } from "./don-picker";
import { SleevePicker } from "./sleeve-picker";

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

function selectedButton() {
  return renderer!.root
    .findAllByType("button")
    .find((button) => button.props["aria-pressed"] === true);
}

describe("deck customization pickers", () => {
  it("changes the sleeve from default to custom and back to default", () => {
    function Harness() {
      const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
      return (
        <SleevePicker selectedUrl={selectedUrl} onSelect={setSelectedUrl} />
      );
    }

    act(() => {
      renderer = create(<Harness />);
    });

    const buttons = renderer!.root.findAllByType("button");
    const defaultButton = buttons[0];
    const customButton = buttons[1];

    expect(defaultButton.props["aria-label"]).toBe("Use default card sleeve");
    expect(selectedButton()).toBe(defaultButton);

    act(() => customButton.props.onClick());
    expect(customButton.props["aria-pressed"]).toBe(true);
    expect(selectedButton()?.props["aria-label"]).toBe(
      "Use card sleeve option 1"
    );
    expect(customButton.findByType("img").props.src).toBe(
      SLEEVE_OPTIONS[0].imageUrl
    );

    act(() => defaultButton.props.onClick());
    expect(defaultButton.props["aria-pressed"]).toBe(true);
    expect(selectedButton()).toBe(defaultButton);
  });

  it("changes DON art from default to custom and back to default", () => {
    function Harness() {
      const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
      return <DonPicker selectedUrl={selectedUrl} onSelect={setSelectedUrl} />;
    }

    act(() => {
      renderer = create(<Harness />);
    });

    const buttons = renderer!.root.findAllByType("button");
    const defaultButton = buttons[0];
    const customButton = buttons[1];

    expect(defaultButton.props["aria-label"]).toBe("Use default DON card art");
    expect(selectedButton()).toBe(defaultButton);

    act(() => customButton.props.onClick());
    expect(customButton.props["aria-pressed"]).toBe(true);
    expect(selectedButton()?.props["aria-label"]).toBe(
      "Use DON card art option 1"
    );
    expect(customButton.findByType("img").props.src).toBe(
      DON_OPTIONS[0].imageUrl
    );

    act(() => defaultButton.props.onClick());
    expect(defaultButton.props["aria-pressed"]).toBe(true);
    expect(selectedButton()).toBe(defaultButton);
  });

  // Each option is a raw sleeve or DON face, so it clips at the card radius
  // rather than at the Button primitive's chrome radius
  // (docs/design/SHAPE-LANGUAGE.md §The card radius). `cn()` has to resolve the
  // two, which is what the `rounded` class-group registration in utils.ts buys.
  it("clips every option at the card radius", () => {
    function Harness() {
      const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
      return (
        <SleevePicker selectedUrl={selectedUrl} onSelect={setSelectedUrl} />
      );
    }

    act(() => {
      renderer = create(<Harness />);
    });

    const buttons = renderer!.root.findAllByType("button");
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      expect(button.props.className).toContain("rounded-card");
      expect(button.props.className).toContain("aspect-card");
      expect(button.props.className).not.toContain("rounded-md");
    }
  });
});
