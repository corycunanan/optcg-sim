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
 * root             unclipped, rectangular  ← hit target, focus owner, `asChild`
 *  ├─ shadow layer only when `shadow`/`shadowHover` cast; the polygon again,
 *  │               offset down-right behind everything
 *  ├─ focus layer  only when `interactive`; fills the root, painted behind
 *  ├─ edge layer   only when `edge !== "none"` (one hairline, clipped)
 *  └─ surface      clipped; carries `surfaceClassName` and the children
 * ```
 *
 * Four rules drive that shape:
 *
 * - `clip-path` clips pointer events, so the interactive box stays rectangular
 *   and the clip applies to a child. The corner triangles remain clickable.
 * - `outline` ignores `clip-path`, so keyboard focus is drawn as a chamfered
 *   ring *inside* the root box: the focus layer fills the root and the
 *   outermost clipped layer shrinks its own clip to expose it. Nothing is
 *   painted outside the root, so an `overflow-hidden` ancestor cannot clip the
 *   focus indicator away.
 * - `box-shadow` is generated from the border box, so it cannot cast a
 *   chamfered silhouette either: on the root it paints square corners through
 *   both cuts, and on the clipped surface the clip erases it. The cast is a
 *   third clipped layer instead — see `shadow` below.
 * - Two clipped layers are never given the same polygon *when one is inset
 *   inside the other*. Insetting a layer widens its diagonal relative to its
 *   straight edges, so the inner cut is miter-compensated by `(2 − √2) × inset`
 *   (see `chamfer-hairline-inset`). The shadow layer is translated rather than
 *   inset, so it deliberately keeps the uncompensated polygon.
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
 *
 * <ChamferFrame shadow="sm" shadowHover="md" surfaceClassName="bg-surface-1 p-4">
 *   Card-class surface
 * </ChamferFrame>
 * ```
 *
 * Class names are static literals on purpose: Tailwind's scanner needs whole
 * class names in the source, so composing them dynamically is unsupported and
 * the design-system lint rejects it.
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

/**
 * Cast-shadow step, one per elevation tier in
 * `docs/design/ELEVATION-LANGUAGE.md`. Each class only sets the offset and the
 * color; `.chamfer-shadow-layer` reads both.
 */
const CHAMFER_SHADOW_CLASSES = {
  none: "chamfer-shadow-none",
  sm: "chamfer-shadow-sm",
  md: "chamfer-shadow-md",
  lg: "chamfer-shadow-lg",
} as const;

/** The same steps under `hover:`. Static literals — Tailwind scans names. */
const CHAMFER_SHADOW_HOVER_CLASSES = {
  none: "hover:chamfer-shadow-none",
  sm: "hover:chamfer-shadow-sm",
  md: "hover:chamfer-shadow-md",
  lg: "hover:chamfer-shadow-lg",
} as const;

type ChamferCut = keyof typeof CHAMFER_CUT_CLASSES;
type ChamferCorners = keyof typeof CHAMFER_CORNER_CLASSES;
type ChamferEdge = keyof typeof CHAMFER_EDGE_CLASSES;
type ChamferShadow = keyof typeof CHAMFER_SHADOW_CLASSES;

interface ChamferFrameProps extends Omit<
  React.ComponentPropsWithRef<"div">,
  "ref"
> {
  /**
   * Ref to the frame root. Typed as `HTMLElement` because `asChild` promotes
   * the caller's element — an anchor, button, or list item — to that root.
   */
  ref?: React.Ref<HTMLElement>;
  /** Chamfer depth. `sm` 4px, `md` 8px, `lg` 12px. Defaults to `md`. */
  cut?: ChamferCut;
  /** Which corners are cut. Defaults to `outer` (top-left + bottom-right). */
  corners?: ChamferCorners;
  /** Hairline treatment. Defaults to `none` (borderless). */
  edge?: ChamferEdge;
  /**
   * Hard elevation cast at rest, following the chamfered silhouette rather
   * than the root's rectangle. Defaults to `none`, which renders no layer at
   * all — a flat frame stays exactly as many nodes as it was.
   */
  shadow?: ChamferShadow;
  /**
   * Cast while the frame is hovered. Setting it alone (with `shadow="none"`)
   * casts only on hover.
   */
  shadowHover?: ChamferShadow;
  /** Draws the chamfered focus ring when the frame or its content is focused. */
  interactive?: boolean;
  /** Merges the frame's root props onto the single child element. */
  asChild?: boolean;
  /** Classes for the clipped surface layer — background and padding go here. */
  surfaceClassName?: string;
}

type UnknownProps = Record<string, unknown>;
type AnyHandler = (...args: unknown[]) => unknown;

const EVENT_HANDLER_PATTERN = /^on[A-Z]/;

/**
 * Attaches a node to every supplied ref, honoring React 19 ref cleanups so the
 * caller's ref and the frame's own ref can coexist on the promoted root.
 *
 * Because this composed callback always returns a cleanup, React never falls
 * back to the legacy `ref(null)` detach convention — so a plain callback ref
 * that returns nothing gets its `null` call synthesized here.
 */
function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    const cleanups: Array<() => void> = [];

    for (const ref of refs) {
      if (typeof ref === "function") {
        const cleanup = ref(node);
        cleanups.push(
          typeof cleanup === "function" ? cleanup : () => ref(null)
        );
      } else if (ref) {
        const objectRef = ref as React.RefObject<T | null>;
        objectRef.current = node;
        cleanups.push(() => {
          objectRef.current = null;
        });
      }
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  };
}

/**
 * Merges the frame's props onto the promoted child. The child wins on plain
 * values and `style` keys, event handlers run child-first then frame, and
 * `className` / `children` / `ref` are composed by the caller.
 */
function mergeSlotProps(
  frameProps: UnknownProps,
  childProps: UnknownProps
): UnknownProps {
  const merged: UnknownProps = { ...frameProps };

  for (const [key, childValue] of Object.entries(childProps)) {
    if (key === "className" || key === "children" || key === "ref") continue;

    const frameValue = frameProps[key];

    if (EVENT_HANDLER_PATTERN.test(key)) {
      if (
        typeof childValue === "function" &&
        typeof frameValue === "function"
      ) {
        merged[key] = (...args: unknown[]) => {
          (childValue as AnyHandler)(...args);
          (frameValue as AnyHandler)(...args);
        };
      } else {
        merged[key] = childValue ?? frameValue;
      }
      continue;
    }

    if (key === "style") {
      merged.style = {
        ...(frameValue as React.CSSProperties | undefined),
        ...(childValue as React.CSSProperties | undefined),
      };
      continue;
    }

    merged[key] = childValue;
  }

  return merged;
}

function ChamferFrame({
  cut = "md",
  corners = "outer",
  edge = "none",
  shadow = "none",
  shadowHover,
  interactive = false,
  asChild = false,
  className,
  surfaceClassName,
  children,
  ref,
  ...props
}: ChamferFrameProps) {
  const clipClass = CHAMFER_CORNER_CLASSES[corners];
  const edgeClass = CHAMFER_EDGE_CLASSES[edge];

  // A frame that never casts renders no shadow layer, so nothing changes for
  // the flat surfaces that are most of the app. Once either state casts, both
  // steps are pinned on the root: the rest class is what stops a nested frame
  // from inheriting an ancestor frame's cast.
  const casts = shadow !== "none" || (shadowHover ?? "none") !== "none";

  const rootClassName = cn(
    "relative isolate",
    CHAMFER_CUT_CLASSES[cut],
    interactive && "chamfer-focusable",
    casts && CHAMFER_SHADOW_CLASSES[shadow],
    casts && shadowHover && CHAMFER_SHADOW_HOVER_CLASSES[shadowHover],
    className
  );

  const rootProps = {
    "data-slot": "chamfer-frame",
    "data-cut": cut,
    "data-corners": corners,
    "data-edge": edge,
  };

  // The focus ring is exposed by shrinking the clip of whichever layer is
  // outermost, so only that layer opts into the focus geometry.
  const focusClipClass = interactive ? "chamfer-focus-clip" : undefined;

  const layers = (content: React.ReactNode) => {
    const surface = (
      <div
        data-slot="chamfer-surface"
        className={cn(
          clipClass,
          // Inside a hairline the surface is physically inset, so its cut is
          // miter-compensated; standalone it is the outermost clipped layer.
          edgeClass ? "chamfer-hairline-inset" : focusClipClass,
          "h-full",
          surfaceClassName
        )}
      >
        {content}
      </div>
    );

    return (
      <>
        {casts ? (
          <span
            aria-hidden="true"
            data-slot="chamfer-shadow"
            className={cn("chamfer-shadow-layer", clipClass)}
          />
        ) : null}
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
            className={cn(
              clipClass,
              edgeClass,
              focusClipClass,
              "chamfer-hairline h-full"
            )}
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
    ) as React.ReactElement<UnknownProps>;
    const childProps: UnknownProps = child.props ?? {};

    return React.cloneElement(
      child,
      {
        ...mergeSlotProps(props as UnknownProps, childProps),
        ...rootProps,
        className: cn(
          rootClassName,
          childProps.className as string | undefined
        ),
        ref: composeRefs(
          ref,
          childProps.ref as React.Ref<HTMLElement> | undefined
        ),
      },
      layers(childProps.children as React.ReactNode)
    );
  }

  return (
    <div
      {...rootProps}
      // Narrowing the widened `HTMLElement` ref back to the default root.
      ref={ref as React.Ref<HTMLDivElement> | undefined}
      className={rootClassName}
      {...props}
    >
      {layers(children)}
    </div>
  );
}

export { ChamferFrame };
export type {
  ChamferFrameProps,
  ChamferCut,
  ChamferCorners,
  ChamferEdge,
  ChamferShadow,
};
