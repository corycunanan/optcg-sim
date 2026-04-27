# OPTCG Simulator — Branding Guidelines

> Design system foundation for M5 UI Overhaul. This document defines the visual language, token values, component patterns, and motion standards that will be implemented via shadcn/ui + motion.dev. It serves as the single source of truth for all design decisions.

---

## 1. Brand Identity

### Brand Personality

**Adventurous. Warm. Confident.**

The OPTCG Simulator channels the spirit of One Piece — joyful, energetic, and alive. It should feel like the official OPTCG website purpose-built for competitive play: clean, welcoming, and unmistakably One Piece.

### Emotional Goals

| Context | Emotion | How |
|---------|---------|-----|
| Browsing cards | Delight | Card art as hero on warm white surfaces |
| Building decks | Focus | Clean workspace, minimal chrome, clear hierarchy |
| Playing games | Immersion | Dark board, purposeful animation, responsive feedback |
| Social/lobby | Connection | Warm tones, accessible entry points, friendly presence |

### Design Principles

1. **Card art is the hero** — Clean, bright surfaces amplify artwork. UI chrome recedes.
2. **One Piece warmth** — Bright, energetic, inviting. Color and whitespace create warmth, not decoration.
3. **Tight system, loose expression** — Every spacing, type, and color decision traces back to a token. Within that system, layouts can be expressive.
4. **Motion earns its place** — Transitions communicate state changes. One clear animation per interaction.
5. **Progressive clarity** — Simple at rest, detailed on interaction. Dense information is scannable through hierarchy, not visual noise.

### Anti-References (What We Are Not)

- NOT dark/moody/gamer-neon
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
| **Dramatic display serif** — "Beaufort for LOL" at 900 weight, uppercase, for headlines | DM Serif Display (400 + italic), uppercase — high-contrast serif for the same dramatic gravitas | Same energy: bold, commanding, epic. Serif adds warmth and adventure that a condensed sans lacks. |
| **Carousel with progress bar** — Embla-based, 3-up/2-up/1-up responsive, thin progress indicator + arrow buttons | Adopt for card gallery, set browser, deck showcase sections | Proven TCG card browsing pattern with smooth touch interaction |
| **Card hover scale** — `transform: scale(1.1)` on image within card, 0.3s ease-in-out | Adopt at `scale(1.03)` — more subtle, befitting our warmer aesthetic | Communicates interactivity without aggressive zoom |
| **Backdrop pattern** — background media + stacked overlay layers for readability | Adopt for hero sections (home page, set showcase) | Allows hero imagery while maintaining text legibility |
| **Aspect ratio containers** — explicit `aspect-ratio` with fallback `padding-bottom` | Adopt for all card images (OPTCG ratio ~63:88 = 0.716) and content cards (16:9) | Prevents layout shift, consistent visual rhythm |
| **Responsive spacer variables** — CSS variables that decrease at tablet/mobile breakpoints | Adopt our own 3-tier responsive spacing | Riftbound's best architectural pattern; prevents manual responsive overrides |
| **Transition timing** — color 0.25s ease-in-out, background-color 0.3s ease-in-out for interactive elements | Adopt as standard interactive transition | Smooth enough to feel responsive, fast enough to not lag |

### What We Do NOT Adopt

| Riftbound Pattern | Why We Skip |
|---|---|
| Dark page backgrounds (#293a4c, #013951) | We are light-mode primary; dark reserved for game board only |
| Orange accent (#EF7D00) as primary | Our palette uses navy as primary accent, gold as secondary — orange has wrong emotional register for One Piece |
| "TT Norms Pro Compact" as body font | We already use Geist Sans, which is more contemporary and better optimized for UI |
| Styled-components architecture | We use Tailwind CSS v4 with CSS tokens — no runtime CSS-in-JS |
| `z-index: 200000` for modals | We use a sane z-index scale (see Section 8) |
| Ultra-wide `max-width: 1920px` | Our content max-width is 1280px for readability; full-bleed reserved for heroes |

---

## 3. Color System

### Philosophy

Warm, bright, and alive. Navy provides structure and authority. Gold marks premium moments. Red brings One Piece energy. Six TCG card colors remain purely functional.

### Palette

#### Core Palette (unchanged — validated in M2.5)

| Token | Value | Role |
|-------|-------|------|
| `--surface-base` | `oklch(97% 0.006 75)` | Page background — warm white |
| `--surface-1` | `oklch(95% 0.007 75)` | Cards, panels |
| `--surface-2` | `oklch(93% 0.008 75)` | Elevated panels, input backgrounds |
| `--surface-3` | `oklch(88% 0.010 75)` | Tags, dividers, inset areas |
| `--surface-nav` | `oklch(20% 0.010 245)` | Global navbar — dark charcoal |

#### Navy (primary accent + structure)

| Token | Value | Usage |
|-------|-------|-------|
| `--navy-900` | `oklch(22% 0.04 245)` | Primary buttons, navbar, active states |
| `--navy-800` | `oklch(30% 0.04 245)` | Headings, hover states on navy elements |
| `--navy-700` | `oklch(38% 0.03 245)` | Borders on dark surfaces |
| `--navy-500` | `oklch(50% 0.04 245)` | Subdued/secondary elements |
| `--navy-200` | `oklch(88% 0.02 245)` | Light navy tint for hover backgrounds |
| `--navy-100` | `oklch(94% 0.015 245)` | Very light navy background (selected rows, active tabs) |

#### Gold (secondary accent — treasure, premium)

| Token | Value | Usage |
|-------|-------|-------|
| `--gold-500` | `oklch(72% 0.14 75)` | Secondary CTAs, highlights, ornamental outlines |
| `--gold-400` | `oklch(78% 0.12 75)` | Hover on gold elements |
| `--gold-100` | `oklch(95% 0.04 75)` | Soft gold background for premium callouts |

#### Red (energy, emphasis, destructive)

| Token | Value | Usage |
|-------|-------|-------|
| `--red-600` | `oklch(55% 0.20 25)` | Emphasis, destructive actions, error states |
| `--red-500` | `oklch(62% 0.18 25)` | Hover on red elements |
| `--red-100` | `oklch(96% 0.04 25)` | Soft red background for error callouts |

#### Text Hierarchy

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `oklch(18% 0.02 245)` | Body text, headings — navy-tinted near-black |
| `--text-secondary` | `oklch(45% 0.01 245)` | Secondary labels, metadata |
| `--text-tertiary` | `oklch(62% 0.01 245)` | Placeholder, hint text |
| `--text-disabled` | `oklch(74% 0.01 245)` | Disabled elements |
| `--text-inverse` | `oklch(98% 0.005 75)` | White text on dark surfaces |

#### Semantic Colors

| Token | Value | Role |
|-------|-------|------|
| `--success` / `--success-soft` | `oklch(52% 0.16 155)` / `oklch(96% 0.04 155)` | Positive feedback |
| `--warning` / `--warning-soft` | `oklch(68% 0.14 80)` / `oklch(96% 0.05 80)` | Cautionary states |
| `--error` / `--error-soft` | `oklch(55% 0.20 25)` / `oklch(96% 0.04 25)` | Error states |

#### TCG Card Colors (functional only)

| Color | Token | Value |
|-------|-------|-------|
| Red | `--card-red` | `oklch(55% 0.20 25)` |
| Blue | `--card-blue` | `oklch(50% 0.18 250)` |
| Green | `--card-green` | `oklch(52% 0.18 150)` |
| Purple | `--card-purple` | `oklch(48% 0.18 300)` |
| Black | `--card-black` | `oklch(28% 0.01 245)` |
| Yellow | `--card-yellow` | `oklch(78% 0.18 90)` |

### shadcn CSS Variable Mapping

These aliases will be added to `globals.css` for shadcn component compatibility:

```css
:root {
  /* shadcn required variables — mapped to our existing tokens */
  --background: var(--surface-base);
  --foreground: var(--text-primary);
  --card: var(--surface-1);
  --card-foreground: var(--text-primary);
  --popover: var(--surface-1);
  --popover-foreground: var(--text-primary);
  --primary: var(--navy-900);
  --primary-foreground: var(--text-inverse);
  --secondary: var(--surface-2);
  --secondary-foreground: var(--text-primary);
  --muted: var(--surface-3);
  --muted-foreground: var(--text-secondary);
  --accent: var(--gold-500);
  --accent-foreground: var(--navy-900);
  --destructive: var(--red-600);
  --destructive-foreground: var(--text-inverse);
  --border: var(--border);
  --input: var(--border);
  --ring: var(--navy-900);
  --radius: 0.5rem; /* 8px — our rounded-md default */
}
```

### Contrast Requirements

All color pairings must meet WCAG AA (4.5:1 for normal text, 3:1 for large text). Validated pairings:

| Foreground | Background | Ratio | Status |
|------------|------------|-------|--------|
| `--text-primary` | `--surface-base` | ~15:1 | Pass |
| `--text-secondary` | `--surface-base` | ~5.5:1 | Pass |
| `--text-inverse` | `--navy-900` | ~14:1 | Pass |
| `--gold-500` | `--navy-900` | ~7:1 | Pass |
| `--navy-900` | `--surface-1` | ~12:1 | Pass |

---

## 4. Typography

### Font Stack

| Role | Font | Weights / Styles | Usage |
|------|------|------------------|-------|
| **Display** | DM Serif Display | 400, 400 italic | Page titles, section headers, hero text. Uppercase. Italic for featured callouts and pull-quotes. |
| **Body** | Geist Sans | 400, 500, 600 | All body text, labels, UI elements, navigation |
| **Mono** | Geist Mono | 400 | Code, card IDs, technical data |

### Why These Fonts

- **DM Serif Display** is a high-contrast display serif designed specifically for large headline sizes — the same role Riftbound's "Beaufort for LOL" plays. It's bold by default (single 400 weight that reads as bold), dramatic in uppercase, and has a striking italic variant for featured moments and pull-quotes. The serif character adds gravitas and warmth that a condensed sans cannot match, grounding the brand in something more epic and adventurous.
- **Geist Sans** is a modern geometric sans with excellent screen rendering. The contrast between a dramatic serif display and a clean geometric body creates visual tension — the same energy Riftbound achieves with Beaufort + TT Norms Pro Compact.

### Type Scale

Strict scale — no custom `text-[Xpx]` values in components.

| Token | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `display-xl` | 48px | 1.1 | DM Serif Display 400 | Hero headlines only |
| `display-lg` | 36px | 1.15 | DM Serif Display 400 | Page titles |
| `display-md` | 30px | 1.2 | DM Serif Display 400 | Section titles |
| `display-sm` | 24px | 1.25 | DM Serif Display 400 | Sub-section titles |
| `heading` | 20px | 1.3 | Geist 600 | Card titles, panel headers |
| `body-lg` | 18px | 1.6 | Geist 400 | Featured body text |
| `body` | 16px | 1.5 | Geist 400 | Default body text |
| `body-sm` | 14px | 1.5 | Geist 400 | Secondary text, metadata |
| `caption` | 12px | 1.4 | Geist 500 | Badges, labels, timestamps |

### Responsive Type Scaling

Following Riftbound's 3-breakpoint responsive reduction:

| Token | Desktop (>1024px) | Tablet (601-1024px) | Mobile (<=600px) |
|-------|--------------------|---------------------|-------------------|
| `display-xl` | 48px | 36px | 30px |
| `display-lg` | 36px | 30px | 24px |
| `display-md` | 30px | 24px | 20px |
| `display-sm` | 24px | 20px | 18px |
| `heading` | 20px | 18px | 16px |
| `body-lg` | 18px | 16px | 16px |
| `body` | 16px | 16px | 16px |
| `body-sm` | 14px | 14px | 14px |
| `caption` | 12px | 12px | 12px |

### Typography Rules

1. Display fonts are **always uppercase** with `tracking-wider` (0.05em)
2. Display italic is reserved for **featured callouts, pull-quotes, and hero subtitles** — never for regular section headers
3. Body text max line-length: 65-75 characters (`max-w-prose` or `max-w-[65ch]`)
4. Minimum font size: 12px (`text-xs`). Never use `text-[10px]` or `text-[11px]`.
   - **Inside-board exception (OPT-316):** the scaled game-board subtree renders at scale `0.67` at the 1280×720 floor viewport, which collapses chrome's 12px floor to ~8px effective. Inside any element rendered within `<ScaledBoard>` / `BoardLayout`'s scaled wrappers, the floor lifts to **`text-sm` (14px)** for labels/counters/badges and **`text-base` (16px)** for body / paragraph text. Chrome (navbar, modals, tooltips, popovers, side panels) keeps the 12px floor unchanged. See §13 for the full inside-board override set.
5. Use `font-display: swap` for web font loading
6. Use `tabular-nums` for any numeric data (costs, power, life counts)

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

Three values only. No exceptions.

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--radius` | 4px | `rounded` | Badges, tags, small elements |
| `--radius-md` | 8px | `rounded-md` | Buttons, inputs, cards |
| `--radius-lg` | 12px | `rounded-lg` | Panels, modals, sheets |
| (built-in) | 9999px | `rounded-full` | Avatars, pills, circular buttons |

---

## 7. Shadows & Elevation

### Shadow Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px oklch(18% 0.03 245 / 0.06), 0 1px 3px oklch(18% 0.03 245 / 0.10)` | Cards at rest, subtle lift |
| `--shadow-md` | `0 4px 6px oklch(18% 0.03 245 / 0.07), 0 2px 4px oklch(18% 0.03 245 / 0.06)` | Hovered cards, dropdowns |
| `--shadow-lg` | `0 10px 15px oklch(18% 0.03 245 / 0.10), 0 4px 6px oklch(18% 0.03 245 / 0.05)` | Modals, popovers |

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
| **Primary** | `--navy-900` | `--text-inverse` | none | Main actions: "Save Deck", "Create Game", "Play" |
| **Secondary** | `--surface-1` | `--text-primary` | `1px solid var(--border)` | Secondary actions: "Cancel", "Back" |
| **Ghost** | transparent | `--text-secondary` | none | Tertiary actions, inline actions |
| **Destructive** | `--red-600` | `--text-inverse` | none | Destructive: "Delete", "Concede" |
| **Gold** | `--gold-500` | `--navy-900` | none | Premium/treasure moments: "Upgrade", special actions |
| **Outline** | transparent | `--navy-900` | `1px solid var(--navy-900)` | Alternative secondary actions |

#### States

```
Default  → Hover (lighten bg or shift color) → Active (darken slightly)
         → Focus (2px solid --navy-900, 2px offset)
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
  outline: 1px solid var(--gold-500);
  outline-offset: 3px;
}
.btn-ornamental:hover {
  outline-color: var(--gold-400);
}
```

#### Transition

All buttons: `transition: color 0.2s ease-out, background-color 0.2s ease-out, border-color 0.2s ease-out`

### Cards

#### TCG Card Display

```
┌──────────────┐
│              │ aspect-ratio: 63/88 (standard OPTCG)
│   Card Art   │ border-radius: rounded-md (8px)
│              │ shadow: --shadow-sm at rest
│              │ hover: --shadow-md + scale(1.03)
│              │ transition: 0.2s ease-out
└──────────────┘
```

- Cards on warm white (`--surface-1`) surfaces — art breathes
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
  border-radius: rounded-lg (12px)
  background: var(--surface-1)
  shadow: var(--shadow-sm)
  hover: var(--shadow-md)
```

### Navbar

Dark surface, consistent across all pages:

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo]      Cards  Decks  Play  Social          [User Menu] │
│                                                              │
│ bg: var(--surface-nav) — oklch(20% 0.010 245)               │
│ text: var(--text-inverse) — warm off-white                    │
│ active link: underline in --gold-500                          │
│ height: 64px desktop, 56px mobile                             │
│ z-index: 30                                                   │
│ position: sticky top-0                                        │
└──────────────────────────────────────────────────────────────┘
```

- Nav items: Geist Sans 14px/500, uppercase, `tracking-wide`
- Hover: `color: var(--gold-400)`, transition 0.2s
- Active: `color: var(--gold-500)` + 2px underline offset 4px
- Mobile: hamburger menu → sheet sliding from right

### Dialogs / Modals

```
Overlay: var(--overlay) — oklch(18% 0.03 245 / 0.60)
Panel:   var(--surface-1), rounded-lg (12px), shadow-lg
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
│  │  Section Title (Barlow Condensed, uppercase)                         │    │
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
| **Default** | `--surface-base` | `--text-primary` | Most sections |
| **Muted** | `--surface-2` | `--text-primary` | Alternating sections for visual rhythm |
| **Navy** | `--navy-900` | `--text-inverse` | Hero sections, CTAs, featured content |
| **Gold accent** | `--surface-base` | `--text-primary` | Premium/feature showcases (gold border or divider) |

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
- Progress bar: 2px rail in `--surface-3`, indicator in `--navy-900`
- Arrow buttons: 32x32px, `--surface-2` background, `--navy-900` icon
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

### Reduced Motion

All motion respects `prefers-reduced-motion: reduce`. When active:

- All transforms disabled (no scale, no slide)
- Opacity transitions reduced to 100ms
- No spring animations — instant state changes
- Layout animations disabled

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
| Focus visible | 2px solid ring (chrome); **3px ring inside `<ScaledBoard>`** (OPT-316) | `--border-focus` (navy-900), 2px offset; in-board uses `ring-3` so the focus indicator still renders ~2px at floor scale |
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
- **Navigation**: Sticky top bar on all sizes; hamburger → sheet on mobile
- **Card grids**: 1-col mobile, 2-col tablet, 3-4 col desktop
- **Section padding**: Responsive variables reduce at each breakpoint
- **Type scale**: Responsive reduction per the typography table
- **Touch targets**: 44px minimum on all breakpoints

---

## 13. Game Board (Themeable Context)

The game board is a self-contained visual context with its own token layer, isolated from the main app. All game board tokens are prefixed `--gb-*` and documented in `globals.css`.

### Design Philosophy

The game board's UI must remain **readable and intuitive regardless of the board's background**. The current default is a dark theme, but the architecture must support future customization: custom backdrops, light themes, player-personalized environments, and animated backgrounds.

This means:

1. **UI chrome never depends on a specific background color.** Controls, labels, and overlays must use semi-transparent surfaces or adaptive tokens — not hardcoded dark-on-light or light-on-dark assumptions.
2. **Card zones and interactive regions use their own surface tokens** (`--gb-surface`, `--gb-surface-raised`) rather than relying on the board background for contrast.
3. **Text always sits on a controlled surface**, never directly on the board backdrop. Every text element must have a backing panel, scrim, or surface — even if it's subtle.
4. **The `--gb-*` token set is the theming API.** Future themes swap these token values; components should never reference raw colors. A theme is just a different set of `--gb-*` values.

### Current Default Theme (Dark)

| Property | Main App | Game Board (Dark) |
|----------|----------|-------------------|
| Background | Warm white | Near-black (`--gb-bg`) |
| Surfaces | `--surface-1/2/3` | `--gb-surface` / `--gb-surface-raised` |
| Text | Navy-tinted dark | Off-white (`--gb-text`, `--gb-text-bright`) |
| Cards | Shadow on white | Glow on dark |
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

This ensures that swapping the `--gb-*` token set (e.g., a light beach theme, a Wano-themed board) will produce a coherent result without component-level changes.

### Inside-Board Floor Overrides (Responsive Game Board, OPT-316)

The game board is authored at a fixed 1920×1080 design resolution and uniformly scaled via CSS `transform: scale()` to fit the viewport (see [`docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md`](../project/RESPONSIVE-GAME-BOARD-SCOPE.md)). At the 1280×720 minimum viewport the scale floor is ~0.67, which compresses chrome's 12px text into ~8px effective and a 2px focus ring into ~1.34px — both below the legibility floor.

Inside the scaled subtree only — anything that renders within `<ScaledBoard>` / `BoardLayout`'s scaled wrappers (zones, on-board cards, in-board CTAs, on-board overlays such as the DON redistribute bar) — apply these overrides:

| Element | Chrome floor | Inside-board floor | Rationale |
|---------|--------------|--------------------|-----------|
| Labels, counters, badges | `text-xs` (12px) | **`text-sm` (14px)** | ~9.4px effective at floor scale |
| Body / paragraph text | `text-xs` (12px) | **`text-base` (16px)** | ~10.7px effective at floor scale |
| Focus rings | `ring-2` (2px) | **`ring-3` (3px)** | ~2px effective at floor scale |

**What stays as chrome (12px / `ring-2`):**

- The board navbar (rendered at design pixels, not inside the scaled wrapper).
- All Radix-portaled overlays — modals, tooltips, popovers, dropdown menus — because Radix `Portal` renders them outside the transformed parent (see `<PortalRoot>` in OPT-309).
- Side panels and chat sidebars consumed by the `<LiveGameShell>`.

**Primitive consumers (`GameButton`):** the `GameButton` primitive is shared between in-board (mid-zone, redistribute overlay) and chrome (modals, error boundaries) consumers. The primitive's defaults are tuned for chrome (`text-xs` / `ring-2`); in-board call sites pass `className="text-sm focus-visible:ring-3"` (centralized as `IN_BOARD_BTN`) so chrome consumers stay unaffected.

---

## 14. Token Change Summary (Current → M5)

The current token system is **retained as-is**. The following are **additions** for M5:

| Addition | Purpose |
|----------|---------|
| shadcn CSS variable aliases | Map existing tokens to shadcn's expected variable names |
| Responsive spacing variables | `--section-pad-y/x`, `--content-gap` with breakpoint scaling |
| Display type scale tokens | Formalize `display-xl` through `caption` in CSS |
| motion.dev preset module | `src/lib/motion.ts` — shared transitions, springs, variants |
| Ornamental CTA class | `.btn-ornamental` for gold-outlined hero buttons |

No existing tokens are renamed or removed. This is additive.

---

## 15. File Outputs

This branding guideline produces the following implementation artifacts:

| File | Content | Phase |
|------|---------|-------|
| `docs/design/BRANDING-GUIDELINES.md` | This document (you're reading it) | Phase 0 |
| `src/app/globals.css` | Updated with shadcn aliases + responsive spacing vars + type scale | Phase 1 |
| `src/lib/motion.ts` | motion.dev presets, transitions, variants, springs | Phase 1 |
| `components.json` | shadcn configuration pointing to our token system | Phase 1 |
| `CLAUDE.md` (Design Context section) | Updated to reference this guideline | Phase 0 |

---

_Last updated: 2026-03-30_
_Phase: M5 Phase 0 — Design Brief_
