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
}) {
  act(() => {
    renderer = create(
      <LifeZone
        life={[]}
        cardDb={{}}
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

  it("suppresses both effects for reduced motion", () => {
    motionState.reduced = true;
    const root = renderLifeZone({
      triggerPulse: true,
      damagePulseNonce: 1,
    });
    const classes = root
      .findAllByType("div")
      .map((node) => String(node.props.className))
      .join(" ");

    expect(classes).not.toContain("ring-gb-accent-amber");
    expect(classes).not.toContain("ring-gb-accent-red");
  });
});
