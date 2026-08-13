# Elevation Language

> **Status:** Adopted 2026-08-12 (Visual Polish Round 3, OPT-672/673). This doc owns the
> surface-stacking model: which surfaces may cast a shadow, which take the flat edge
> treatment, and how the z-ladder, the elevation color steps, and the hard-shadow scale
> line up. It consolidates guidance previously scattered through
> [BRANDING-GUIDELINES.md](./BRANDING-GUIDELINES.md) §7 the way
> [SHAPE-LANGUAGE.md](./SHAPE-LANGUAGE.md) owns radius and chamfer.
> Companion docs: [MATERIAL-LANGUAGE.md](./MATERIAL-LANGUAGE.md) (Tier-5 surfaces),
> [INTERACTION-GRAMMAR.md](./INTERACTION-GRAMMAR.md) (signal glows).
> `src/app/globals.css` remains the source of truth for token values.

## The principle

A raised surface looks **physically set down on top of** the surface beneath it — a printed
card resting on a printed card. When depth needs a shadow, the shadow is a **hard,
non-blurred offset** cast down-right, matching the DON!! card shadow that shipped first on
the game board (`--gb-shadow-don: 3px 3px 0 0 rgba(0,0,0,0.25)`). Nothing floats in a soft
ambient bloom; blurred drop shadows are banned repo-wide and
`scripts/lint-design-system.mjs` enforces the ban in `.tsx`.

Depth is spent, not sprinkled. Most of the page is **flat**: structural surfaces separate
by elevation *color* alone, and only chrome that transiently overlaps other content earns a
cast shadow. The third treatment — the lit hairline `edge-*` frame — belongs to information
surfaces that are read constantly and must never pull focus.

## The three treatments

| Treatment | What it says | Who gets it |
|---|---|---|
| **Elevation color step** (no shadow) | "I am part of the page's terrain" | Structural surfaces that tile or divide the layout: page ground, panels, nav, insets, seat columns, list rows |
| **Hard shadow** (`shadow-sm/md/lg`) | "I am temporarily sitting on top of you" | Overlapping chrome: dropdowns, selects, popovers, hover cards, dialogs, sheets, sticky action bars, toasts, chat widget — plus cards at rest/hover |
| **Edge frame** (`shadow-none` + `edge-*` border-image) | "I am an information layer, not an object" | Tier-5 information surfaces: tooltips, `card-info-panel` ([MATERIAL-LANGUAGE.md](./MATERIAL-LANGUAGE.md) §Tier 5) |

One treatment per surface. A surface never stacks a shadow on an edge frame, and a hover
never stacks lift + shadow + glow (see Anti-stacking, below).

## The ladder: z-index ↔ elevation color ↔ shadow

| z tier | Typical surfaces | Elevation color | Shadow token |
|---|---|---|---|
| `z-0` | Page ground, panels, insets | `--elevation-page` 22% / `--elevation-panel` 27% / `--elevation-inset` 37% | none — color separates structure |
| `z-0` (content) | Card art tiles at rest / hover | `--surface-panel` stage | **target:** `shadow-sm` rest → `shadow-md` hover. Shipped tiles vary (grid: none → `shadow-md`; deck-builder and lobby tiles: static `shadow-sm` + translate) — converge on the target as tiles are touched, one lift per hover either way |
| `z-10` | Sticky headers, raised in-flow panels (lobby action bars, chat widget) | panel/raised step | `shadow-lg` when they overlap scrolling content; none when they only divide it |
| `z-20` | Dropdowns, selects, popovers, hover cards | `--surface-raised` 32% (popover role) | `shadow-md` (4px 4px) |
| `z-30` | Fixed navbar | `--elevation-nav` 18% | none — the darkest step reads as the page's frame, nothing sits under it |
| `z-40` | Dialogs, alert dialogs, sheets | `--surface-panel` over `--overlay` | `shadow-lg` (6px 6px) |
| toasts | Sonner stack (library-managed z), custom lobby invite toast at `z-50` | raised step | custom toast: `shadow-md`; Sonner's own stack ships the library's blurred shadow — the one known vendored exception, outside the `.tsx` lint's reach (see Known exceptions) |
| `z-50` (info) | Tooltips | `--surface-info` (opaque dark) | **none** — `edge-info` frame |
| `z-[90..95]` | Game-board pregame overlays; the spotlight rides the `z-50` Dialog primitive | `--gb-*` context | `shadow-lg` on the overlay panel; board tooltips use `--gb-edge-info`, flat |

Reading the table: **z position says when you can be covered; the shadow says you are
covering someone right now.** A dropdown casts because it overlaps the page. The navbar
never casts because nothing is under it — it is the page's frame. A sticky bar earns
`shadow-lg` only once content actually scrolls beneath it. Tooltips sit at z-50 but stay
flat because their job is to be read hundreds of times without ever reading as an object
entering the scene.

## Shadow scale (shipped values)

| Token | Value | Register |
|---|---|---|
| `--shadow-sm` | `2px 2px 0 0 oklch(5% 0.004 260 / 0.45)` | subtle lift, cards at rest |
| `--shadow-md` | `4px 4px 0 0 oklch(5% 0.004 260 / 0.55)` | menus, popovers, hovered cards |
| `--shadow-lg` | `6px 6px 0 0 oklch(5% 0.004 260 / 0.65)` | modals, sheets, sticky bars |

- One layer per tier — a hard shadow has no falloff to fake, so the old two-layer trick
  buys nothing.
- Down-right, always: chrome and board share one implied cast direction with the DON!!
  precedent. (The *lighting* direction on Tier-5 edge gradients is top-left — light and
  cast agree; see MATERIAL-LANGUAGE.)
- Alphas run higher than the blurred values they replaced: deep navy swallows a faint
  near-black cast, and a hard edge shows its alpha honestly instead of averaging it away
  across a blur radius. Retune only with `pnpm run check:contrast` and the rendered
  consumers in view.
- Consume through `shadow-sm` / `shadow-md` / `shadow-lg` or `shadow-[var(--shadow-*)]`.
  Stock Tailwind steps (`shadow-xs/xl/2xl`, bare `shadow`, every `drop-shadow-*`,
  `inset-shadow-*`) are blurred and unbacked — lint fails them, including arbitrary
  `shadow-[…]` values whose blur position carries anything but a literal zero — unless
  both offsets are literal zero, which is the glow shape and passes (next section).

## The glow exemption

`shadow-[0_0_Npx_var(--gb-signal-*)]` glows on battle rings and life-zone pulses are
**semantic signals, not elevation** — zero-offset, symmetric, meaning "this object is in a
state," not "this object is raised." They are specified in
[INTERACTION-GRAMMAR.md](./INTERACTION-GRAMMAR.md) §3.2 and deliberately pass the shadow
lint (a zero-offset blur is recognized as a glow). Do not use a glow to fake elevation; do
not use elevation to fake a signal.

## When you add a surface

1. **Does it overlap content transiently?** No → give it an elevation color step and stop.
2. **Is it a read-constantly information layer?** Yes → Tier-5 treatment: `shadow-none` +
   the `edge-*` frame on an opaque dark fill. App-side Tier-5 (tooltip, card-info-panel)
   carries the 2px chrome radius per the OPT-670 amendment; board-side Tier-5 stays
   `rounded-none` per [MATERIAL-LANGUAGE.md](./MATERIAL-LANGUAGE.md) — the two contexts
   deliberately differ.
3. **Otherwise pick the tier by weight**, not taste: menus/popovers `shadow-md`; anything
   modal or sticky `shadow-lg`; `shadow-sm` is the resting register (card tiles at rest,
   active tab lift) and never the answer for overlapping chrome.
4. Match the z tier from the ladder above; if your surface needs a new z value, it needs a
   design conversation, not a bigger number.

## Known exceptions

- **Sonner's toast stack** ships the library's own blurred shadow and an extreme z-index
  from vendored CSS, outside the `.tsx` lint's reach. Tracked as a follow-up (restyle via
  Sonner's `toastOptions` or accept as vendored); do not copy it as precedent.

## Anti-stacking rules

- One elevation treatment per surface; never shadow + edge frame, never shadow + glow.
- One hover change per interaction: a card hover is lift + `shadow-md`, not lift + shadow +
  border + glow (BRANDING-GUIDELINES §Design Principles, motion rules).
- Elevation color steps are compressed on purpose (22 → 27 → 32 → 37%): if a surface needs
  to shout, that is salience (COLOR-LANGUAGE), not altitude.
