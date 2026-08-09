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
| **Rounded rectangle** (`aspect-card` radii) | Card faces, card thumbnails, art crops, sleeves, holofoil surfaces | The card silhouette. Nothing else may use it. |
| **Circle** | User avatars, presence dots | People, not objects. Distinct from both cards and chrome. |
| **Square corners** (0 radius) | Tier-5 information surfaces (tooltips), dense data rows | Already adopted via the tooltip spec. The "quiet" end of angular. |
| **Chamfered polygon** | Panels, buttons, tabs, badges — default chrome | The workhorse. See vocabulary. |
| **Feature polygons** (pennant, swallowtail, hex, diamond) | One per screen region, at hierarchy moments | The "loud" end. Budgeted. |

Pills (`rounded-full`) are deprecated for chrome under this direction; existing pill badges migrate
to chamfered or square forms as surfaces are touched.

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
7. **Elongated hexagon** — **drop targets only** (reserved, per the material brief).
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
  requirement, and only fails when a `chamfer-*` class is used without a matching
  declaration. Feature polygons (pennant, swallowtail, hex, diamond) are **not** in the
  primitive and remain deferred.
- **CSS:** `clip-path: polygon(...)` for all cuts. Borders on clipped elements require the
  **two-layer technique**: outer element carries the edge color, inner element (inset by the
  hairline width, same polygon) carries the surface. `border-*` properties do not follow clip-path.
- **Focus rings:** `outline` ignores clip-path geometry. Focus states use an inset ring layer
  (a third layer or `box-shadow: inset`) or a dedicated focus polygon; verify visibility on every
  clipped interactive shape.
- **Hit areas:** clip-path clips pointer events. For small controls, keep the interactive box
  rectangular and clip a *child* so the hit target stays ≥ the visual shape.
- **ScaledBoard:** inside the scaled subtree (~0.59 at the 1280×640 floor), 1px hairlines and 4px
  chamfers land sub-pixel and smear. Author board-side shapes at scale-compensated sizes, or render
  ornament in unscaled chrome. Same rule as the material language's hairline caveat.
- **Figma:** corner smoothing 0; author chamfers as vector polygons with the cut size annotated in
  px; pennant/swallowtail apexes as explicit vector points, never radius tricks.

## Rollout

1. **Now (documentation-first):** new Figma work uses this vocabulary. No lint changes yet.
2. **Tier-5 tooltips** ship square-cornered (already in flight — OPT-616 / OPT-624). First shipped
   proof of the angular register.
3. **Game board / material surfaces** adopt the vocabulary as the material tier ladder rolls out
   (gated on the canvas-treatment go-ahead — see MATERIAL-LANGUAGE.md).
4. **App chrome** migrates opportunistically as surfaces are redesigned (navbar refresh, decks
   redesign, lobby cohesion work), each migration amending the radius rule's allowlist.
5. **Contract amendment:** once adoption reaches critical mass, styling rule #5 (three-radius set)
   in CLAUDE.md / BRANDING-GUIDELINES.md is rewritten to this doc's semantics table, and
   `scripts/lint-design-system.mjs` learns the chamfer steps.
