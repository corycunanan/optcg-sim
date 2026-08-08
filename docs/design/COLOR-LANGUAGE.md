# Color Language

> **Status:** Adopted direction (2026-08-07). Governs how palettes are authored for **both**
> theming tracks — app themes and (future) game-board palettes. Companion docs:
> [SHAPE-LANGUAGE.md](./SHAPE-LANGUAGE.md), [MATERIAL-LANGUAGE.md](./MATERIAL-LANGUAGE.md).
> Token names/values live in `src/app/globals.css`; this doc governs how values are *chosen*.

---

## Thesis: color directs focus, it doesn't perform

Card art is the most important surface in the product, and card art is *loud* — six saturated TCG
colors, full-bleed illustration, holofoil. The UI cannot win a color contest against it and must
not enter one. Color's job in the chrome is **direction**: guiding the eye to the most important
element on screen, then getting out of the way.

**Salience hierarchy** — the brightest, most chromatic thing in view should be, in order:

1. **Card art** — always wins.
2. **The focal action** — the one premium CTA, or the active selection. One per screen.
3. **Status that matters now** — errors, warnings, live counters.
4. **Chrome** — everything else. Quiet by construction.

If a panel, gradient, or background ever competes with tier 1–2, the palette is wrong, not the
layout. Squint test: squint at any screen — what still pops should be card art and at most one
focal element.

## The two contrast budgets

"Lower contrast" applies to exactly one of these. Never confuse them:

- **Salience contrast (compressed — this doc):** surface-vs-surface steps, hue spread, chroma in
  chrome. Adjacent elevation steps stay close in lightness — elevation should be *felt*, not seen
  as banding. Chrome lives in one temperature family per theme; hue variety among panels is a bug.
- **Accessibility contrast (untouchable):** text vs. background, focus indicators, interactive
  affordances. WCAG AA (4.5:1 text) and the 19-pair `pnpm run check:contrast` gate hold for every
  theme, no exceptions. Compressed surfaces make this *harder*, not optional — when surface steps
  move closer together, text tokens must be re-verified against every step they sit on.

A theme spends its salience budget on cards and the focal action. It never buys quiet chrome by
discounting text legibility.

## Palette authoring rules

1. **One temperature family per theme.** The default is warm navy; a theme may be cool, neutral, or
   warm — but chrome hues stay inside one family. Personality comes from *temperature + accent
   choice*, not from hue spread.
2. **Chroma is reserved.** Saturated color appears only as: the accent (one per theme, gold in the
   default), status colors (error/warning/success), destructive red, and the six non-themable TCG
   card colors. Everything else is low-chroma steps of the theme family.
3. **Compressed elevation ladder.** Surface steps (page → panel → control → overlay) move in small
   lightness increments. If a panel edge is obvious from across the room, the step is too big —
   that's what hairlines and shape are for (see SHAPE-LANGUAGE.md: structure is shape's job,
   temperature is color's).
4. **Gradients are ambient, never structural.** Low-amplitude, slow ramps (background washes,
   vignettes, the Tier-5 border lighting). Never on component interiors — interiors are dead flat
   per the material rule — and never steep enough to read as a "design element" next to card art.
5. **Background art is Tier-1 ambient.** Blurred, darkened, vignetted, bleeding through at low
   opacity (~15%, per MATERIAL-LANGUAGE.md). No high-frequency detail or bright fields behind any
   surface where cards sit. Comfortable over long sessions beats impressive in a screenshot —
   players deckbuild for hours.
6. **Restraint is the personality.** A theme should be identifiable from its temperature, its
   accent, and its ambient art — while a spread of six differently-colored cards laid on top of it
   still dominates the screen. That layered test (theme behind a six-color card spread, art still
   wins) is the acceptance check for every new palette, on both tracks.

## Per-track notes

- **App themes:** override primitives only, per the theming contract. Every registered theme passes
  the contrast gate; genuinely new fg/bg combinations are added to `scripts/contrast-pairs.json`,
  not waved through.
- **Board palettes (future track):** same rules, tighter budget — the board shows more simultaneous
  card art than any app surface, so board chrome runs even quieter. The universal selection/effect
  accent (see MATERIAL-LANGUAGE.md amendment #2) is part of the palette contract: it must stay
  salient against every board surface *and* stay out of the six card colors' way.
