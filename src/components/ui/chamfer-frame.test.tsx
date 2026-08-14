// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { ChamferFrame } from "./chamfer-frame";

// The clipped geometry lives in CSS, so the compensation is asserted at its
// source rather than through jsdom, which does not compute `clip-path`.
const GLOBALS_CSS = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8"
);

/** The miter factor that keeps an inset polygon's diagonal 45°-uniform. */
const MITER = 2 - Math.SQRT2;

function frameOf(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="chamfer-frame"]')!;
}

function surfaceOf(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="chamfer-surface"]')!;
}

function edgeOf(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="chamfer-edge"]');
}

function castOf(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="chamfer-shadow"]');
}

function classesOf(element: Element | null) {
  return element?.className.split(/\s+/) ?? [];
}

/** The body of a `@utility <name> { … }` or `.<selector> { … }` rule. */
function cssRule(selector: string) {
  const pattern = new RegExp(
    `(?:@utility\\s+${selector}|\\.${selector}[^{}]*)\\s*\\{([^{}]*)\\}`
  );
  const match = pattern.exec(GLOBALS_CSS);
  expect(match, `expected a CSS rule for ${selector}`).not.toBeNull();
  return match![1];
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
    expect(edgeOf(container)).toBeNull();

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
      const layer = edgeOf(container)!;

      expect(classesOf(layer)).toContain(edgeClass);
      expect(classesOf(layer)).toContain("chamfer-outer");
      expect(classesOf(layer)).toContain("chamfer-hairline");
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
});

describe("ChamferFrame hairline geometry", () => {
  it("miter-compensates the inner polygon instead of reusing the outer one", () => {
    const { container } = render(
      <ChamferFrame edge="neutral">Panel</ChamferFrame>
    );

    // The two layers must not share a polygon: the surface is physically inset
    // by the hairline, so its cut is reduced to keep the diagonal 1px wide.
    expect(classesOf(edgeOf(container))).not.toContain(
      "chamfer-hairline-inset"
    );
    expect(classesOf(surfaceOf(container))).toContain("chamfer-hairline-inset");
  });

  it("omits the compensation when there is no hairline to compensate for", () => {
    const { container } = render(<ChamferFrame>Panel</ChamferFrame>);

    expect(classesOf(surfaceOf(container))).not.toContain(
      "chamfer-hairline-inset"
    );
  });

  it("reduces the inset layer's cut by (2 - sqrt2) x the hairline width", () => {
    const rule = cssRule("chamfer-hairline-inset");

    expect(rule).toMatch(/--chamfer-clip-inset:\s*0px/);

    const factor = /-\s*([0-9.]+)\s*\*\s*var\(--chamfer-hairline\)/.exec(rule);
    expect(
      factor,
      "expected a miter factor on --chamfer-hairline"
    ).not.toBeNull();
    expect(Number(factor![1])).toBeCloseTo(MITER, 6);
  });

  it("applies the same miter factor at the focus ring width", () => {
    const rule = cssRule(
      "chamfer-focusable:focus-visible > .chamfer-focus-clip"
    );

    expect(rule).toMatch(/--chamfer-clip-inset:\s*var\(--chamfer-focus-ring\)/);

    const factor =
      /-\s*([0-9.]+)\s*\*\s*\n?\s*var\(--chamfer-focus-ring\)/.exec(rule);
    expect(
      factor,
      "expected a miter factor on --chamfer-focus-ring"
    ).not.toBeNull();
    expect(Number(factor![1])).toBeCloseTo(MITER, 6);
  });
});

describe("ChamferFrame cast shadow", () => {
  it("casts nothing by default, so a flat frame keeps its node count", () => {
    const { container } = render(<ChamferFrame>Panel</ChamferFrame>);

    expect(castOf(container)).toBeNull();
    expect(classesOf(frameOf(container))).not.toContain("chamfer-shadow-none");
  });

  it.each([
    ["sm", "chamfer-shadow-sm"],
    ["md", "chamfer-shadow-md"],
    ["lg", "chamfer-shadow-lg"],
  ] as const)("pins the %s step on the root", (shadow, shadowClass) => {
    const { container } = render(
      <ChamferFrame shadow={shadow}>Panel</ChamferFrame>
    );

    expect(classesOf(frameOf(container))).toContain(shadowClass);
    expect(castOf(container)).not.toBeNull();
  });

  it("clips the cast to the frame's own polygon, uncompensated", () => {
    const { container } = render(
      <ChamferFrame corners="all" cut="lg" shadow="sm" interactive>
        Panel
      </ChamferFrame>
    );
    const cast = castOf(container)!;

    expect(classesOf(cast)).toContain("chamfer-shadow-layer");
    expect(classesOf(cast)).toContain("chamfer-all");
    // A cast is not a stroke: the miter compensation that keeps the hairline
    // and the focus ring uniform would be wrong here, and shrinking the clip
    // on focus would pull the shadow in behind the ring.
    expect(classesOf(cast)).not.toContain("chamfer-hairline-inset");
    expect(classesOf(cast)).not.toContain("chamfer-focus-clip");
    expect(cast.getAttribute("aria-hidden")).toBe("true");
    // A direct child of the root, so nested frames stay independent.
    expect(cast.parentElement).toBe(frameOf(container));
  });

  it("pins a rest step alongside the hover step", () => {
    const { container } = render(
      <ChamferFrame shadow="sm" shadowHover="md">
        Panel
      </ChamferFrame>
    );

    expect(classesOf(frameOf(container))).toEqual(
      expect.arrayContaining(["chamfer-shadow-sm", "hover:chamfer-shadow-md"])
    );
  });

  it("casts on hover only, without inheriting an ancestor frame's step", () => {
    const { container } = render(
      <ChamferFrame shadow="sm">
        <ChamferFrame shadowHover="md">Panel</ChamferFrame>
      </ChamferFrame>
    );
    const [outer, inner] = container.querySelectorAll<HTMLElement>(
      '[data-slot="chamfer-frame"]'
    );

    expect(classesOf(outer)).toContain("chamfer-shadow-sm");
    // The inherited custom properties are what an unset rest state would pick
    // up, so the flat step is stated explicitly rather than left open.
    expect(classesOf(inner)).toContain("chamfer-shadow-none");
    expect(classesOf(inner)).toContain("hover:chamfer-shadow-md");
    expect(castOf(inner)).not.toBeNull();
  });

  it("reads its offset and color from the elevation tokens", () => {
    const layer = cssRule("chamfer-shadow-layer");

    // Behind the surface *and* behind the focus ring, which overlaps it on
    // the right and bottom edges.
    expect(layer).toMatch(/z-index:\s*-2/);
    expect(layer).toMatch(/position:\s*absolute/);
    expect(layer).toMatch(/pointer-events:\s*none/);
    expect(layer).toMatch(
      /translate:\s*var\(--chamfer-shadow-offset[^)]*\)\s*var\(--chamfer-shadow-offset/
    );
    expect(layer).toMatch(/background-color:\s*var\(--chamfer-shadow-color/);

    for (const step of ["sm", "md", "lg"] as const) {
      const rule = cssRule(`chamfer-shadow-${step}`);
      expect(rule).toContain(
        `--chamfer-shadow-offset: var(--shadow-offset-${step})`
      );
      expect(rule).toContain(
        `--chamfer-shadow-color: var(--shadow-color-${step})`
      );
    }
  });

  it("keeps the box-shadow tokens and their halves in agreement", () => {
    // The composed `box-shadow` rectangular chrome uses and the halves the
    // clipped cast uses have to be one source, or the two drift apart.
    for (const step of ["sm", "md", "lg"] as const) {
      expect(GLOBALS_CSS).toMatch(
        new RegExp(
          `--shadow-elevation-${step}:\\s*var\\(--shadow-elevation-offset-${step}\\)\\s*` +
            `var\\(--shadow-elevation-offset-${step}\\)\\s*0\\s*0\\s*` +
            `var\\(--shadow-elevation-color-${step}\\)`
        )
      );
      expect(GLOBALS_CSS).toContain(
        `--shadow-offset-${step}: var(--shadow-elevation-offset-${step})`
      );
      expect(GLOBALS_CSS).toContain(
        `--shadow-color-${step}: var(--shadow-elevation-color-${step})`
      );
    }
  });
});

describe("ChamferFrame focus", () => {
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
      // A direct child of the root, so nested frames stay independent.
      expect(focusLayer.parentElement).toBe(frameOf(container));
    }
  );

  it("stays inside the root box so an overflow-hidden ancestor cannot clip it", () => {
    const rule = cssRule("chamfer-focus-layer");

    expect(rule).toMatch(/inset:\s*0\s*;/);
    expect(rule).not.toMatch(/inset:\s*-/);
  });

  it("puts the focus clip on the outermost layer only", () => {
    const { container: borderless } = render(
      <ChamferFrame interactive>Panel</ChamferFrame>
    );
    expect(classesOf(surfaceOf(borderless))).toContain("chamfer-focus-clip");

    const { container: hairline } = render(
      <ChamferFrame interactive edge="gold">
        Panel
      </ChamferFrame>
    );
    expect(classesOf(edgeOf(hairline))).toContain("chamfer-focus-clip");
    expect(classesOf(surfaceOf(hairline))).not.toContain("chamfer-focus-clip");
  });

  it("omits the focus layer for non-interactive frames", () => {
    const { container } = render(<ChamferFrame>Panel</ChamferFrame>);

    expect(container.querySelector('[data-slot="chamfer-focus"]')).toBeNull();
    expect(classesOf(frameOf(container))).not.toContain("chamfer-focusable");
    expect(classesOf(surfaceOf(container))).not.toContain("chamfer-focus-clip");
  });
});

describe("ChamferFrame asChild", () => {
  it("promotes the caller's element to the root", () => {
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

  it("forwards both the frame ref and the child ref to the promoted root", () => {
    const frameRef = React.createRef<HTMLAnchorElement>();
    const childRef = vi.fn();

    const { container } = render(
      <ChamferFrame asChild ref={frameRef}>
        <a href="#deck" ref={childRef}>
          Deck
        </a>
      </ChamferFrame>
    );
    const anchor = frameOf(container);

    expect(frameRef.current).toBe(anchor);
    expect(childRef).toHaveBeenCalledWith(anchor);
  });

  it("detaches plain callback refs on unmount", () => {
    const frameRef = vi.fn();
    const childRef = vi.fn();

    const { container, unmount } = render(
      <ChamferFrame asChild ref={frameRef}>
        <a href="#deck" ref={childRef}>
          Deck
        </a>
      </ChamferFrame>
    );
    const anchor = frameOf(container);

    expect(frameRef).toHaveBeenCalledWith(anchor);
    expect(childRef).toHaveBeenCalledWith(anchor);

    frameRef.mockClear();
    childRef.mockClear();
    unmount();

    // The composed ref always returns a cleanup, so React never falls back to
    // the legacy null-call convention — it has to be synthesized for callbacks
    // that return no cleanup of their own.
    expect(frameRef).toHaveBeenCalledWith(null);
    expect(childRef).toHaveBeenCalledWith(null);
  });

  it("composes same-named handlers, child first", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];

    const { container } = render(
      <ChamferFrame asChild onClick={() => calls.push("frame")}>
        <button type="button" onClick={() => calls.push("child")}>
          Start Match
        </button>
      </ChamferFrame>
    );

    await user.click(frameOf(container));

    expect(calls).toEqual(["child", "frame"]);
  });

  it("keeps handlers that only one side declares", async () => {
    const user = userEvent.setup();
    const frameOnly = vi.fn();
    const childOnly = vi.fn();

    const { container } = render(
      <ChamferFrame asChild onMouseDown={frameOnly}>
        <button type="button" onClick={childOnly}>
          Start Match
        </button>
      </ChamferFrame>
    );

    await user.click(frameOf(container));

    expect(frameOnly).toHaveBeenCalledOnce();
    expect(childOnly).toHaveBeenCalledOnce();
  });

  it("merges style objects instead of clobbering the child's", () => {
    const { container } = render(
      <ChamferFrame asChild style={{ zIndex: 2, width: 100 }}>
        <a href="#deck" style={{ width: 200 }}>
          Deck
        </a>
      </ChamferFrame>
    );
    const frame = frameOf(container);

    // Frame-only keys survive; the child wins on conflicts.
    expect(frame.style.zIndex).toBe("2");
    expect(frame.style.width).toBe("200px");
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
