/**
 * The navbar has exactly one interactive shape (OPT-712): a full-height square
 * section of the bar. OPT-681 gave the left links that shape; the right cluster
 * — notification bell, friends drawer toggle, account trigger — now takes the
 * same one, so hovering anywhere in the bar produces the same slab.
 *
 * `h-full` — not a literal `h-navbar` — keeps every block inside the nav's
 * border box, so the gold bottom rule stays unbroken beneath it. That means the
 * height chain from the nav down to the control has to be unbroken too.
 *
 * `rounded-none` squares it off: a block that meets both edges of the bar has no
 * free corner left to round, and the 2px chrome radius applied to the two
 * corners that remain would read as a rendering artifact rather than intent.
 *
 * `px-3 sm:px-4` is the links' own padding verbatim, so the bar keeps one
 * rhythm across both clusters instead of two.
 *
 * Focus: the inset outline (`focus-visible:outline-2 -outline-offset-2
 * outline-border-focus`) is the navbar's standardized indicator and draws inside
 * the block, so it survives at full height without a ring layered on top of it.
 * Nothing here sets `outline-none` — in Tailwind v4 that sets
 * `--tw-outline-style: none` and would defeat the indicator for good.
 *
 * One change per interaction (BRANDING-GUIDELINES.md §Design Principles): the
 * background step and the text step move together and nothing else stacks. The
 * navbar never casts (ELEVATION-LANGUAGE.md §The ladder, z-30) — no shadow here.
 */
export const navSlabStyles =
  "flex h-full shrink-0 cursor-pointer items-center justify-center rounded-none bg-transparent px-3 py-0 transition-all hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus sm:px-4";

/**
 * The paint a slab holds while the thing it opens is on screen — the right
 * cluster's analogue of the active link's treatment. Applied from React state
 * (`popupOpen`, `openMobile`) rather than a data attribute wherever the trigger
 * already owns that state, so the open styling cannot drift from the open
 * behavior.
 */
export const navSlabOpenStyles = "bg-surface-2 text-content-inverse";

/**
 * Box the bell and the friends toggle center inside their slab. It is the size
 * the icon controls used to be in full (`size-10`), kept intact so the bell's
 * unread badge — pinned to this box's top-right corner — sits exactly where it
 * always has, and so the icon keeps a 40px target of its own inside the slab.
 */
export const navSlabIconBoxStyles =
  "relative flex size-10 items-center justify-center";
