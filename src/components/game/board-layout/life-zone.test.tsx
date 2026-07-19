import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lifeDamageImpact } from "@/lib/motion";
import { LifeZone } from "./life-zone";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  motion: { div: "div" },
  useReducedMotion: () => motionState.reduced,
}));

vi.mock("@/contexts/zone-position-context", () => ({
  useZonePosition: () => ({ register: vi.fn(), unregister: vi.fn() }),
}));

vi.mock("../card", () => ({
  Card: () => <div data-testid="card" />,
}));

vi.mock("./pile-receipt", () => ({
  PileReceipt: ({ children }: { children: React.ReactNode }) => children,
}));

let renderer: ReactTestRenderer | null = null;

function renderLifeZone(props: {
  triggerPulse?: boolean;
  damagePulseNonce?: number;
  scryPulseNonce?: number;
  onInspect?: () => void;
}) {
  act(() => {
    renderer = create(
      <LifeZone
        life={[]}
        cardDb={{}}
        zoneKey="p-life"
        style={{ position: "absolute", left: 0, top: 0 }}
        {...props}
      />
    );
  });
  if (!renderer) throw new Error("LifeZone renderer did not mount");
  return renderer.root;
}

beforeEach(() => {
  motionState.reduced = false;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("LifeZone battle feedback", () => {
  it("exposes the life pile as a labeled group", () => {
    const root = renderLifeZone({});

    expect(
      root.findByProps({
        role: "group",
        "aria-label": "Your life area, 0 cards",
      }),
    ).toBeDefined();
  });

  it("exposes an accessible inspection action when preview is available", () => {
    const onInspect = vi.fn();
    const root = renderLifeZone({ onInspect });
    const control = root.findByProps({
      role: "button",
      "aria-label": "Your life area, 0 cards. Inspect life",
    });

    act(() => control.props.onClick());
    expect(onInspect).toHaveBeenCalledTimes(1);

    act(() =>
      control.props.onKeyDown({
        key: "Enter",
        preventDefault: vi.fn(),
      }),
    );
    expect(onInspect).toHaveBeenCalledTimes(2);
  });

  it("renders an amber Trigger pulse on the zone container", () => {
    const root = renderLifeZone({ triggerPulse: true });
    const ring = root
      .findAllByType("div")
      .find((node) =>
        String(node.props.className).includes("ring-gb-accent-amber")
      );

    expect(ring).toBeDefined();
    expect(ring?.props.className).toContain("ring-4");
  });

  it("renders a distinct red shake/flash for life damage", () => {
    const root = renderLifeZone({ damagePulseNonce: 1 });
    const container = root.findAllByType("div")[0];

    expect(container.props.className).toContain("ring-gb-accent-red");
    expect(container.props.animate.x).toEqual(lifeDamageImpact.x);
    expect(container.props.animate.opacity).toEqual(lifeDamageImpact.opacity);
  });

  it("renders a cool blue inspection pulse for LIFE_SCRIED", () => {
    const root = renderLifeZone({ scryPulseNonce: 1 });
    const ring = root
      .findAllByType("div")
      .find((node) => String(node.props.className).includes("ring-gb-accent-blue"));

    expect(ring).toBeDefined();
    expect(ring?.props.className).not.toContain("ring-gb-accent-amber");
  });

  it("gives Trigger precedence over scry in an ST07-016-style collision", () => {
    const root = renderLifeZone({ triggerPulse: true, scryPulseNonce: 1 });
    const classes = root
      .findAllByType("div")
      .map((node) => String(node.props.className))
      .join(" ");

    expect(classes).toContain("ring-gb-accent-amber");
    expect(classes).not.toContain("ring-gb-accent-blue");
  });

  it("gives damage precedence over Trigger and scry feedback", () => {
    const root = renderLifeZone({
      triggerPulse: true,
      damagePulseNonce: 1,
      scryPulseNonce: 1,
    });
    const classes = root
      .findAllByType("div")
      .map((node) => String(node.props.className))
      .join(" ");

    expect(classes).toContain("ring-gb-accent-red");
    expect(classes).not.toContain("ring-gb-accent-amber");
    expect(classes).not.toContain("ring-gb-accent-blue");
  });

  it("suppresses all zone effects for reduced motion", () => {
    motionState.reduced = true;
    const root = renderLifeZone({
      triggerPulse: true,
      damagePulseNonce: 1,
      scryPulseNonce: 1,
    });
    const classes = root
      .findAllByType("div")
      .map((node) => String(node.props.className))
      .join(" ");

    expect(classes).not.toContain("ring-gb-accent-amber");
    expect(classes).not.toContain("ring-gb-accent-red");
    expect(classes).not.toContain("ring-gb-accent-blue");
  });
});
