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
 * `className` passes through so height-gated surfaces (the no-scroll lobby
 * frame) can swap the vertical step while keeping every other token.
 */
function PageHeader({
  children,
  className,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 pt-8",
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
        "text-gold-600 text-xs font-semibold tracking-widest uppercase",
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
  return (
    <div className={cn("flex items-center gap-2", className)}>{children}</div>
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
