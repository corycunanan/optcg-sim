// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChamferFrame } from "./chamfer-frame";

function frameOf(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="chamfer-frame"]')!;
}

function surfaceOf(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="chamfer-surface"]')!;
}

function classesOf(element: Element | null) {
  return element?.className.split(/\s+/) ?? [];
}

describe("ChamferFrame", () => {
  it("defaults to a borderless md frame with outer corner cuts", () => {
    const { container } = render(<ChamferFrame>Panel</ChamferFrame>);
    const frame = frameOf(container);

    expect(frame.dataset.cut).toBe("md");
    expect(frame.dataset.corners).toBe("outer");
    expect(frame.dataset.edge).toBe("none");
    expect(classesOf(frame)).toContain("chamfer-cut-md");
  });

  it("renders the borderless variant as a single clipped surface", () => {
    const { container } = render(
      <ChamferFrame surfaceClassName="bg-surface-1">Panel</ChamferFrame>
    );

    // No hairline layer: DOM depth never exceeds what the edge variant needs.
    expect(container.querySelector('[data-slot="chamfer-edge"]')).toBeNull();

    const surface = surfaceOf(container);
    expect(surface.parentElement).toBe(frameOf(container));
    expect(classesOf(surface)).toContain("chamfer-outer");
    expect(classesOf(surface)).toContain("bg-surface-1");
    expect(surface.textContent).toBe("Panel");
  });

  it.each([
    ["neutral", "chamfer-edge-neutral"],
    ["gold", "chamfer-edge-gold"],
    ["lighting", "chamfer-edge-lighting"],
  ] as const)(
    "wraps the surface in a clipped %s hairline layer",
    (edge, edgeClass) => {
      const { container } = render(
        <ChamferFrame edge={edge}>Panel</ChamferFrame>
      );
      const layer = container.querySelector<HTMLElement>(
        '[data-slot="chamfer-edge"]'
      )!;

      expect(classesOf(layer)).toContain(edgeClass);
      // Both layers carry the same polygon; the surface is inset by the hairline.
      expect(classesOf(layer)).toContain("chamfer-outer");
      expect(classesOf(layer)).toContain("p-px");
      expect(surfaceOf(container).parentElement).toBe(layer);
    }
  );

  it.each([
    ["sm", "chamfer-cut-sm"],
    ["md", "chamfer-cut-md"],
    ["lg", "chamfer-cut-lg"],
  ] as const)("sets the %s cut step once on the root", (cut, cutClass) => {
    const { container } = render(
      <ChamferFrame cut={cut} edge="neutral">
        Panel
      </ChamferFrame>
    );

    // The cut custom property inherits, so no layer restates it.
    expect(classesOf(frameOf(container))).toContain(cutClass);
    expect(classesOf(surfaceOf(container))).not.toContain(cutClass);
  });

  it("supports the symmetric four-corner cut pattern", () => {
    const { container } = render(
      <ChamferFrame corners="all" edge="gold">
        Panel
      </ChamferFrame>
    );

    for (const layer of container.querySelectorAll(
      '[data-slot="chamfer-edge"], [data-slot="chamfer-surface"]'
    )) {
      expect(classesOf(layer)).toContain("chamfer-all");
      expect(classesOf(layer)).not.toContain("chamfer-outer");
    }
  });

  it("keeps the hit target rectangular by never clipping the root", () => {
    const { container } = render(
      <ChamferFrame corners="all" edge="neutral" interactive>
        Panel
      </ChamferFrame>
    );
    const frameClasses = classesOf(frameOf(container));

    expect(frameClasses).not.toContain("chamfer-all");
    expect(frameClasses).not.toContain("chamfer-outer");
  });

  it.each(["none", "neutral", "gold", "lighting"] as const)(
    "renders a clipped focus layer on the %s edge variant",
    (edge) => {
      const { container } = render(
        <ChamferFrame edge={edge} interactive>
          Panel
        </ChamferFrame>
      );
      const focusLayer = container.querySelector<HTMLElement>(
        '[data-slot="chamfer-focus"]'
      )!;

      expect(classesOf(frameOf(container))).toContain("chamfer-focusable");
      expect(classesOf(focusLayer)).toContain("chamfer-focus-layer");
      expect(classesOf(focusLayer)).toContain("chamfer-outer");
      expect(focusLayer.getAttribute("aria-hidden")).toBe("true");
      // The halo is a direct child of the root so nested frames stay independent.
      expect(focusLayer.parentElement).toBe(frameOf(container));
    }
  );

  it("omits the focus layer for non-interactive frames", () => {
    const { container } = render(<ChamferFrame>Panel</ChamferFrame>);

    expect(container.querySelector('[data-slot="chamfer-focus"]')).toBeNull();
    expect(classesOf(frameOf(container))).not.toContain("chamfer-focusable");
  });

  it("promotes the caller's element to the root when asChild is set", () => {
    const { container } = render(
      <ChamferFrame
        asChild
        interactive
        edge="gold"
        className="block"
        surfaceClassName="bg-surface-1"
      >
        <a href="#straw-hat-aggro" className="text-content-primary">
          Straw Hat Aggro
        </a>
      </ChamferFrame>
    );
    const frame = frameOf(container);

    expect(frame.tagName).toBe("A");
    expect(frame.getAttribute("href")).toBe("#straw-hat-aggro");
    expect(classesOf(frame)).toEqual(
      expect.arrayContaining([
        "relative",
        "isolate",
        "chamfer-cut-md",
        "chamfer-focusable",
        "block",
        "text-content-primary",
      ])
    );
    // The caller's children move inside the clipped surface.
    expect(surfaceOf(container).textContent).toBe("Straw Hat Aggro");
  });

  it("forwards arbitrary props to the root", () => {
    const { container } = render(
      <ChamferFrame aria-label="Deck row" id="deck-row">
        Panel
      </ChamferFrame>
    );
    const frame = frameOf(container);

    expect(frame.id).toBe("deck-row");
    expect(frame.getAttribute("aria-label")).toBe("Deck row");
  });
});
