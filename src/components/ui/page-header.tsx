import { cn } from "@/lib/utils";

/**
 * The one page header for every top-level page (decks, cards, sets, admin,
 * lobbies, sandbox). Styled after the lobby header: no band, no bottom rule —
 * the title sits directly on the page background so the header reads as the
 * first block of the page rather than a separate chrome strip.
 *
 * Rhythm contract: the header owns its top and side padding and deliberately
 * has NO bottom padding, so the page's own content well owns the entire
 * header→content gap. Pair it with a content well whose top padding matches
 * the header's (`pt-8`, or the header's own override) and the measured
 * header→content gap equals the header's top padding instead of doubling it.
 *
 * Narrow widths stack: title above actions below `sm`, side by side from `sm`.
 * A title and a row of `whitespace-nowrap` CTAs cannot share 272px of content
 * box at 320px without one of them being crushed, and stacking costs the
 * rhythm nothing — the header still emits no bottom padding, so the gap below
 * it is still exactly the content well's top padding.
 *
 * `className` passes through so height-gated surfaces (the no-scroll lobby
 * frame) can swap the vertical step, or move the stacking breakpoint, while
 * keeping every other token.
 */
function PageHeader({
  children,
  className,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-4 px-6 pt-8 sm:flex-row sm:items-center",
        className
      )}
      {...props}
    >
      {children}
    </header>
  );
}

function PageHeaderContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {children}
    </div>
  );
}

/** Optional kicker above the title — the lobby's "Game mode" / "Watching party". */
function PageHeaderEyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-gold-600 text-sm font-semibold tracking-widest uppercase",
        className
      )}
    >
      {children}
    </p>
  );
}

function PageHeaderTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1 className={cn("font-display text-content-primary text-3xl", className)}>
      {children}
    </h1>
  );
}

function PageHeaderDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-content-secondary max-w-prose text-sm", className)}>
      {children}
    </p>
  );
}

function PageHeaderActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // Wraps rather than clips: CTA labels are `whitespace-nowrap`, so a row of
  // them that cannot fit has to break onto a second line or crush its
  // neighbours.
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

export {
  PageHeader,
  PageHeaderContent,
  PageHeaderEyebrow,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
};
