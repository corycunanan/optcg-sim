# Elevation Language

> **Status:** Adopted 2026-08-12 (Visual Polish Round 3, OPT-672/673); amended 2026-08-14
> (OPT-695) to split structural list rows from art-bearing rows and to specify how a clipped
> (chamfered) surface casts; amended 2026-08-19 (OPT-702) once the card-tile treatment
> converged across the app's list and grid surfaces, adding §The card register and
> §Non-interactive card previews; amended 2026-08-20 (OPT-713) to put the solid button
> variants on a register of their own and to standardize the hover lift at one distance,
> adding §The solid-button register and §The standardized lift. This doc owns the
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
by elevation _color_ alone, and only chrome that transiently overlaps other content earns a
cast shadow. The third treatment — the lit hairline `edge-*` frame — belongs to information
surfaces that are read constantly and must never pull focus.

## The three treatments

| Treatment                                              | What it says                               | Who gets it                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Elevation color step** (no shadow)                   | "I am part of the page's terrain"          | Structural surfaces that tile or divide the layout: page ground, panels, nav, insets, seat columns, structural list rows                                                                   |
| **Hard shadow** (`shadow-sm/md/lg`)                    | "I am temporarily sitting on top of you"   | Overlapping chrome: dropdowns, selects, popovers, hover cards, dialogs, sheets, sticky action bars, toasts, chat widget — plus cards at rest/hover, including **art-bearing rows** (below), and the **solid button variants** (below) |
| **Edge frame** (`shadow-none` + `edge-*` border-image) | "I am an information layer, not an object" | Tier-5 information surfaces: tooltips, `card-info-panel` ([MATERIAL-LANGUAGE.md](./MATERIAL-LANGUAGE.md) §Tier 5)                                                                          |

One treatment per surface. A surface never stacks a shadow on an edge frame, and a hover
never stacks lift + shadow + glow (see Anti-stacking, below).

### Structural rows vs. art-bearing rows

"List row" is not one thing, and the split is what the row _is_, not how it is laid out.

- A **structural row** is terrain. It exists to divide a list into readable bands, its
  content is text and controls, and the object of interest is the list. It takes the
  elevation color step and no shadow.
- An **art-bearing row** is a card lying on its side. It leads with printed card art, the
  whole row is one object the user picks up, and it navigates somewhere as a unit. It is on
  the **card register**: `shadow-sm` at rest, `shadow-md` on hover, exactly as a card tile.

The shipped instance is the `/decks` row (`src/app/decks/deck-list.tsx`): a borderless
`ChamferFrame` (`edge="none"`, `cut="lg"`) whose surface is `bg-surface-1`
(`--surface-panel`, 27%) stepping to `bg-surface-2` (`--surface-raised`, 32%) on hover,
with `shadow="sm"` / `shadowHover="md"` on the frame. The skeleton that streams ahead of it
(`src/app/decks/loading.tsx`) carries the resting `shadow="sm"` too, so the rows do not
change altitude when the real list swaps in.

Adopting the register is a decision, not a default: a row that only happens to show a small
avatar or a color chip is still structural. Ask whether the row is a _thing_ or a _band_.

### The card register

These sites converge on `shadow-sm` at rest → `shadow-md` on hover. Most lead with printed
card art and behave as one pickable object; two don't cleanly fit that description and are
called out rather than folded into a blanket rule:

| Surface                                              | Site                                              | Hover                                                    |
| ---------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `/decks` art-bearing rows                            | `src/app/decks/deck-list.tsx`                     | `bg-surface-2` + `shadowHover="md"` on the `ChamferFrame` |
| `/cards` grid tiles                                  | `src/components/cards/card-grid.tsx`              | `hover:shadow-md` + the Motion `handCardHover` preset     |
| `/sets` tiles¹                                       | `src/components/cards/set-browser.tsx`            | `hover:shadow-md` + `hover:-translate-y-px`               |
| Card-detail art-variant thumbnails²                  | `src/components/cards/card-image-gallery.tsx`     | `hover:shadow-md`, alongside the existing selected-state opacity cross-fade |
| Deck-builder search tiles                            | `src/components/deck-builder/deck-builder-search.tsx` | `hover:shadow-md`                                     |
| Deck-builder deck-list fan stacks                    | `src/components/deck-builder/deck-builder-list.tsx`   | `group-hover/stack:shadow-md` + `-translate-y-2`      |
| Lobby deck-preview fan stacks                        | `src/components/lobbies/deck-card-grid.tsx`       | `hover:shadow-md` + `hover:-translate-y-2`, per card       |
| Lobby seat leader art                                | `src/components/lobbies/lobby-seat-card.tsx`      | `hover:shadow-md` + `hover:-translate-y-1`                |

¹ `/sets` tiles are a text/stat row — set label, set name, card-count badge — with no
printed card art at all. It's an arguable member of the register: it takes the same
`shadow-sm`/`hover:shadow-md` step as its list-page neighbors for consistency, not because
it leads with art.

² `card-image-gallery.tsx` keeps its pre-existing selected-state hover: unselected
thumbnails cross-fade from `opacity-70` to `opacity-100` on hover, and the `shadow-sm` →
`shadow-md` step rides alongside that, not in place of it.

Non-interactive card grids (the deck builder's Backs and DON tabs) are deliberately not in
this table — see §Non-interactive card previews below.

Two rules the table encodes:

- **A fanned stack carries the register per card, not on a wrapper.** The stack lifts as one
  object, so its outer cards are what cast onto the page and the interior seams are a card
  resting on a card — §The principle, literally. A `box-shadow` on the stack's wrapper would
  paint a rectangle behind a fanned, rotated silhouette, the same mismatch §Casting from a
  clipped surface describes. Where the lift is per card (the lobby fan) the shadow step is
  per card too; where the whole stack lifts (the deck-builder fan) the whole stack steps.
- **The lift and the shadow must share a transition.** Tailwind v4 compiles `-translate-y-*`
  to the standalone `translate` property, which `transition-shadow` does not cover and
  `transition-transform` covers without carrying `box-shadow`. Name both:
  `transition-[translate,box-shadow]`.

### Non-interactive card previews

A grid of card art you cannot click, focus, or tooltip is still a card object, so it keeps
the resting `shadow-sm` — but it takes **no hover step**. A lift on something that does not
respond is a promise the surface never keeps. The shipped pair is the deck builder's Backs
and DON tabs (`src/components/deck-builder/deck-builder-backs.tsx`,
`deck-builder-don.tsx`): both are read-only sleeve/DON!! previews, both rest at `shadow-sm`,
neither moves on hover.

### The solid-button register

A button is an object the user pushes. That puts it on the hard-shadow treatment for the
same reason a card tile is there — it reads as a thing resting on the page, not as terrain
the page is made of — and it takes the card register's step verbatim: `shadow-sm` at rest,
`shadow-md` on hover, with the standardized lift riding the hover (§The standardized lift).

Which button casts is two questions, not one: **is the silhouette solid**, and **is the
control wide enough for a cast to read as depth**. `src/components/ui/button.tsx` answers
both at once — the register is a single `compoundVariants` entry keyed on variant _and_
size, not a class pasted onto four variants.

| Variant       | Sizes `default` / `sm` / `lg`      | Sizes `icon` / `icon-sm` |
| ------------- | ---------------------------------- | ------------------------ |
| `default`     | `shadow-sm` → `shadow-md` + lift   | flat                     |
| `outline`     | `shadow-sm` → `shadow-md` + lift   | flat                     |
| `destructive` | `shadow-sm` → `shadow-md` + lift   | flat                     |
| `gold`        | `shadow-sm` → `shadow-md` + lift   | flat                     |
| `ghost`       | flat                               | flat                     |
| `link`        | flat                               | flat                     |

**All four raised variants rest at `shadow-sm`, including `outline`.** A cast is generated
from the border box and clipped inside it, so a transparent fill behind a solid gold border
still casts a clean 2px offset — the silhouette is the border, and the border is solid.
Resting flat and casting `shadow-md` only on hover was the alternative, and it fails the
rule in §Anti-stacking twice: it makes the hover a two-tier jump from nothing to `md`, and
it means a page of buttons has no altitude until a pointer crosses it. `shadow-sm` → lift +
`shadow-md` is one tier moving as one change, exactly as the `/decks` row moves
`bg-surface-1` + `shadow-sm` → `bg-surface-2` + `shadow-md`.

**`ghost` and `link` stay flat because they have no silhouette.** A cast under a
transparent surface traces a border box the eye cannot otherwise see, so the control reads
as a rectangle floating over the page rather than an object sitting on it — the shadow
announces an edge the design deliberately withheld.

**The icon sizes stay flat at every variant, by size.** `icon` and `icon-sm` are 40px and
32px squares; a hard 4px offset against a 32px edge is an eighth of the control, which
lands as a slab rather than as depth. A gold icon button is excluded for its size even
though its variant is on the register — hence the compound key.

#### Nesting: `elevation="flat"`

A button that already sits on a casting surface must not cast again. A `shadow-md` child
inside a `shadow-lg` dialog panel inverts the ladder — the smaller object claims to be
nearer the viewer than the panel carrying it — and a hard offset inside an
`overflow-hidden` parent is clipped to a stub along the edge it crosses.

The opt-out is a variant on the button, `elevation="flat"`, and it is deliberately not a
context. A context would make the exclusion invisible at the call site and would have to
guess which ancestors count as casting; the app nests solid buttons inside casting surfaces
at a countable number of places, and naming each one keeps the ladder auditable by reading
the JSX. `elevation` defaults to `raised`, mirrors onto `data-elevation` for tests and VQA,
and simply withholds the compound entry rather than overriding it — there is no
`shadow-none` fighting a `shadow-sm` further up the class string.

Reach for it when the parent already casts, not when a cast merely looks busy. `ghost` and
`link` footer buttons and every icon button need no opt-out, because the register never
reached them: the `/decks` row kebab (rendered at `src/app/decks/deck-list.tsx:208`, inside
the `shadow="sm" shadowHover="md"` `ChamferFrame` at `deck-list.tsx:96-97`) is `ghost` at
`size="icon"` (`src/components/deck-builder/deck-delete-button.tsx:70-71`) and is excluded
twice over.

`elevation="flat"` also answers the smaller case of a button that already carries an
elevation statement of its own. The ornamental hero CTA
([BRANDING-GUIDELINES.md](./BRANDING-GUIDELINES.md) §Ornamental CTA, shipped at
`src/app/page.tsx:42-50`) wears a gold hairline at `outline-offset: 3px`; a `shadow-sm` cast
would sit inside that 3px gap and `shadow-md` would cross the ring, which is altitude plus a
decorative frame — two registers on one hover, and what §Anti-stacking forbids.

Where the casting surface is itself a component, the opt-out belongs in that component
rather than at every call site. `AlertDialogAction` and `AlertDialogCancel` render a
`Button` (`src/components/ui/alert-dialog.tsx:157`, `:175`), so passing `elevation="flat"`
there flattens every alert dialog footer in the app from one place. `InputGroupButton`
(`src/components/ui/input-group.tsx:102`) does the same for a control that sits flush inside
an input's surface.

## The ladder: z-index ↔ elevation color ↔ shadow

| z tier          | Typical surfaces                                                             | Elevation color                                                            | Shadow token                                                                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `z-0`           | Page ground, panels, insets                                                  | `--elevation-page` 22% / `--elevation-panel` 27% / `--elevation-inset` 37% | none — color separates structure                                                                                                                                                                                                                                         |
| `z-0` (content) | Card art tiles and art-bearing rows at rest / hover; solid button variants   | `--surface-panel` stage                                                    | `shadow-sm` rest → `shadow-md` hover, shipped across the register (§The card register, below). A tile that pairs the step with a lift moves both together as one tier                                                                                                     |
| `z-10`          | Sticky headers, raised in-flow panels (lobby action bars, chat widget)       | panel/raised step                                                          | `shadow-lg` when they overlap scrolling content; none when they only divide it                                                                                                                                                                                           |
| `z-20`          | Dropdowns, selects, popovers, hover cards                                    | `--surface-raised` 32% (popover role)                                      | `shadow-md` (4px 4px)                                                                                                                                                                                                                                                    |
| `z-30`          | Fixed navbar                                                                 | `--elevation-nav` 18%                                                      | none — the darkest step reads as the page's frame, nothing sits under it                                                                                                                                                                                                 |
| `z-40`          | Dialogs, alert dialogs, sheets                                               | `--surface-panel` over `--overlay`                                         | `shadow-lg` (6px 6px)                                                                                                                                                                                                                                                    |
| toasts          | Sonner stack (library-managed z), custom lobby invite toast at `z-50`        | raised step                                                                | `shadow-md` for Sonner and custom lobby toasts                                                                                                                                                                                                                           |
| `z-50` (info)   | Tooltips                                                                     | `--surface-info` (opaque dark)                                             | **none** — `edge-info` frame                                                                                                                                                                                                                                             |
| `z-[90..95]`    | Game-board pregame overlays; the spotlight rides the `z-50` Dialog primitive | `--gb-*` context                                                           | `shadow-lg` on the overlay panel; board tooltips use `--gb-edge-info`, flat                                                                                                                                                                                              |

Reading the table: **z position says when you can be covered; the shadow says you are
covering someone right now.** A dropdown casts because it overlaps the page. The navbar
never casts because nothing is under it — it is the page's frame. A sticky bar earns
`shadow-lg` only once content actually scrolls beneath it. Tooltips sit at z-50 but stay
flat because their job is to be read hundreds of times without ever reading as an object
entering the scene.

## Shadow scale (shipped values)

| Token         | Value                                    | Register                       |
| ------------- | ---------------------------------------- | ------------------------------ |
| `--shadow-sm` | `2px 2px 0 0 oklch(5% 0.004 260 / 0.45)` | subtle lift, cards at rest     |
| `--shadow-md` | `4px 4px 0 0 oklch(5% 0.004 260 / 0.55)` | menus, popovers, hovered cards |
| `--shadow-lg` | `6px 6px 0 0 oklch(5% 0.004 260 / 0.65)` | modals, sheets, sticky bars    |

- One layer per tier — a hard shadow has no falloff to fake, so the old two-layer trick
  buys nothing.
- Down-right, always: chrome and board share one implied cast direction with the DON!!
  precedent. (The _lighting_ direction on Tier-5 edge gradients is top-left — light and
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

## The standardized lift

A surface that steps up a tier on hover may also rise. The rise is **2px, everywhere**, and
it is spent through one token rather than typed per site:

| Layer     | Name                     | Value                            |
| --------- | ------------------------ | -------------------------------- |
| Primitive | `--lift-elevation-hover` | `-2px`                           |
| Semantic  | `--lift-hover`           | `var(--lift-elevation-hover)`    |
| Utility   | `lift`                   | `translate: 0 var(--lift-hover)` |

Write it as `motion-safe:hover:lift`, alongside the surface's `shadow-*` step.

Three reasons it is a token and not a distance:

- **One altitude for every riser.** The eye compares heights across a page faster than it
  compares shadows, so a rise that varies by site reads as a different material each time.
  Nothing forces a tier step to rise — the `/decks` row steps color and cast without moving
  — but a step that does rise now rises the same amount everywhere. Before OPT-713 the
  `/sets` tile had picked 1px on its own.
- **2px is the resting cast.** The surface climbs by exactly the offset of the `shadow-sm`
  it leaves behind (`--shadow-elevation-offset-sm`), so the rise and the cast are one
  gesture rather than two magnitudes that have to be reconciled by eye.
- **Tailwind has no 2px step.** Its `-translate-y-*` scale jumps 1px → 4px, and
  `scripts/lint-design-system.mjs` refuses off-scale spacing in app code for exactly the
  reason this token exists. The lint's own guidance is to add a design-system token instead
  of extending its allowlist.

The utility writes the standalone `translate` property — the property a lifting surface
names in `transition-[translate,box-shadow]`, so the rise and the shadow step arrive
together (§The card register). Pair it with `motion-safe:`: under
`prefers-reduced-motion: reduce` the surface still steps its color and its cast, it just
does not move, per [BRANDING-GUIDELINES.md](./BRANDING-GUIDELINES.md) §Reduced Motion.

The larger lifts already shipped on the fanned card stacks (`-translate-y-2`) and the lobby
seat art (`-translate-y-1`) are not this register: they are a card being drawn out of a
stack, where the travel is the point. They stay as they are until a ticket revisits them.

## Casting from a clipped surface

`box-shadow` is generated from the **border box**. On a chamfered surface
([SHAPE-LANGUAGE.md](./SHAPE-LANGUAGE.md)) that is the wrong silhouette twice over: put it
on the unclipped frame root and it paints square corners straight through both cuts; put it
on the clipped layer and the clip deletes it, because a cast shadow is by definition outside
the polygon. `filter: drop-shadow()` on the root traces the clip correctly, but it
rasterizes the whole subtree and makes the root a containing block for fixed descendants —
too much action at a distance for a 2px offset.

So `ChamferFrame` casts the step itself. `shadow` / `shadowHover`
(`src/components/ui/chamfer-frame.tsx`) render one empty layer clipped to the same polygon,
filled with the shadow color, translated down-right by the shadow offset, painted behind the
surface at `z-index: -2` (below the focus ring at `-1`, which overlaps it on the right and
bottom edges). A zero-blur `drop-shadow` _is_ the silhouette translated and recolored, so
the two are geometrically identical by construction.

Two consequences worth stating:

- **No miter compensation.** The hairline and the focus ring are strokes and must read at a
  uniform perpendicular width, so an inset layer's cut shrinks by `(2 − √2)·d`
  ([SHAPE-LANGUAGE.md](./SHAPE-LANGUAGE.md) §Implementation notes). A cast is not a stroke:
  the light direction is fixed, so an edge oblique to it legitimately casts wider — a
  `d`-offset diagonal measures `d·√2` perpendicular, which is exactly what `box-shadow` and
  `drop-shadow` produce at a rounded or cut corner. Compensating it would be the bug.
- **Same tokens, taken apart.** `--shadow-elevation-{sm,md,lg}` are composed in
  `src/app/globals.css` from `--shadow-elevation-offset-*` and `--shadow-elevation-color-*`,
  surfaced as `--shadow-offset-*` / `--shadow-color-*`. Rectangular chrome consumes the
  composed `box-shadow`; the clipped cast consumes the halves. One source, so the ladder
  cannot drift between the two. The `chamfer-shadow-{none,sm,md,lg}` utilities only set the
  pair, which is why rest and hover are a class swap the layer follows — including the
  transition, since its `translate` and `background-color` computed values change with them.

Unclipped surfaces keep using `shadow-sm/md/lg` directly. Nothing here changes the scale, the
ladder, or the anti-stacking rules; it is only how a clipped surface obtains the same cast.

## The glow exemption

`shadow-[0_0_Npx_var(--gb-signal-*)]` glows on battle rings and life-zone pulses are
**semantic signals, not elevation** — zero-offset, symmetric, meaning "this object is in a
state," not "this object is raised." They are specified in
[INTERACTION-GRAMMAR.md](./INTERACTION-GRAMMAR.md) §3.2 and deliberately pass the shadow
lint (a zero-offset blur is recognized as a glow). Do not use a glow to fake elevation; do
not use elevation to fake a signal.

## When you add a surface

1. **Does it overlap content transiently?** No → give it an elevation color step and stop.
   Two exceptions read as objects resting on the page even though they never move over
   anything, and both take `shadow-sm` rest → `shadow-md` hover: the card register — a card
   tile or an art-bearing row (§Structural rows vs. art-bearing rows) — and the solid button
   variants (§The solid-button register). If it is a card the user cannot act on, it rests
   at `shadow-sm` and stops there (§Non-interactive card previews). If it is a button on a
   surface that already casts, it takes `elevation="flat"`.
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

## Anti-stacking rules

- One elevation treatment per surface; never shadow + edge frame, never shadow + glow.
- One hover change per interaction: a card hover is lift + `shadow-md`, not lift + shadow +
  border + glow (BRANDING-GUIDELINES §Design Principles, motion rules).
- "One change" means one **tier**, not one property. The ladder pairs an elevation color
  with a shadow token per tier, so a hover that moves a surface up one tier moves both
  together and is still a single change — the `/decks` row goes `bg-surface-1` +
  `shadow-sm` → `bg-surface-2` + `shadow-md`, the same way the documented card hover is
  "lift + `shadow-md`" rather than a lift alone. What the rule forbids is mixing
  _registers_: altitude plus a border swap plus a glow are three different sentences about
  the same hover.
- Elevation color steps are compressed on purpose (22 → 27 → 32 → 37%): if a surface needs
  to shout, that is salience (COLOR-LANGUAGE), not altitude.
