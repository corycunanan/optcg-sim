# OPTCG Simulator — Branding Guidelines

> Shipped design-system reference for the M5 UI Overhaul. This document records the visual language, theming architecture, component patterns, and motion standards implemented with shadcn/ui + motion.dev. Token declarations in `src/app/globals.css` are the source of truth when this guide and the implementation differ.

---

## 1. Brand Identity

### Brand Personality

**Adventurous. Warm. Confident.**

The OPTCG Simulator channels the spirit of One Piece — joyful, energetic, and alive. It should feel like the official OPTCG website purpose-built for competitive play: clean, welcoming, and unmistakably One Piece.

### Emotional Goals

| Context | Emotion | How |
|---------|---------|-----|
| Browsing cards | Delight    | Card art as hero against controlled navy surfaces      |
| Building decks | Focus | Clean workspace, minimal chrome, clear hierarchy |
| Playing games | Immersion | Dark board, purposeful animation, responsive feedback |
| Social/lobby | Connection | Warm tones, accessible entry points, friendly presence |

### Design Principles

1. **Card art is the hero** — Restrained navy surfaces amplify artwork. UI chrome recedes.
2. **One Piece warmth** — Warm whites, gold, red, and generous spacing keep the dark foundation energetic and inviting.
3. **Tight system, loose expression** — Every spacing, type, and color decision traces back to a token. Within that system, layouts can be expressive.
4. **Motion earns its place** — Transitions communicate state changes. One clear animation per interaction.
5. **Progressive clarity** — Simple at rest, detailed on interaction. Dense information is scannable through hierarchy, not visual noise.

### Anti-References (What We Are Not)

- NOT gloomy, low-contrast, or gamer-neon
- NOT generic SaaS dashboard
- NOT over-decorated with gradients and backdrop blurs
- NOT flat/sterile/cold
- NOT retro-futuristic, synthwave, or cyberpunk

---

## 2. Reference Analysis: Riftbound

> Patterns extracted from riftbound.leagueoflegends.com that inform our design system.

### What We Adopt (Adapted to OPTCG)

| Riftbound Pattern | OPTCG Adaptation | Rationale |
|---|---|---|
| **Blade/section architecture** — full-width sections with `max-width: 1920px` content containers and responsive spacer variables | Adopt the section + constrained content model with our own width tiers | Gives pages a cinematic structure; card art can bleed to full width while text stays readable |
| **Button ornamental outline** — `outline: 1px solid; outline-offset: 3px` on primary/secondary CTAs | Apply to hero CTAs only (not utility buttons) using gold outline | Premium feel for key actions without visual noise on everyday UI |
| **Dramatic display serif** — "Beaufort for LOL" at 900 weight, uppercase, for headlines | Erode variable (600 display treatment), uppercase — expressive serif structure with confident contrast | Same energy: bold, commanding, epic. Erode adds warmth and adventure with a consistent upright treatment. |
| **Carousel with progress bar** — Embla-based, 3-up/2-up/1-up responsive, thin progress indicator + arrow buttons | Adopt for card gallery, set browser, deck showcase sections | Proven TCG card browsing pattern with smooth touch interaction |
| **Card hover scale** — `transform: scale(1.1)` on image within card, 0.3s ease-in-out | Adopt at `scale(1.03)` — more subtle, befitting our warmer aesthetic | Communicates interactivity without aggressive zoom |
| **Backdrop pattern** — background media + stacked overlay layers for readability | Adopt for hero sections (home page, set showcase) | Allows hero imagery while maintaining text legibility |
| **Aspect ratio containers** — explicit `aspect-ratio` with fallback `padding-bottom` | Adopt for all card images (OPTCG ratio ~63:88 = 0.716) and content cards (16:9) | Prevents layout shift, consistent visual rhythm |
| **Responsive spacer variables** — CSS variables that decrease at tablet/mobile breakpoints | Adopt our own 3-tier responsive spacing | Riftbound's best architectural pattern; prevents manual responsive overrides |
| **Transition timing** — color 0.25s ease-in-out, background-color 0.3s ease-in-out for interactive elements | Adopt as standard interactive transition | Smooth enough to feel responsive, fast enough to not lag |

### What We Do NOT Adopt

| Riftbound Pattern | Why We Skip |
|---|---|
| Cold, monochrome dark backgrounds (#293a4c, #013951) | Our dark foundation stays in the deep navy family and preserves warmth through warm-white text, gold, and red                |
| Orange accent (#EF7D00) as primary                   | Our palette uses gold for primary interaction and navy for structure — orange has the wrong emotional register for One Piece |
| "TT Norms Pro Compact" as body font | We already use Geist Sans, which is more contemporary and better optimized for UI |
| Styled-components architecture | We use Tailwind CSS v4 with CSS tokens — no runtime CSS-in-JS |
| `z-index: 200000` for modals | We use a sane z-index scale (see Section 8) |
| Ultra-wide `max-width: 1920px` | Our content max-width is 1280px for readability; full-bleed reserved for heroes |

---

## 3. Color System

### Philosophy

Dark-only, warm, and alive. The shipped default retains the warm navy foundation and original bright-gold CTA ramp. Near-white and white-alpha text preserve hierarchy, gold carries primary interaction and premium moments, and red brings One Piece energy. Components consume semantic roles; raw palette primitives are implementation inputs, not component APIs.

### Palette

#### Semantic surfaces (component-facing)

| Token | Value | Role |
|-------|-------|------|
| `--surface-page` | `oklch(22% 0.04 245)` | Page background |
| `--surface-panel` | `oklch(27% 0.04 245)` | Cards, dialogs, and menus |
| `--surface-overlay` | `oklch(27% 0.04 245)` | Popovers and overlay panels |
| `--surface-raised` | `oklch(32% 0.04 245)` | Elevated and hover surfaces |
| `--surface-inset` | `oklch(37% 0.035 245)` | Inputs and recessed areas |
| `--surface-nav` | `oklch(18% 0.02 245)` | Global navbar |
| `--surface-interactive` | `oklch(30% 0.04 245)` | Active and hover controls |
| `--surface-soft-strong` | `oklch(34% 0.035 245)` | Strong soft surface |
| `--surface-soft` | `oklch(27% 0.03 245)` | Selected rows and active tabs |
| `--surface-subdued` | `oklch(58% 0.04 245)` | Subdued elements and data visualization |

#### Default-theme primitives (theme authors only)

| Token | Value | Semantic role |
|-------|-------|-------|
| `--elevation-page` | `oklch(22% 0.04 245)` | `--surface-page` |
| `--elevation-panel` | `oklch(27% 0.04 245)` | `--surface-panel`, `--surface-overlay` |
| `--elevation-raised` | `oklch(32% 0.04 245)` | `--surface-raised` |
| `--elevation-inset` | `oklch(37% 0.035 245)` | `--surface-inset` |
| `--elevation-nav` | `oklch(18% 0.02 245)` | `--surface-nav` |

#### Gold semantics (interaction + treasure)

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` / `--border-focus` | `oklch(78% 0.14 75)` | Primary CTA fills, highlights, and focus rings |
| `--accent-hover` | `oklch(84% 0.12 75)` | Hover on gold fills |
| `--accent-pressed` | `oklch(70% 0.14 75)` | Pressed gold fill |
| `--accent-text` | `oklch(78% 0.12 75)` | Gold text and links; distinct from the fill color |
| `--accent-soft` | `oklch(30% 0.05 75)` | Premium callout surface |
| `--accent-fg` | `oklch(22% 0.04 245)` | Foreground on gold and destructive fills |
| `--accent-border` | `oklch(45% 0.06 75)` | Reserved decorative border for navbar/social refreshes (OPT-534/OPT-535) |

`--accent-border` is decorative only. Its contrast against `--surface-nav` is approximately 2.5:1, so it must not carry text, focus, control-boundary, or other accessibility-critical meaning.

#### Red (energy, emphasis, destructive)

| Token | Value | Usage |
|-------|-------|-------|
| `--destructive` / `--error` | `oklch(70% 0.17 25)` | Emphasis, destructive actions, and errors |
| `--destructive-hover` | `oklch(76% 0.15 25)` | Hover on destructive fills |
| `--destructive-soft` / `--error-soft` | `oklch(28% 0.045 25)` | Destructive and error callout surface |
| `--destructive-fg` | `oklch(22% 0.04 245)` | Foreground on destructive fills |

#### Text Hierarchy

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#f4f6fb` | Body text and headings |
| `--text-secondary` | `rgba(255, 255, 255, 0.72)` | Secondary labels and metadata |
| `--text-tertiary` | `rgba(255, 255, 255, 0.58)` | Placeholder and hint text |
| `--text-disabled` | `rgba(255, 255, 255, 0.42)` | Disabled content |
| `--text-inverse` | `#ffffff` | Brightest/inverse text |

#### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--border-subtle` | `rgba(255, 255, 255, 0.10)` | Default component separation and shadcn input borders |
| `--border-strong` | `rgba(255, 255, 255, 0.18)` | Emphasized boundaries |
| `--border-focus` | `oklch(78% 0.14 75)` | Accessible focus indication |

The primitive border steps are white alpha values at 0.10, 0.14, 0.16, and 0.18. Components use the semantic border roles above, not those primitive steps.

#### Semantic Colors

| Token | Value | Role |
|-------|-------|------|
| `--success` / `--success-soft` | `oklch(70% 0.15 150)` / `oklch(27% 0.04 150)` | Positive feedback |
| `--warning` / `--warning-soft` | `oklch(80% 0.13 85)` / `oklch(28% 0.04 85)` | Cautionary states |
| `--error` / `--error-soft` | `oklch(70% 0.17 25)` / `oklch(28% 0.045 25)` | Error states |

#### TCG Card Colors (functional only)

| Color | Token | Value |
|-------|-------|-------|
| Red | `--card-red` | `oklch(55% 0.20 25)` |
| Blue | `--card-blue` | `oklch(50% 0.18 250)` |
| Green | `--card-green` | `oklch(52% 0.18 150)` |
| Purple | `--card-purple` | `oklch(48% 0.18 300)` |
| Black | `--card-black` | `oklch(28% 0.01 245)` |
| Yellow | `--card-yellow` | `oklch(78% 0.18 90)` |

`--card-yellow-fg` (`oklch(22% 0.04 245)`) and `--card-accent-fallback` (`oklch(22% 0.04 245)`) complete this functional palette.

#### Preset-ready desaturated primitives

The redesign artifact's low-chroma surfaces remain in `globals.css` as unused `--desaturated-*` primitives. They are preserved for a future registered preset and are not referenced by the default semantic layer. Their elevation values are page `oklch(14% 0.004 260)`, panel `oklch(24% 0.004 260)`, raised `oklch(28% 0.004 260)`, inset `oklch(18% 0.004 260)`, and nav `oklch(12% 0.004 260)`; matching interactive/soft/subdued/ink steps are declared alongside them. Do not consume these primitives from components.

### shadcn CSS Variable Mapping

These shipped aliases map shadcn roles to the semantic layer:

```css
:root {
  --background: var(--surface-page);
  --foreground: var(--text-primary);
  --card: var(--surface-panel);
  --card-foreground: var(--text-primary);
  --popover: var(--surface-overlay);
  --popover-foreground: var(--text-primary);
  --primary: var(--accent);
  --primary-foreground: var(--accent-fg);
  --secondary: var(--surface-raised);
  --secondary-foreground: var(--text-primary);
  --muted: var(--surface-inset);
  --muted-foreground: var(--text-secondary);
  --accent-foreground: var(--accent-fg);
  --destructive-foreground: var(--destructive-fg);
  --input: var(--border-subtle);
  --ring: var(--border-focus);
}
```

### Contrast Requirements

All color pairings must meet WCAG AA (4.5:1 for normal text, 3:1 for large text). Validated pairings:

| Foreground | Background | Ratio | Status |
|------------|------------|-------|--------|
| `--text-primary` | page / panel / inset surfaces | 15.98 / 13.89 / 9.60 | Pass |
| `--text-secondary` | page / panel / inset surfaces | 9.36 / 8.44 / 6.29 | Pass |
| `--text-tertiary` | page / panel / inset surfaces | 6.49 / 6.00 / 4.71 | Pass |
| `--accent-text` | page / panel / inset surfaces | 8.50 / 7.39 / 5.11 | Pass |
| `--accent-fg` | `--accent` | 8.47 | Pass |
| `--success` / `--warning` / `--destructive` | Matching soft surface | 5.91 / 7.77 / 5.15 | Pass |
| `--border-focus` | page / panel / inset surfaces | 8.47 / 7.36 / 5.09 | Pass (3:1 minimum) |

Ratios are the output of `pnpm run check:contrast` against the 19-pair manifest in `scripts/contrast-pairs.json`; alpha foregrounds are composited over each opaque surface before measurement.

---

## Theming

### Two-layer contract

1. **Primitive layer:** `:root` owns every raw themeable value for the default theme. A non-default preset uses `html[data-theme="<name>"]` and overrides primitives only.
2. **Semantic layer:** stable roles such as `--surface-page`, `--surface-panel`, `--border-subtle`, `--accent`, and `--accent-fg` point to primitives. Components and Tailwind mappings consume these semantic roles; theme selectors never redefine them.
3. **Default rendering:** `default` is the `:root` palette and produces no `data-theme` attribute on `<html>`.

`THEME_REGISTRY` currently contains only `default`. Adding a non-default theme requires both a registry entry (`src/lib/theme.ts`) and a matching `html[data-theme="..."]` primitive override block in `globals.css`. Each registered theme must pass `pnpm run check:contrast`. When a new semantic foreground/background combination is introduced, add it to `scripts/contrast-pairs.json`; `pnpm lint` runs the contrast gate in CI.

### Preference and SSR plumbing

The user's registered theme is stored in the database. The `optcg-theme` cookie mirrors it for SSR (`httpOnly`, `SameSite=Lax`, one-year maximum age, secure in production). The root layout resolves the cookie and stamps non-default themes on `<html>` before paint. After authentication, `ThemeReconciler` compares the session-backed database preference with the rendered theme, refreshes the cookie through `/api/user/theme` when needed, and reloads once so the next SSR response is authoritative.

### Non-themable feature palettes

Theme selectors must not override the six TCG card colors, `--card-yellow-fg`, `--card-accent-fallback`, the complete `--holo-*` holofoil palette, the `--effect-*` effect-text notation palette, or the game-board `--gb-*` context. These are direct feature contracts with independent accessibility and visual requirements.

The `--effect-*` family colors the inline badges that `EffectText` (`src/components/cards/effect-text.tsx`) sets for the bracketed tokens printed in a card's rules text: timing markers, keywords, modifiers, `[DON!! xN]`, `[Counter]`, and `[Trigger]`. The token-family mapping follows the printed cards rather than a theme decision, which is why it sits with the card colors: activation timings are blue (`[Counter]` is a play-timing marker and shares the timing blue), constraints such as `[Once Per Turn]` are red, and evergreen keywords such as `[Blocker]` and `[Rush]` are orange. The timing, `[Counter]` and modifier fills share one lightness (46%) so that row of badges reads as a single system with hue as the only variable, and each sits below the accent so notation never competes with the focal action or with card art. The `[DON!! xN]` fill sits outside that set on purpose, lower (40%) and near-neutral, matching the printed badge's dark ink.

**The keyword family is a deliberate exception to the 46% step — do not "correct" it back.** `--effect-keyword` is `oklch(63% 0.14 62)` and its label uses its own dark ink, `--effect-keyword-fg` (`oklch(22% 0.04 245)`), rather than the shared white `--effect-notation-fg`. Both departures follow from the printed card: an evergreen keyword there is a bright orange hexagon, the loudest mark in the rules box, and reproducing that treatment is the point of the family (OPT-677). White lettering cannot survive the jump — it falls below AA above roughly 58% lightness on this hue — so the family flips to a dark ink, the same trade `--card-yellow-fg` already makes for the yellow card color. This is also the only notation family that takes a shape rather than a rounded rectangle; see [SHAPE-LANGUAGE.md](SHAPE-LANGUAGE.md).

Lightness is what moves this fill's two contrast pairs and they close from opposite directions, so 63% is not adjustable on taste alone: `effect-notation-label/keyword` (dark ink on the fill, 4.75:1) needs it high, while `effect-notation-keyline/keyword` (the white keyline on the fill, 3.25:1) drops under its 3:1 floor past about 65%. Chroma stops at 0.14 because that is the sRGB gamut edge at this lightness and hue. Both pairs are pinned in `scripts/contrast-pairs.json` and gated by `pnpm run check:contrast`.

---

## 4. Typography

> **Superseded:** the full type system — font stack, role-based ramp, weight/case/tracking rules, and per-primitive defaults — now lives in **[TYPOGRAPHY.md](TYPOGRAPHY.md)**. This section keeps only the brand-level summary; where the two disagree, TYPOGRAPHY.md wins.

### Font Stack

| Role | Font | Weights / Styles | Usage |
|------|------|------------------|-------|
| **Display** | Erode variable (self-hosted WOFF2) | 300–700 loaded; 600 treatment (700 navbar only) | Page titles, section headers, and hero text. Normal style, uppercase, `0.025em` letter spacing. |
| **Body** | Public Sans variable (self-hosted WOFF2) | 100–900 loaded; 400 / 500 / 600 rendered | All body text, labels, UI elements |
| **Mono** | Geist Mono | 400, 600 | Code, card IDs, technical data |

Both display and body are self-hosted from `src/app/fonts/` through `next/font/local` with `font-display: swap`. The `.font-display` treatment fixes headings at Erode 600, normal style, uppercase, `0.025em` letter spacing; navbar links use `.font-nav` (Erode 700, uppercase, `0.04em`, `text-base`) per the locked direction.

### Core Rules (details in TYPOGRAPHY.md)

1. Text picks a **role** from the TYPOGRAPHY.md ramp, not an ad-hoc size/weight combination.
2. Strict size scale — no custom `text-[Xpx]` values in components. Minimum 12px (`text-xs`).
   - **Inside-board exception (OPT-346):** the scaled game-board subtree renders at scale `0.59` at the 1280×640 floor viewport, which collapses chrome's 12px floor to ~7px effective. Inside `<ScaledBoard>` / `BoardLayout`'s scaled wrappers, the floor lifts to **`text-base` (16px)** for labels/counters/badges and **`text-lg` (18px)** for body text. Chrome keeps the 12px floor. See §13.
3. Public Sans renders only 400/500/600 — `font-bold`+ is not part of the sans system.
4. Uppercase sans always carries tracking (`tracking-widest` ≤ `text-sm`, `tracking-wider` at `text-base`/`text-lg`); `.font-display` is atomic and never modified.
5. Body text max line-length: 65-75 characters (`max-w-prose`).
6. Use `tabular-nums` for any numeric data (costs, power, life counts).

---

## 5. Spacing System

### Base Unit

4px grid. All spacing values are multiples of 4.

### Spacing Scale

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--space-1` | 4px | `p-1` | Inline icon gaps |
| `--space-2` | 8px | `p-2` | Tight internal padding |
| `--space-3` | 12px | `p-3` | Default internal padding |
| `--space-4` | 16px | `p-4` | Card padding, list gaps |
| `--space-5` | 20px | `p-5` | Section internal padding |
| `--space-6` | 24px | `p-6` | Panel padding |
| `--space-8` | 32px | `p-8` | Section gaps |
| `--space-10` | 40px | `p-10` | Large section padding |
| `--space-12` | 48px | `p-12` | Page section spacing |
| `--space-16` | 64px | `p-16` | Hero/blade padding |

**Banned values**: `p-2.5`, `px-3 py-1.5`, `gap-2.5`, `m-3.5`, etc. No half-steps.

### Responsive Spacing Variables (Riftbound-inspired)

```css
:root {
  --section-pad-y: 64px;   /* --space-16 */
  --section-pad-x: 48px;   /* --space-12 */
  --content-gap: 32px;     /* --space-8 */
}

@media (max-width: 1024px) {
  :root {
    --section-pad-y: 48px;
    --section-pad-x: 32px;
    --content-gap: 24px;
  }
}

@media (max-width: 600px) {
  :root {
    --section-pad-y: 32px;
    --section-pad-x: 16px;
    --content-gap: 16px;
  }
}
```

### Content Width Tiers (Riftbound-inspired)

| Tier | Max Width | Usage |
|------|-----------|-------|
| `narrow` | 640px | Login forms, single-column content |
| `medium` | 960px | Article content, deck details |
| `wide` | 1280px | Default page content (card grids, deck lists) |
| `full` | 100% | Hero sections, game board |

---

## 6. Border Radius

Chrome uses 2px corners. Badges alone retain 4px corners; avatars and presence dots alone remain round.

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--radius` | 4px | `rounded` | Badges, chips, tags |
| `--radius-md` | 2px | `rounded-md` | Buttons, inputs, chrome |
| `--radius-lg` | 2px | `rounded-lg` | Panels, modals, sheets |
| (built-in) | 9999px | `rounded-full` | Avatars, presence dots |

---

## 7. Shadows & Elevation

### Shadow Scale

**No blurred drop shadows.** A raised surface reads as raised through a hard, non-blurred offset cast down-right — the printed-card feel of the DON!! card shadow (`--gb-shadow-don: 3px 3px 0px 0px rgba(0,0,0,0.25)`), never a soft ambient bloom. One layer per tier; a hard shadow has no falloff to fake.

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `2px 2px 0 0 oklch(5% 0.004 260 / 0.45)` | Cards at rest, subtle lift |
| `--shadow-md` | `4px 4px 0 0 oklch(5% 0.004 260 / 0.55)` | Hovered cards, dropdowns, popovers |
| `--shadow-lg` | `6px 6px 0 0 oklch(5% 0.004 260 / 0.65)` | Modals, sheets, sticky action bars |

Offsets step 2 → 4 → 6px so the three tiers stay separable at a glance. Alphas run higher than the blurred tokens they replaced because the deep navy ground swallows a faint near-black cast, and a hard edge shows its alpha honestly instead of averaging it away across a blur radius.

Rules:

- Consume the ladder through `shadow-sm` / `shadow-md` / `shadow-lg` (or `shadow-[var(--shadow-*)]`). The stock Tailwind steps — `shadow-xs`, `shadow-xl`, `shadow-2xl`, every `drop-shadow-*` — are blurred and unbacked by a token; `scripts/lint-design-system.mjs` fails them.
- An arbitrary `shadow-[…]` is allowed only when it carries no blur. Lint reads the value structurally, so a hairline like `shadow-[0_0_0_1px_…]` passes and `shadow-[0_8px_16px_…]` does not.
- **Glows are exempt** — `shadow-[0_0_18px_var(--gb-signal-*)]` is a semantic signal, not elevation, and a zero-offset halo is not a drop shadow. See [INTERACTION-GRAMMAR.md §3.2](INTERACTION-GRAMMAR.md).
- Flat surfaces stay flat: tooltips and the card info panel use `shadow-none` plus an `edge-*` hairline. Do not give them an elevation token.
- Lint only scans `.tsx`, so the token values themselves are guarded by review against this table.

### Elevation Hierarchy

```
z-0    Base content
z-10   Sticky headers, raised panels
z-20   Dropdowns, select menus
z-30   Fixed navbar
z-40   Modals, sheets
z-50   Toasts, notifications
z-[100] Game board overlays
```

---

## 8. Component Patterns

### Buttons

Adapted from Riftbound's CTA system, mapped to our palette:

#### Variants

| Variant | Background | Text | Border | Usage |
|---------|------------|------|--------|-------|
| **Primary** | `--accent` | `--accent-fg` | none | Main actions: "Save Deck", "Create Game", "Play" |
| **Secondary** | `--surface-panel` | `--text-primary` | `1px solid var(--border-subtle)` | Secondary actions: "Cancel", "Back" |
| **Ghost** | transparent | `--text-secondary` | none | Tertiary actions, inline actions |
| **Destructive** | `--destructive` | `--destructive-fg` | none | Destructive: "Delete", "Concede" |
| **Gold** | `--accent` | `--accent-fg` | `1px solid var(--accent)` | Premium/treasure moments: "Upgrade", special actions |
| **Outline** | transparent | `--accent-text` | `1px solid var(--accent)` | Alternative secondary actions |

#### States

```
Default  → Hover (lighten bg or shift color) → Active (darken slightly)
         → Focus (2px solid --border-focus, 2px offset)
         → Disabled (opacity 0.5, cursor not-allowed)
         → Loading (spinner icon, disabled interaction)
```

#### Sizing

| Size | Height | Padding | Font |
|------|--------|---------|------|
| `sm` | 32px | `8px 12px` | 14px / 500 |
| `default` | 40px | `10px 16px` | 14px / 500 |
| `lg` | 48px | `12px 24px` | 16px / 600 |

#### Ornamental CTA (Riftbound-inspired)

For hero sections and important CTAs only:

```css
.btn-ornamental {
  --btn-ornamental-color: var(--accent);
  outline: 1px solid var(--btn-ornamental-color);
  outline-offset: 3px;
}
.btn-ornamental:hover {
  --btn-ornamental-color: var(--accent-hover);
}
```

#### Transition

All buttons: `transition: color 0.2s ease-out, background-color 0.2s ease-out, border-color 0.2s ease-out`

### Cards

#### TCG Card Display

```
┌──────────────┐
│              │ aspect-ratio: 63/88 (standard OPTCG)
│   Card Art   │ border-radius: rounded-md (2px)
│              │ shadow: --shadow-sm at rest (hard 2px offset)
│              │ hover: --shadow-md (hard 4px) + scale(1.03)
│              │ transition: 0.2s ease-out
└──────────────┘
```

- Cards on restrained elevated navy (`--surface-panel`) surfaces — art breathes
- Single hover effect: subtle lift + scale. No stacking of lift + shadow + blur + glow.
- Optional: thin gold border on hover for selected/highlighted cards

#### Content Cards (News, Decks, etc.)

Adapted from Riftbound's article card pattern:

```
┌─────────────────────────────────────┐
│          16:9 image area            │ aspect-ratio: 16/9
│     (hover: image scale 1.05)       │ overflow: hidden on container
├─────────────────────────────────────┤
│ CATEGORY   |   Mar 30, 2026        │ caption / 12px / --text-secondary
│                                     │
│ Card Title Goes Here                │ heading / 20px / --text-primary / 600
│                                     │
│ Brief description text that         │ body-sm / 14px / --text-secondary
│ explains the content...             │
└─────────────────────────────────────┘
  border-radius: rounded-lg (2px)
  background: var(--surface-panel)
  shadow: var(--shadow-sm)
  hover: var(--shadow-md)
```

### Navbar

Dark surface, consistent across all pages:

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo]      Cards  Decks  Play  Social          [User Menu] │
│                                                              │
│ bg: var(--surface-nav) — oklch(18% 0.020 245)               │
│ text: var(--text-inverse)                                     │
│ active link: --text-inverse on a white-alpha surface          │
│ height: 64px                                                  │
│ z-index: 40                                                   │
│ position: sticky top-0                                        │
└──────────────────────────────────────────────────────────────┘
```

- Canonical nav-link treatment: Erode 16px/700, uppercase, `0.04em` letter spacing. The family application ships with OPT-534; the current navbar remains an interim Geist Sans rendering.
- Resting: `--text-inverse` at 70% alpha; hover/focus: `--text-inverse` on a 10% white-alpha surface
- Active: `--text-inverse` on a 10% white-alpha surface; hover raises the surface to 15%

### Dialogs / Modals

```
Overlay: var(--overlay) — oklch(5% 0.004 260 / 0.76)
Panel:   var(--surface-panel), rounded-lg (2px), shadow-lg (hard 6px offset)
Enter:   fade overlay 0.2s + scale panel from 0.95→1.0, 0.2s ease-out
Exit:    fade out 0.15s (exit faster than enter)
Close:   X button top-right, keyboard Escape
```

### Card Gallery Modal

For viewing TCG card art in full detail:

```
┌─────────────────────────────────────────────────────────────┐
│ [X]                                              var(--overlay)
│                                                              │
│               ┌──────────────┐                              │
│               │              │                              │
│               │  Card Image  │  max-height: 85vh            │
│               │  (full size) │  aspect-ratio: 63/88         │
│               │              │  shadow-lg                   │
│               │              │                              │
│               └──────────────┘                              │
│                                                              │
│  Card Name                      enter: scale 0.9→1.0, 0.3s │
│  ST01-001 | Leader | Red        spring easing               │
│                                                              │
│  [< Prev]              [Next >]                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

- Keyboard navigation: left/right arrows for prev/next
- Swipe on mobile for prev/next
- Click outside or press Escape to close

### Section Layouts (Blade Pattern)

Adapted from Riftbound's blade architecture:

```
┌───────────────────────────────── full width ─────────────────────────────────┐
│  padding: var(--section-pad-y) var(--section-pad-x)                          │
│                                                                              │
│  ┌───────────────────── max-w: 1280px (centered) ──────────────────────┐    │
│  │                                                                      │    │
│  │  Section Title (Erode 600, uppercase)                                │    │
│  │  ─────────────────────────────────────────────────                   │    │
│  │                                                                      │    │
│  │  [ Content Grid / Carousel / Feature Cards ]                         │    │
│  │                                                                      │    │
│  │  [ Optional CTA ]                                                    │    │
│  │                                                                      │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Section Variants

| Variant | Background | Text | Usage |
|---------|------------|------|-------|
| **Default** | `--surface-page` | `--text-primary` | Most sections |
| **Muted** | `--surface-raised` | `--text-primary` | Alternating sections for visual rhythm |
| **Raised** | `--surface-panel` | `--text-primary` | Hero sections and featured content |
| **Gold accent** | `--surface-page` | `--text-primary` | Premium/feature showcases (`--accent-border` decoration only) |

### Carousel (Riftbound-inspired)

Embla-based carousel for card galleries, deck showcases, set browsers:

```
┌──────────────────────────────────────────────────────┐
│ Section Title                           [View All →] │
│                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│ │  Card 1  │ │  Card 2  │ │  Card 3  │  ← 3-up    │
│ │          │ │          │ │          │             │
│ └──────────┘ └──────────┘ └──────────┘             │
│                                                      │
│ ────────────────────────── progress bar (2px)        │
│                                         [◄] [►]     │
└──────────────────────────────────────────────────────┘
```

- Desktop: 3-up, Tablet: 2-up, Mobile: 1-up
- Gap: `var(--content-gap)`
- Progress bar: 2px rail in `--surface-inset`, indicator in `--accent`
- Arrow buttons: 32x32px, `--surface-raised` background, `--accent-text` icon
- Swipe enabled on touch devices

---

## 9. Motion Language

### Philosophy

Motion communicates state changes and spatial relationships. Every animation must have a purpose — entering, exiting, transitioning, or providing feedback. Decorative animation is not allowed.

### Timing Standards

| Category | Duration | Easing | Usage |
|----------|----------|--------|-------|
| **Micro** | 100-150ms | `ease-out` | Button press, toggle, checkbox |
| **Standard** | 200-250ms | `ease-out` | Hover states, tooltips, dropdowns |
| **Emphasis** | 300-400ms | `spring(1, 80, 10)` | Modal enter, card flip, page element reveal |
| **Exit** | 150-200ms | `ease-in` | Modal close, toast dismiss, dropdown close |

**Rule**: Exit animations are 60-70% the duration of enter animations. This makes the UI feel snappy.

### motion.dev Presets

```ts
// src/lib/motion.ts — shared animation presets

export const transitions = {
  micro:    { duration: 0.15, ease: "easeOut" },
  standard: { duration: 0.2,  ease: "easeOut" },
  emphasis: { type: "spring", stiffness: 300, damping: 25 },
  exit:     { duration: 0.15, ease: "easeIn" },
} as const;

export const variants = {
  fadeIn:   { initial: { opacity: 0 }, animate: { opacity: 1 } },
  fadeOut:  { exit: { opacity: 0 } },
  scaleIn:  { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 } },
  slideUp:  { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } },
  slideDown: { initial: { opacity: 0, y: -16 }, animate: { opacity: 1, y: 0 } },
} as const;
```

### Motion Patterns by Component

| Component | Enter | Exit | Interaction |
|-----------|-------|------|-------------|
| **Button** | — | — | `scale(0.97)` on press, 100ms |
| **Card hover** | — | — | `scale(1.03)` + shadow-md, 200ms ease-out |
| **Modal** | `scaleIn` 300ms spring | `fadeOut` 150ms ease-in | — |
| **Sheet** | Slide from edge, 300ms spring | Slide out, 200ms ease-in | — |
| **Toast** | Slide up + fade, 250ms | Slide down + fade, 150ms | — |
| **Dropdown** | Scale from trigger + fade, 200ms | Fade, 100ms | — |
| **Tooltip** | Fade 150ms | Fade 100ms | — |
| **Page transition** | Fade + slide up 16px, 250ms | Fade 150ms | — |
| **List stagger** | Each item delays 30ms | — | — |
| **Skeleton→content** | Crossfade 300ms | — | — |
| **Zone travel** | `zoneEnter` at destination | `zoneMove` 220ms ease-out | Stagger siblings by 60ms |
| **Card transform** | Materializes through pile receipt | `cardFizzle` 360ms ease-out | Opacity + scale + slight lift at source |
| **Pile receipt** | `pilePop` 200ms + `pileDelta` 700ms | — | One aggregated `+N` per batch |

### Reduced Motion

All motion respects `prefers-reduced-motion: reduce`. When active:

- All transforms disabled (no scale, no slide)
- Opacity transitions reduced to 100ms
- No spring animations — instant state changes
- Layout animations disabled
- Transform exits use a 100ms cross-fade; pile deltas keep their 700ms opacity clock but remove the pop and all spatial drift

```ts
// motion.dev automatically respects this, but we also expose:
import { useReducedMotion } from "motion/react";
```

### What NOT to Animate

- Width/height (causes layout reflow — use transform instead)
- Multiple simultaneous effects on one element (pick one: scale OR shadow OR glow)
- Scroll-jacking or parallax on main content
- Looping decorative animations
- Anything that blocks user input

---

## 10. Iconography

### Icon Library

**Lucide React** — consistent 24x24 stroke icons at 1.5px stroke width.

### Rules

- Icons are always paired with text labels in navigation
- Icon-only buttons must have `aria-label`
- Icon color follows text color of its context (never hardcoded)
- No emoji as structural icons
- SVG only — no PNG/raster icons

---

## 11. Accessibility Standards

### WCAG AA Compliance

| Requirement | Standard | Implementation |
|-------------|----------|----------------|
| Text contrast | 4.5:1 minimum | All token pairings pre-validated |
| Large text contrast | 3:1 minimum | Display text on all surface variants |
| Focus visible            | 2px solid ring (chrome); **4px ring inside `<ScaledBoard>`** (OPT-346) | `--border-focus`, 2px offset; in-board uses `ring-4` so the focus indicator renders ~2.4px at the 1280×640 floor scale |
| Touch targets | 44x44px minimum | All interactive elements |
| Keyboard navigation | Full tab support | Logical tab order, visible focus |
| Screen reader | Semantic HTML | ARIA labels, roles, live regions |
| Reduced motion | `prefers-reduced-motion` | All animations gated |
| Color not sole indicator | Icons + text supplement | Error states, card colors, status |

---

## 12. Responsive Breakpoints

| Name | Width | Target |
|------|-------|--------|
| `mobile` | <= 600px | Phones (portrait) |
| `tablet` | 601-1024px | Tablets, phones (landscape) |
| `desktop` | > 1024px | Desktop, wide tablets |

### Tailwind Mapping

```
sm:  640px   (closest to our mobile breakpoint)
md:  768px   (mid-tablet)
lg:  1024px  (our desktop breakpoint)
xl:  1280px  (wide desktop)
```

### Responsive Behavior

- **Mobile-first**: Base styles target mobile, scale up with `sm:`, `lg:`, `xl:`
- **Navigation**: Sticky top bar on all sizes
- **Card grids**: 1-col mobile, 2-col tablet, 3-4 col desktop
- **Section padding**: Responsive variables reduce at each breakpoint
- **Type scale**: Responsive reduction per the typography table
- **Touch targets**: 44px minimum on all breakpoints

---

## 13. Game Board (Independent Visual Context)

The game board is a self-contained visual context with its own token layer, isolated from the main-app theme registry. All game board tokens are prefixed `--gb-*` and documented in `globals.css`; global `html[data-theme]` blocks must not override them.

### Design Philosophy

The game board's UI must remain **readable and intuitive regardless of the board's background**. The current default is a dark theme, but the architecture must support future customization: custom backdrops, light themes, player-personalized environments, and animated backgrounds.

This means:

1. **UI chrome never depends on a specific background color.** Controls, labels, and overlays must use semi-transparent surfaces or adaptive tokens — not hardcoded dark-on-light or light-on-dark assumptions.
2. **Card zones and interactive regions use their own surface tokens** (`--gb-surface`, `--gb-surface-raised`) rather than relying on the board background for contrast.
3. **Text always sits on a controlled surface**, never directly on the board backdrop. Every text element must have a backing panel, scrim, or surface — even if it's subtle.
4. **The `--gb-*` token set is the board-context customization API.** Future board-specific work can swap these values independently; components should never reference raw colors. It is not part of the global `THEME_REGISTRY` contract.

### Current Default Theme (Dark)

| Property | Main App | Game Board (Dark) |
|----------|----------|-------------------|
| Background | Deep navy (`--surface-page`) | Near-black (`--gb-bg`) |
| Surfaces | `--surface-panel` / `--surface-raised` / `--surface-inset` | `--gb-surface` / `--gb-surface-raised` |
| Text       | Warm white (`--text-primary`)  | Off-white (`--gb-text`, `--gb-text-bright`) |
| Cards      | Elevated navy surface + shadow | Glow on dark                                |
| Motion | Subtle, functional | More pronounced, immersive |

### Future Theme Adaptability

When building game board components, follow these rules to ensure theme portability:

| Rule | Do | Don't |
|------|-----|-------|
| Surface backing | Place text/controls on `--gb-surface` panels | Render text directly on the board backdrop |
| Color references | Use `--gb-*` tokens exclusively | Use `oklch(...)` literals or main app tokens |
| Contrast | Ensure 4.5:1 against `--gb-surface`, not against `--gb-bg` | Assume the background is always dark |
| Borders | Use `--gb-border` tokens for separation | Rely on background contrast alone to define zones |
| Overlays | Use `--gb-surface` with controlled opacity for scrims | Use hardcoded `rgba(0,0,0,...)` |
| Icons/accents | Use `--gb-accent-*` tokens | Hardcode accent colors that only work on dark |

This keeps future board-specific customization (for example, a light beach or Wano board) coherent without coupling it to main-app presets or component-level changes.

### Inside-Board Floor Overrides (Responsive Game Board, OPT-346)

The game board is authored at a fixed 1920×1080 design resolution and uniformly scaled via CSS `transform: scale()` to fit the viewport (see [`docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md`](../project/RESPONSIVE-GAME-BOARD-SCOPE.md)). At the 1280×640 minimum viewport the scale floor is ~0.59, which compresses chrome's 12px text into ~7px effective and a 2px focus ring into ~1.2px — both below the legibility floor. Inside-board tokens are promoted one step so the effective floor stays close to the previous 1280×720 experience while preserving the fixed-composition architecture.

Inside the scaled subtree only — anything that renders within `<ScaledBoard>` / `BoardLayout`'s scaled wrappers (zones, on-board cards, in-board CTAs, on-board overlays such as the DON redistribute bar) — apply these overrides:

| Element | Chrome floor | Inside-board floor | Rationale |
|---------|--------------|--------------------|-----------|
| Labels, counters, badges | `text-xs` (12px) | **`text-base` (16px)** | ~9.5px effective at floor scale |
| Body / paragraph text | `text-xs` (12px) | **`text-lg` (18px)** | ~10.7px effective at floor scale |
| Focus rings | `ring-2` (2px) | **`ring-4` (4px)** | ~2.4px effective at floor scale |

**What stays as chrome (12px / `ring-2`):**

- The board navbar (rendered at design pixels, not inside the scaled wrapper).
- All Radix-portaled overlays — modals, tooltips, popovers, dropdown menus — because Radix `Portal` renders them outside the transformed parent (see `<PortalRoot>` in OPT-309).
- Side panels and chat sidebars consumed by the `<LiveGameShell>`.

**Primitive consumers (`GameButton`):** the `GameButton` primitive is shared between in-board (mid-zone, redistribute overlay) and chrome (modals, error boundaries) consumers. The primitive's defaults are tuned for chrome (`text-xs` / `ring-2`); in-board call sites pass `className="text-base focus-visible:ring-4"` (centralized as `IN_BOARD_BTN`) so chrome consumers stay unaffected.

---

## 14. Shipped Theming Foundation

The theming foundation shipped across OPT-512 through OPT-516. The semantic component API is stable while registered presets can replace primitives without component changes.

| Shipped work | Result |
|--------------|--------|
| OPT-512 | Primitive/semantic token split and explicit non-themable feature palettes |
| OPT-513 + OPT-536 | Default warm navy/original gold retained after VQA; desaturated primitives preserved for a future preset; text, border, and reserved border-gold values finalized |
| OPT-514 | Self-hosted Erode variable display face and the restored uppercase treatment |
| OPT-515 | Registry, DB preference, SSR cookie stamping, and session reconciliation |
| OPT-516 | 19-pair per-theme WCAG AA gate chained into `pnpm lint` |

### Decision traceability

- Design-source artifact: <https://claude.ai/code/artifact/e2e8f04c-9554-42e9-82d0-29fc3d459b58>
- 2026-07-23: initial direction established the Erode and desaturated redesign exploration.
- 2026-07-24: VQA restored the warm navy foundation, original bright-gold CTA ramp, and uppercase display treatment. The desaturated surface family remained only as preset-ready primitives.
- `src/app/globals.css` is the source of truth for token names and values; `src/lib/theme.ts` is the source of truth for registered themes and cookie options.

---

## 15. File Outputs

This branding guideline produces the following implementation artifacts:

| File | Content | Phase |
|------|---------|-------|
| `docs/design/BRANDING-GUIDELINES.md` | Human-readable shipped design and theming contract | Documentation |
| `src/app/globals.css` | Authoritative primitive, semantic, feature, Tailwind, and shadcn token mappings | Runtime |
| `src/lib/theme.ts` | Theme registry, validation, default behavior, and cookie contract | Runtime |
| `src/app/layout.tsx` | Self-hosted fonts and SSR theme stamping | Runtime |
| `scripts/check-token-contrast.mjs` + `scripts/contrast-pairs.json` | Per-theme WCAG AA gate and 19-pair manifest | CI |
| `CLAUDE.md` (Design Context section) | Condensed implementation guidance | Documentation |

---

_Last updated: 2026-07-24_
_Phase: Redesign theming foundation shipped (OPT-517)_
