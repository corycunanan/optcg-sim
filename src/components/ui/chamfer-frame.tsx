import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * ChamferFrame — the shape-language enabler.
 *
 * Encapsulates the 45° chamfer vocabulary from `docs/design/SHAPE-LANGUAGE.md`
 * so adopting a surface is a wrapper swap rather than re-derived clip-path
 * math. The CSS lives in `src/app/globals.css` (`chamfer-*` utilities and the
 * `--chamfer-*` / `--edge-*` tokens); this component only composes it.
 *
 * Structure — DOM depth scales with the chosen edge, never beyond it:
 *
 * ```text
 * root            unclipped, rectangular  ← hit target, focus owner, `asChild`
 *  ├─ focus layer only when `interactive`
 *  ├─ edge layer  only when `edge !== "none"` (1px hairline, clipped)
 *  └─ surface     clipped; carries `surfaceClassName` and the children
 * ```
 *
 * Two rules drive that shape:
 *
 * - `clip-path` clips pointer events, so the interactive box stays rectangular
 *   and the clip applies to a child. The corner triangles remain clickable.
 * - `outline` ignores `clip-path`, so keyboard focus paints a chamfered halo
 *   layer instead of an outline. It is visible on every edge variant.
 *
 * Class routing: `className` lands on the rectangular root (layout, sizing,
 * and — with `asChild` — the interactive element itself); `surfaceClassName`
 * lands on the clipped surface, which is where background and padding belong.
 * Putting a background on the root would paint an unclipped rectangle.
 *
 * ```tsx
 * <ChamferFrame surfaceClassName="bg-surface-1 p-4">Panel</ChamferFrame>
 *
 * <ChamferFrame
 *   asChild
 *   interactive
 *   edge="gold"
 *   surfaceClassName="bg-surface-1 px-4 py-3"
 * >
 *   <Link href="/decks/1">Straw Hat Aggro</Link>
 * </ChamferFrame>
 * ```
 */

/** Cut depth: 4 / 8 / 12px — the only chamfer steps in the vocabulary. */
const CHAMFER_CUT_CLASSES = {
  sm: "chamfer-cut-sm",
  md: "chamfer-cut-md",
  lg: "chamfer-cut-lg",
} as const;

/** Cut pattern. `outer` (top-left + bottom-right) is the documented default. */
const CHAMFER_CORNER_CLASSES = {
  outer: "chamfer-outer",
  all: "chamfer-all",
} as const;

/**
 * Edge treatment. `none` is a first-class borderless variant — a single
 * clipped surface with no hairline layer at all — and is the default per the
 * standing minimalism directive: no border unless a spec asks for one.
 */
const CHAMFER_EDGE_CLASSES = {
  none: null,
  neutral: "chamfer-edge-neutral",
  gold: "chamfer-edge-gold",
  lighting: "chamfer-edge-lighting",
} as const;

type ChamferCut = keyof typeof CHAMFER_CUT_CLASSES;
type ChamferCorners = keyof typeof CHAMFER_CORNER_CLASSES;
type ChamferEdge = keyof typeof CHAMFER_EDGE_CLASSES;

interface ChamferFrameProps extends React.ComponentPropsWithoutRef<"div"> {
  /** Chamfer depth. `sm` 4px, `md` 8px, `lg` 12px. Defaults to `md`. */
  cut?: ChamferCut;
  /** Which corners are cut. Defaults to `outer` (top-left + bottom-right). */
  corners?: ChamferCorners;
  /** Hairline treatment. Defaults to `none` (borderless). */
  edge?: ChamferEdge;
  /** Renders the chamfered focus halo when the frame or its content is focused. */
  interactive?: boolean;
  /** Merges the frame's root props onto the single child element. */
  asChild?: boolean;
  /** Classes for the clipped surface layer — background and padding go here. */
  surfaceClassName?: string;
}

type SlottableChildProps = {
  className?: string;
  children?: React.ReactNode;
};

function ChamferFrame({
  cut = "md",
  corners = "outer",
  edge = "none",
  interactive = false,
  asChild = false,
  className,
  surfaceClassName,
  children,
  ...props
}: ChamferFrameProps) {
  const clipClass = CHAMFER_CORNER_CLASSES[corners];
  const edgeClass = CHAMFER_EDGE_CLASSES[edge];

  const rootClassName = cn(
    "relative isolate",
    CHAMFER_CUT_CLASSES[cut],
    interactive && "chamfer-focusable",
    className
  );

  const rootProps = {
    "data-slot": "chamfer-frame",
    "data-cut": cut,
    "data-corners": corners,
    "data-edge": edge,
  };

  const layers = (content: React.ReactNode) => {
    const surface = (
      <div
        data-slot="chamfer-surface"
        className={cn(clipClass, "h-full", surfaceClassName)}
      >
        {content}
      </div>
    );

    return (
      <>
        {interactive ? (
          <span
            aria-hidden="true"
            data-slot="chamfer-focus"
            className={cn("chamfer-focus-layer", clipClass)}
          />
        ) : null}
        {edgeClass ? (
          <div
            data-slot="chamfer-edge"
            className={cn(clipClass, edgeClass, "h-full p-px")}
          >
            {surface}
          </div>
        ) : (
          surface
        )}
      </>
    );
  };

  // `asChild` promotes the caller's element to the rectangular root so links
  // and buttons keep their own semantics, focus behavior, and full hit area.
  // Radix's Slot cannot express this shape (it only reparents a *direct*
  // slotted child), so the merge is done explicitly.
  if (asChild) {
    const child = React.Children.only(
      children
    ) as React.ReactElement<SlottableChildProps>;

    return React.cloneElement(
      child,
      {
        ...props,
        ...rootProps,
        className: cn(rootClassName, child.props.className),
      } as SlottableChildProps,
      layers(child.props.children)
    );
  }

  return (
    <div {...rootProps} className={rootClassName} {...props}>
      {layers(children)}
    </div>
  );
}

export { ChamferFrame };
export type { ChamferFrameProps, ChamferCut, ChamferCorners, ChamferEdge };
