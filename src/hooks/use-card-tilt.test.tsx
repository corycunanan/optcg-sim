import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCardTilt } from "./use-card-tilt";

let renderer: ReactTestRenderer | null = null;
let frameCallback: FrameRequestCallback | null = null;
let properties: Map<string, string>;

function TiltHarness() {
  const { containerRef, handlers } = useCardTilt();
  return <div ref={containerRef} {...handlers} />;
}

function renderTiltHarness({ reduceMotion = false } = {}) {
  const mediaQuery = {
    matches: reduceMotion,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } satisfies MediaQueryList;

  vi.stubGlobal("window", { matchMedia: vi.fn(() => mediaQuery) });

  const node = {
    dataset: {} as DOMStringMap,
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
    },
    getBoundingClientRect: () => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLDivElement;

  act(() => {
    renderer = create(<TiltHarness />, { createNodeMock: () => node });
  });

  if (!renderer) throw new Error("Tilt harness did not render");
  return { node, root: renderer.root.findByType("div") };
}

beforeEach(() => {
  properties = new Map();
  frameCallback = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    })
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

describe("useCardTilt", () => {
  it("writes normalized pointer and inverse background positions, then resets them", () => {
    const { node, root } = renderTiltHarness();

    act(() => root.props.onPointerEnter());
    act(() => root.props.onPointerMove({ clientX: 210, clientY: 70 }));
    act(() => frameCallback?.(0));

    expect(node.dataset.active).toBe("true");
    expect(properties.get("--pointer-from-left")).toBe("1.000");
    expect(properties.get("--pointer-from-top")).toBe("0.500");
    expect(properties.get("--background-x")).toBe("30.00%");
    expect(properties.get("--background-y")).toBe("50.00%");

    act(() => root.props.onPointerLeave());

    expect(node.dataset.active).toBe("false");
    expect(properties.get("--active")).toBe("0");
    expect(properties.get("--pointer-x")).toBe("50.00%");
    expect(properties.get("--pointer-y")).toBe("50.00%");
    expect(properties.get("--pointer-from-left")).toBe("0.500");
    expect(properties.get("--pointer-from-top")).toBe("0.500");
    expect(properties.get("--pointer-from-center")).toBe("0.000");
    expect(properties.get("--pointer-from-center-x")).toBe("0.00");
    expect(properties.get("--pointer-from-center-y")).toBe("0.00");
    expect(properties.get("--background-x")).toBe("50.00%");
    expect(properties.get("--background-y")).toBe("50.00%");
    expect(properties.get("--tilt-x")).toBe("0deg");
    expect(properties.get("--tilt-y")).toBe("0deg");
  });

  it("re-enters at neutral and activates pointer movement with fresh coordinates", () => {
    const { node, root } = renderTiltHarness();

    act(() => root.props.onPointerMove({ clientX: 190, clientY: 40 }));
    act(() => frameCallback?.(0));
    act(() => root.props.onPointerLeave());
    act(() => root.props.onPointerEnter());

    expect(node.dataset.active).toBe("true");
    expect(properties.get("--active")).toBe("1");
    expect(properties.get("--pointer-x")).toBe("50.00%");
    expect(properties.get("--pointer-y")).toBe("50.00%");

    act(() => root.props.onPointerLeave());
    act(() => root.props.onPointerMove({ clientX: 60, clientY: 95 }));
    act(() => frameCallback?.(0));

    expect(node.dataset.active).toBe("true");
    expect(properties.get("--active")).toBe("1");
    expect(properties.get("--pointer-x")).toBe("25.00%");
    expect(properties.get("--pointer-y")).toBe("75.00%");
    expect(properties.get("--pointer-from-center-x")).toBe("-25.00");
    expect(properties.get("--pointer-from-center-y")).toBe("25.00");
  });

  it("keeps pointer tracking active while reduced motion suppresses rotation", () => {
    const { root } = renderTiltHarness({ reduceMotion: true });

    act(() => root.props.onPointerMove({ clientX: 160, clientY: 20 }));
    act(() => frameCallback?.(0));

    expect(properties.get("--pointer-from-left")).toBe("0.750");
    expect(properties.get("--pointer-from-top")).toBe("0.000");
    expect(properties.get("--tilt-x")).toBe("0.00deg");
    expect(properties.get("--tilt-y")).toBe("0.00deg");
  });
});
