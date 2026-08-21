# Shape Language

> **Status:** Adopted direction (2026-08-07). Documentation-first — the shipped radius contract in
> [BRANDING-GUIDELINES.md](./BRANDING-GUIDELINES.md) and the design-system lint remain in force until
> migration issues land. This doc defines where the shape system is going and the vocabulary new
> work should be designed against. Companion doc: [MATERIAL-LANGUAGE.md](./MATERIAL-LANGUAGE.md).

---

## Thesis: shapes highlight cards, they don't imitate them

The entire product orbits one object: the card. Physical OPTCG cards are **rounded rectangles** —
that silhouette is the single most recognizable shape in the product, and card art is the hero of
every screen.

The original brand direction rounded the UI to "emulate the cards." The revised position inverts
that: **when chrome shares the card's silhouette, it competes with cards instead of framing them.**
A rounded panel, a rounded button, and a rounded card thumbnail all read as siblings; the eye has to
work to find the actual game object.

So the shape system is a figure-ground rule:

> **Rounded geometry is reserved for cards and card-derived content.
> Interface chrome is angular and polygonal.**

Angular chrome does two jobs at once:

1. **Contrast** — the card is the only rounded rectangle in view, so it pops without needing glows,
   borders, or lifts. The frame recedes; the object advances.
2. **Register** — polygonal frames read as *environment*: the arena, the machine, the stage the
   cards perform on. This is the visual grammar of the reference set (Guildrun, TFT, the League
   client, Overwatch) and it supports the "premium and thoughtful" goal without decorative noise.

This composes with the material language's ornament rule: ornament lives on **boundaries**, never
surfaces. Shape *is* a boundary treatment — the polygon is the perimeter. Interiors stay dead flat.

## Reference set — what each example contributes

| Reference | What we take from it |
|---|---|
| **Guildrun hero select** | Vertical pennant panels (pointed bottom) framing character art; chamfered shoulders; rotated-square diamond sockets; angular metallic seam layers. The art overflows the frame — the frame never clips the subject's silhouette. |
| **TFT augments** | Shape-as-tier: each rarity is a differently-shaped *frame* around a constant content layout. Also a caution: the augment panels are card-shaped, and at a glance they read as playable cards — exactly the confusion our rule exists to prevent. |
| **League client lobby** | The swallowtail banner (notched bottom) as a "featured identity" pedestal; the chamfered hexagonal CTA (FIND MATCH) — one premium action, one distinctive shape. |
| **Overwatch home** | Discipline: dead-square corners everywhere, hard 45–60° diagonal splits as section dividers, small square icon buttons. Angularity via *restraint*, not ornament density. |

## Shape semantics — who gets what

| Geometry | Reserved for | Notes |
|---|---|---|
| **Rounded rectangle** (`rounded-card`) | Card faces, card thumbnails, art crops, sleeves, holofoil surfaces | The card silhouette. Nothing else may use it. See §The card radius. |
| **Circle** | User avatars, presence dots | People, not objects. Distinct from both cards and chrome. |
| **Square corners** (0 radius) | Tier-5 information surfaces (tooltips), dense data rows | Already adopted via the tooltip spec. The "quiet" end of angular. |
| **Chamfered polygon** | Panels, buttons, tabs, badges — default chrome | The workhorse. See vocabulary. |
| **Feature polygons** (pennant, swallowtail, hex, diamond) | One per screen region, at hierarchy moments | The "loud" end. Budgeted. |

Pills (`rounded-full`) are deprecated for chrome under this direction; existing pill badges migrate
to chamfered or square forms as surfaces are touched.

### The card radius

*Shipped 2026-08-20 (OPT-715).* The table above named a radius the system did not have, so raw-card
surfaces borrowed chrome's — `/cards` tiles clipped a 224px card at 2px and the deck-builder fan
clipped a 100px card at 4px. `box-shadow` is generated from the border box, so each one's hard cast
faithfully traced the wrong silhouette; that mismatch is what made the shadows read as "the same
corner rounding as all other objects."

The primitive is `--card-radius` (`4%`) and the `rounded-card` utility in `src/app/globals.css`.

**It is a ratio, not a length.** A printed OPTCG card is 63 × 88mm with a ~2.5mm corner, so the
corner is ~4% of the card's width at every size the card is ever seen at. One percentage therefore
serves a 69px lobby thumbnail (2.8px), a 100px fan card (4px), a 224px `/cards` tile (9px), and a
400px detail scan (16px) the way one physical card serves all of them — the corner scales with the
object instead of being re-picked per surface. A fixed px step cannot: it reads square on the tile
or blobby on the thumbnail, and picking one per site is how the 2px/4px disagreement started.

**Why the slash.** A percentage `border-radius` resolves horizontally against width and vertically
against height, which are different lengths on a 600/838 box, so a bare `4%` paints a 1.4:1 ellipse.
`rounded-card` writes `var(--card-radius) / calc(var(--card-radius) * 600 / 838)`, scaling the
vertical percentage by the same ratio `aspect-card` states. Both radii resolve to the identical
pixel length and the corner is a true quarter-circle.

**Where it goes: the box that *is* the card.** A raw-art crop, a card face, a card-shaped slot, and
the skeleton standing in for one. A framed panel that merely *contains* a card is chrome and keeps
`rounded-md` — including a tile that adds a caption strip below the art (the deck-builder search
tile, the card-detail art-variant thumbnails). There the card silhouette sits on the art crop and
the frame casts its own 2px corner, which is the figure-ground rule working rather than a
compromise: a rounded card inside an angular frame is exactly the contrast this doc opens with.

Two things force that split rather than merely recommending it. The quarter-circle above is exact
only on a 600/838 box, so a caption makes the corner run tall in proportion to the caption's
height. And a skeleton's caption is never the same height as the real one, so a tile carrying the
radius would visibly change corner size as content streamed in. **The element carrying
`rounded-card` must therefore also carry `aspect-card` or an explicitly reserved card-shaped box** —
otherwise the percentage resolves against whatever height the content happens to have at that
moment, including zero before an image loads.

**The game board too** *(2026-08-21, OPT-720)*. The board was deferred out of OPT-715 on the
ScaledBoard note below: at the 1280×640 floor the board scales to ~0.59, so 4% of an 80px field card
paints ~1.9px, which is inside the sub-pixel band that note warns about. Adopted anyway, because the
objection cuts both ways. The `rounded` it replaced was 4px *authored*, not 4px *painted* — the same
board scale takes it to ~2.4px at that same viewport. Nothing on the board was ever rendering at its
authored radius, so the choice was never "4px versus 1.9px"; it was "a length that happens to land
somewhere, versus a ratio."

The scale is what settles it. `BoardLayout` applies one CSS `zoom` factor to the board layer, and
`zoom` scales lengths and resolves percentages against the same scaled box — so a percentage radius
holds exactly 4% of the card's painted width at every size the board is ever rendered at, which is
the physical-card argument above working rather than failing. The 4px it replaced held 5% of an
80px card, and held it only as an authored number the viewer never sees. Adopting costs `0.8px ×
boardScale` — under a pixel at any viewport, about half of one at the floor — and makes every larger
viewport proportionally correct. No scale compensation, no board-specific constant: the board card
is the same object as the `/cards` tile, so it takes the same corner.

The layers move as one. The radius is shared across the stack in `card.tsx` — the focus-ring
wrapper, the three transform layers, the power flash — plus `card-front.tsx`, `card-back.tsx`,
`card-highlight-ring.tsx`, and the reserved card box in `life-zone.tsx`. `box-shadow` and `overflow`
both follow `border-radius`, so a layer left behind traces a visibly different corner over the one
beneath it. The consumer wrappers that shrink-wrap a fixed-size `<Card>` move too — the modal
selection buttons, the hand drag wrapper, the DON token and attached-DON handles, and the stage and
field targeting wrappers all own focus or selection rings that hug a card face. Boxes that merely
*hold* a card stay chrome: the field-card wrappers reserve a 112×112 square so a rested card can
rotate inside them, and a square is not a card; so do the zone slots that draw their own border.

**Card-shaped, to a tolerance.** The `CARD_SIZES` tokens are not literally 600/838. Four are 5:7
(field 80×112, modal 120×168, preview 200×280, don 50×70) and `hand` is 42:59 (84×118), against the
printed 300:419. The consequence is that the two radius axes disagree by **0.005–0.020px** — the
corner is a circle to well within a rendered pixel, not exactly. That is the real invariant and what
the test pins; the tokens track board geometry and should not be bent to the printed ratio for a
fiftieth of a pixel.

**Lint.** The design-system lint derives its radius rules from this vocabulary rather than from a
list of bad spellings. Every `rounded-*` class in a class position must resolve to either the
documented chrome scale or a utility declared in `globals.css`, so `rounded-crad` and
`rounded-card-lg` both fail as unknown; a class composed at runtime (`` `rounded-${kind}` ``,
`` `${state}:rounded-card` ``) fails because Tailwind only ever sees whole names. Adding a shape
utility to `globals.css` extends the accepted set; nothing else does.

## Vocabulary (closed set)

Extends the material language's ornament set. As with materials, this is a **closed set** — new
shapes require amending this doc, not ad-hoc invention.

1. **45° chamfer** — corner cut at exactly 45°. Depth steps: **4 / 8 / 12px** (mirroring the
   retired radius steps: badge / control / panel). Default: cut the two *outer* corners of a
   component (top-left + bottom-right, agreeing with the top-left light source), full four-corner
   cuts for symmetric feature panels.
2. **Pennant** — vertical banner terminating in a centered point (90° apex). Feature framing for a
   single identity: a leader, a hero, a featured deck. Art may overflow the frame edges.
3. **Swallowtail** — vertical banner terminating in a centered *notch* (inverted pennant). Pedestal
   variant — labels, featured slots, "this is yours" moments.
4. **Rotated-square diamond** — 45°-rotated square. Icon sockets, slot markers, empty-state
   placeholders for equippable/selectable things.
5. **L-bracket corner marks** — from the material brief. Selection and hierarchy seams; sits *on*
   a perimeter, never floats.
6. **Chevron pair** — directional emphasis on the premium CTA and progression moments only.
7. **Elongated hexagon** — drop targets, plus the printed-notation exception below.
   *Amendment (2026-08-12, OPT-677):* evergreen keyword chips in card effect text
   ([Rush], [Blocker], [Banish]) take this shape, because the printed card does. It is a
   notation contract rather than a decorative choice, so it is exempt from the
   one-feature-shape-per-region budget — a rules box prints as many keyword hexagons as the
   card has keywords. It stays scoped to the `keyword` family; no other notation family
   takes a polygon. Built from the `effect-hex*` utilities in `globals.css`, which are a
   worked example of the two-layer border technique below.
8. **Notched tab** — a chamfered tab protruding *outside* its parent's edge (trait tabs on object
   rows, per the material Object tier).
9. **Hard diagonal** — 45° section divider / split. Layout-scale only (splitting regions, not
   decorating components).

**Angle discipline:** 45° everywhere, 90° pennant/swallowtail apexes, 120° hexagon corners.
No other angles. This is what keeps polygonal from becoming "gamer clutter."

**Angularity budget:** chamfers are ambient and free. Feature polygons (pennant, swallowtail, hex,
diamond clusters) follow the premium-CTA rule — approximately **one feature shape per screen
region**. If two pennants compete, neither is featured.

## Relation to design goals

- **Card art is the hero** — the figure-ground rule is this principle, expressed in geometry.
- **Premium and thoughtful** — crafted polygons with a strict angle grammar read as machined and
  intentional; generic rounded rectangles read as default SaaS.
- **One Piece warmth** — warmth stays the job of color (warm navy, gold, near-white) and type.
  Shape carries *structure*, not temperature. Angular chrome under warm light is the target blend.
- **Tight system, loose expression** — closed vocabulary, strict angles, budgeted features; within
  that, layouts are free to compose.

## Implementation notes

- **Shipped primitive (OPT-629):** chamfers are available through
  `ChamferFrame` (`src/components/ui/chamfer-frame.tsx`), which encapsulates every note
  below. Props: `cut` (`sm`/`md`/`lg` → 4/8/12px), `corners` (`outer`/`all`), `edge`
  (`none`/`neutral`/`gold`/`lighting`), `interactive`, `asChild`, and `surfaceClassName`.
  `edge="none"` is a first-class borderless variant and the default. The CSS lives in
  `src/app/globals.css` as `chamfer-*` utilities over the `--chamfer-*` and `--edge-*`
  tokens; the design-system lint treats that vocabulary as an **allowance**, not a
  requirement (see Rollout step 1), and fails only on a `chamfer-*` class with no matching
  declaration or one composed dynamically. Feature polygons (pennant, swallowtail, hex,
  diamond) are **not** in the primitive. Pennant, swallowtail and diamond remain deferred;
  the elongated hexagon is the one implemented exception, shipped for keyword notation
  chips (OPT-677) as the standalone `effect-hex`, `effect-hex-hairline` and
  `effect-hex-inset` utilities in `globals.css` rather than as a `ChamferFrame` variant.
  It is a worked example of the two-layer border technique and the miter compensation
  below, applied to an apex instead of a 45° cut. Feature polygons entering the primitive
  is still deferred; the next one should generalize these three utilities rather than
  add a fourth bespoke set.
- **Shipped primitive (OPT-715):** the card silhouette is `rounded-card` over `--card-radius`,
  declared beside `aspect-card` in `src/app/globals.css`. It needs no cast machinery —
  `box-shadow` follows `border-radius` natively, so a raw-card surface that clips at the card
  radius casts the card's own corner. See §The card radius.
- **CSS:** `clip-path: polygon(...)` for all cuts. Borders on clipped elements require the
  **two-layer technique**: outer element carries the edge color, inner element (inset by the
  hairline width) carries the surface. `border-*` properties do not follow clip-path.
- **Miter compensation:** the two layers must *not* share an identical polygon. Insetting a layer by
  `d` moves its diagonal from `x + y = cut` to `x + y = cut + 2d`, a perpendicular separation of
  `d·√2` — so an equal cut paints a diagonal hairline ~41% heavier than the straight edges. Reduce
  the inner cut by `(2 − √2)·d` to keep the perpendicular width uniform.
- **Focus rings:** `outline` ignores clip-path geometry, and `box-shadow: inset` is **not** a
  substitute — it traces the border-box rectangle, so the clip erases it exactly at the cuts. Draw
  the ring *inside* the element's own bounds (a focus-colored layer beneath, revealed by shrinking
  the outermost layer's clip by the ring width), never outside them: any `overflow-hidden` ancestor
  would clip an outset halo away and leave keyboard focus invisible. Verify visibility on every
  clipped interactive shape, borderless included.
- **Hit areas:** clip-path clips pointer events. For small controls, keep the interactive box
  rectangular and clip a *child* so the hit target stays ≥ the visual shape.
- **ScaledBoard:** inside the scaled subtree (~0.59 at the 1280×640 floor), 1px hairlines and 4px
  chamfers land sub-pixel and smear. Author board-side shapes at scale-compensated sizes, or render
  ornament in unscaled chrome. Same rule as the material language's hairline caveat. **A
  proportional radius is the exception** (OPT-720): the board scale is a single uniform factor —
  CSS `zoom` on the board layer, so descendants lay out at final pixel size — and `rounded-card`
  scales with the card it sits on, needing no compensation. The caveat is about *lengths* authored
  in px, which the scale shrinks away from the number they were picked for. A ratio has no such
  number to lose.
- **Figma:** corner smoothing 0; author chamfers as vector polygons with the cut size annotated in
  px; pennant/swallowtail apexes as explicit vector points, never radius tricks.

## Rollout

1. **Now (opt-in enablers):** new Figma work uses this vocabulary. The `ChamferFrame` primitive and
   its tokens ship as an **additive allowance** (OPT-629) — a surface may adopt chamfers, none is
   required to, and the radius rule is unchanged for everything that has not. The lint's only
   chamfer rules police the vocabulary's own integrity (a `chamfer-*` class must be declared in
   `globals.css`, and must not be composed dynamically); this is deliberately *not* the adoption
   contract in step 5.
2. **Tier-5 tooltips** ship square-cornered (already in flight — OPT-616 / OPT-624). First shipped
   proof of the angular register.
3. **Game board / material surfaces** adopt the vocabulary as the material tier ladder rolls out
   (gated on the canvas-treatment go-ahead — see MATERIAL-LANGUAGE.md).
4. **App chrome** migrates opportunistically as surfaces are redesigned (navbar refresh, decks
   redesign, lobby cohesion work), each migration amending the radius rule's allowlist.
5. **Contract amendment enacted (2026-08-12):** styling rule #5 now gives all chrome 2px corners;
   `rounded-md` and `rounded-lg` both resolve to 2px. Badges alone keep `rounded` (4px), while
   `rounded-full` is reserved for avatars and presence dots. The chamfer lint remains an allowance
   for adopted angular surfaces rather than a requirement on all chrome.
6. **Card silhouette shipped (2026-08-20, OPT-715):** the 2026-08-12 amendment flattened chrome to
   2px and swept card tiles along with it, because the rounded-rectangle row of the shape-semantics
   table pointed at a primitive nobody had built. `rounded-card` is that primitive; every raw-card
   art site now takes it and the chrome scale is untouched.
7. **Board card faces adopted (2026-08-21, OPT-720):** the board was the one deferral left by the
   step above, held back on the sub-pixel worry in the ScaledBoard note. Resolved in favour of the
   ratio — the transform scales the old fixed radius too, so the board was never painting the 4px it
   authored (§The card radius). The card stack in `card.tsx`, both faces, the highlight ring, the
   life-zone box, and the board's loading skeleton all move together. Wrappers that reserve a square
   for a rotating card stay chrome; the vocabulary is unchanged.
