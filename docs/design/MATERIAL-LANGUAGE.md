# Material Language

> **Status:** Adopted direction (2026-08-07), scoped to the **game board**. Only the Tier-5
> information surface is in active implementation (OPT-616 app tooltip, OPT-624 game tooltip);
> all other tiers are gated on the canvas-treatment go-ahead. This is the OPTCG adaptation of an
> exploratory Guildrun/LoR material brief — where this doc and the source brief disagree, this doc
> wins. Companion doc: [SHAPE-LANGUAGE.md](./SHAPE-LANGUAGE.md). Tracking: Linear "Material Design
> Language" project.

---

## Scope

**The material language is the game board's design system.** The app retains the warm navy/gold
foundation and Erode display face per [BRANDING-GUIDELINES.md](./BRANDING-GUIDELINES.md). From this
system, the app adopts exactly three things:

1. **Ornament is a boundary treatment, never a surface treatment** — perimeters and hierarchy seams
   only; interiors dead flat.
2. **Exactly one premium CTA per screen.**
3. **The Tier-5 information surface** (tooltips) — shared app + game, specified below.

Lobbies stay app-side for the foreseeable future; lobby work targets brand cohesion with the app,
not material treatment.

**Theming roadmap:** theming will cover **both** the app and the game board as separate tracks,
with distinct palettes authored for each. The shipped "game board is non-themable" contract
describes today's code, not the destination — this doc's token architecture must not preclude board
palettes. Distant-future vision (explicitly out of scope now): a TFT-style themable board layer
rendered beneath the game. The ambient tier below is the architectural slot that layer would occupy.

## Core principles

- **Materials are hierarchy tokens, not decoration.** The precedent (LoR) shipped three named
  materials mapped to tiers — canvas base → gold & glass for premium interactions → embers for
  celebration — over a deliberately neutral palette so *art* carries the color. On our board, card
  art is the hero; surfaces exist to stage it.
- **Ornament lives on boundaries.** Chamfers, hairlines, brackets, chevrons on perimeters and seams.
  Panel interiors are dead flat. (Shape vocabulary: see SHAPE-LANGUAGE.md — the two docs share one
  closed ornament set.)
- **Rarity/rank is a material, not a badge.** State → material treatment is a strict mapping.
- **One implied light source: top, slightly left**, across every component. (The Tier-5 border
  gradient direction encodes this.)
- **The game should feel premium and thoughtful without competing with card art.** Restraint is the
  premium signal, not density.

## The five-tier surface ladder

| Tier | Name | Treatment | Status |
|---|---|---|---|
| 1 | **Ambient** | Painted background, blurred, darkened, vignetted; bleeds through at ~15%. Future home of the themable board layer. | Deferred |
| 2 | **Panel** | Semi-transparent dark surface, gold 1px perimeter rule, chamfered corners, L-brackets. | Deferred |
| 3 | **Object** | Cards/rows: neutral hairline, cut corners, art overflows the frame, trait tabs protrude outside the edge. | Deferred |
| 4 | **Premium CTA** | Gold double-rule + gradient + chevron pair. **Exactly one per screen.** | Deferred |
| 5 | **Information** | Tooltips opt out of everything: near-opaque flat dark, single neutral border, no gold, no chamfer, no transparency, square corners. | **Adopted — in flight** |

Tier 5 is the readability mechanism and builds **first** so the other tiers don't drift it.
"Deferred" means: not until we're comfortable adding chrome and visual flair to the board at all.
Card art remains the focus; the ladder rolls out only when it can serve that.

### Tier 5 specification (adopted)

- Surface: near-opaque flat dark (`--surface-info`-class token; board side uses a `gb-*` primitive).
- Corners: square. No chamfer, no radius.
- Border: **neutral** 1px (not gold), with a **very subtle lighting gradient, top-left →
  bottom-right** — brighter top-left, consistent with the light source. Square corners make the
  gradient border implementable with border-image or the two-layer background technique; no radius
  conflict.
- No transparency, no backdrop blur, no glow.
- In-tooltip text color convention: **white for keywords and all numeric values** (amended — the
  source brief's amber-numerals convention is rejected); status colors for status words.
- Reference designs: Figma Frame 82 (app card tooltip → `CardInfoPanel`, OPT-616) and Frame 81
  (game tooltip with per-clause availability, power-modifier chevrons, and the action/negative-
  effect glyph row → OPT-624).

## Amendments to the source brief

| # | Source brief | Our version | Rationale |
|---|---|---|---|
| 1 | Teal accent `#1FBF9C`; teal gradient in the premium CTA | **Gold is the premium material** — the existing brand gold family takes the premium/celebration tiers | Mirrors LoR's own canvas → *gold* & glass → embers ladder; keeps the system OPTCG-native; the product already owns warm gold. Teal was the palette family rejected twice (2026-03 pivot, 2026-07-24 VQA). |
| 2 | Selection wash in fixed teal; "thematic color field" backdrop | **Selection/effect feedback is universally colored** — one accent hue for all cards (final hue TBD; gold family is the candidate) | Keeps effect feedback instantly scannable and keeps semantic color out of the interaction layer, which board theming can't afford. **Future exploration (noted, not v1):** card-color-thematic washes mapped to the six TCG colors. |
| 3 | Amber numerals in tooltips | **White numerals** | Legibility and restraint; amber reserved for nothing yet. |
| 4 | Tooltip frames drawn with gold borders (Figma frames) | **Neutral borders win** (brief's own Tier-5 rule), plus the subtle lighting gradient | Tier 5 opts out of gold by definition; the gradient encodes the light source without promoting the tooltip up the ladder. |
| 5 | "No display serif; single humanist sans" product-wide | **Typography rules are board-scoped.** The app keeps Erode per the branding guidelines. The shared tooltip pair needs one answer — being resolved in Figma. | The Erode direction is a locked app-brand decision; the board is a different register. |
| 6 | Charcoal-teal surface family | **Canvas temperature undecided; treatment deferred entirely** | Decide dead-neutral vs. slightly warm charcoal when board chrome is welcome at all. |

## Selection behavior (deferred with Tier 2+)

The element doesn't change — the environment does. Full-bleed vertical wash column behind the card
(extends past panel bounds; must render outside the card's stacking context or it clips), backdrop
swap, hairline brightens slightly, small lift. No glow ring, no thick outline, no scale punch.
Wash color: the universal accent (amendment #2). Composes with the interaction grammar
([INTERACTION-GRAMMAR.md](./INTERACTION-GRAMMAR.md)): grey rejection stays grey; the wash is the
affirmative counterpart.

## Implementation

Pure CSS is viable because the ornamentation is geometric, not illustrative:

- **CSS:** chamfered frames (`clip-path` polygon, two-layer — outer edge color, inner inset 1px),
  hairlines, brackets, chevrons, all five surface tiers (rgba + `backdrop-filter`), selection wash,
  vignette, lift, type system.
- **Inline SVG:** ~30–40 icon glyphs, sprited, `currentColor` for state inheritance (the Frame 81
  glyph row — available actions + applied negative effects — comes from this set).
- **Raster only for:** background plates, card art, and a 128×128 tiled grain PNG (not
  `feTurbulence`).
- **Embers:** discrete moments = pure CSS (15–25 radial-gradient divs, `mix-blend-mode: screen`,
  randomized drift/flicker via custom properties). Ambient drift = Canvas 2D, ~150–300 procedurally
  drawn particles. No particle library.

### Starting token set (amended)

Board-side tokens land as `gb-*` primitives mapped to semantic roles; values below are starting
points, not finals. Gold values should derive from the existing brand gold primitives rather than
the source brief's `rgba(198,168,108)`.

```css
--ambient:        bg image + blur(8px) + brightness(.45) + vignette   /* tier 1 */
--surface-panel:  rgba(14, 24, 24, .82) + backdrop-blur(6px)          /* tier 2 — temperature TBD */
--surface-object: rgba(20, 28, 30, .90)                               /* tier 3 — temperature TBD */
--surface-info:   rgba(16, 21, 24, .97)                               /* tier 5 — adopted */
--edge-gold:      <derive from brand gold primitives>                 /* perimeter hairlines, tiers 2/4 */
--edge-neutral:   rgba(255, 255, 255, .16)                            /* tier 3/5 hairlines */
--edge-info:      linear-gradient(135deg,
                    rgba(255,255,255,.22), rgba(255,255,255,.10))     /* tier 5 border lighting */
--select-wash:    <universal accent, hue TBD — vertical gradient,
                   transparent → ~.22 → ~.14 → transparent>
```

### Known traps (encode in Figma before extraction)

- Corner smoothing has no CSS equivalent — set to 0.
- Chamfers must be authored as vector polygons with the chamfer px annotated.
- Only Background Blur maps to `backdrop-filter`.
- Figma gradient angle values don't match CSS `deg`.
- Skip noise plugins; letter-spacing % ÷ 100 = em; blend modes on fills only, never strokes.
- **ScaledBoard:** the board renders at ~0.59 scale at the 1280×640 floor viewport — 1px hairlines
  and small chamfers authored naively become sub-pixel smears. Author scale-compensated line
  weights, or render ornament in unscaled chrome. This applies to every tier.

### Contract amendments required at adoption

Tracked in OPT-625; none are made unilaterally by this doc:

- Radius rule (styling rule #5) → shape-semantics table in SHAPE-LANGUAGE.md.
- Design-system lint: chamfer clip-paths, grain PNG, ember divs, Canvas particle layer.
- Contrast gate: new fg/bg pairs (light-weight wide-tracked caps at small sizes is the AA risk).
- Theming contract language: two-track (app + board) palette roadmap; retire "board is
  non-themable" phrasing in favor of "board themes are a separate track."

## Rollout sequencing

Tier 5 (now) → panels/objects → premium CTA → selection wash → embers — with everything after
Tier 5 gated on the board-chrome go-ahead. Each stage ships behind the same VQA + design-lint gates
as app work.
