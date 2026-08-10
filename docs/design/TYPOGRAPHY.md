# OPTCG Simulator — Typography

Source of truth for the type system: families, the role-based ramp, weight/case/tracking rules, and the typography every UI primitive bakes in. Supersedes `BRANDING-GUIDELINES.md` §4's scale tables; that section now defers here. Token names and values live in `src/app/globals.css`. Visual specimen: open [`type-specimens.html`](type-specimens.html) from a checkout (real Erode + Public Sans render from `src/app/fonts/`).

The core idea: **components and surfaces pick a role, not a size.** Every piece of text in the app should map to exactly one role in §2. If you are composing raw `text-*`/`font-*` utilities and the combination doesn't appear in this document, you are inventing a new role — stop and use the closest existing one.

---

## 1. Font Stack

| Role | Font | File / Loader | Weights | Usage |
|------|------|---------------|---------|-------|
| **Display** | Erode (variable) | `src/app/fonts/Erode-Variable.woff2` via `next/font/local`, `--font-erode` | 300–700 loaded; **600 only** via `.font-display` (700 only via `.font-nav`) | Page/section titles, hero text. Always uppercase. |
| **Body** | Public Sans (variable) | `src/app/fonts/PublicSans-Variable.woff2` via `next/font/local`, `--font-public-sans` | 100–900 loaded; **400 / 500 / 600 only** | All body text, labels, buttons, badges, navigation-adjacent UI. |
| **Mono** | Geist Mono | `next/font/google`, `--font-geist-mono` | 400 (+600 for codes) | Card/set IDs, join codes, error digests, import/export text. |

Tailwind wiring (`globals.css` `@theme`): `--font-sans → --font-public-sans`, `--font-mono → --font-geist-mono`, `--font-display → --font-erode`. The body element sets Public Sans globally; components never declare `font-sans` explicitly.

### Why these fonts

- **Erode** carries the brand: an expressive serif whose uppercase 600 treatment reads adventurous without being pirate-kitsch. Self-hosted, `font-display: swap`.
- **Public Sans** (USWDS, SIL OFL) replaced Geist Sans in 2026-08. Rationale: Geist's geometric neutrality read generic against Erode; Public Sans — a Libre Franklin descendant — has warmer, more editorial letterforms, a tall x-height that holds up at our 12px floor, true tabular figures, and a full variable range. Self-hosted like Erode, so builds have no font network dependency.
- **Geist Mono** stays: it is only used for machine-flavored strings (codes, digests) where its neutrality is a feature.

### The `.font-display` lock

`.font-display` is two coupled rules: Tailwind's generated `font-family` utility plus an **unlayered** rule in `globals.css` fixing `font-weight: 600`, `font-style: normal`, `text-transform: uppercase`, `letter-spacing: 0.025em`. The unlayered rule intentionally beats utility classes: the display treatment is atomic. Never stack `font-bold`, `uppercase`, `normal-case`, or `tracking-*` on a `.font-display` element — they are silently ignored (weight/case/tracking) or forbidden (family). If you need different type, you need a different role, not a modified display heading.

`.font-nav` (Erode 700, uppercase, `0.04em`) is reserved for global navbar links only.

---

## 2. The Type Ramp (roles)

Sizes come from the strict Tailwind scale — 12/14/16/18/20/24/30/36/48/60px. No `text-[Xpx]`, ever. Chrome roles first; §6 lifts the floor inside the scaled game board.

### Display roles — Erode, uppercase (never below `text-xl`)

| Role | Recipe | Size | Usage |
|------|--------|------|-------|
| `display-hero` | `font-display text-6xl leading-none` (home) / `text-5xl leading-none` (auth) | 60/48px | Marketing-scale hero moments only: home page, login. One per page, not inside app chrome. |
| `title-page` | `font-display text-3xl` | 30px | The h1 of a page. Canonical primitive: `PageHeaderTitle`. Exactly one per page. |
| `title-section` | `font-display text-2xl` | 24px | h2 — major page regions (lobby panels, admin sections). |
| `title-subsection` | `font-display text-xl` | 20px | h3 — the smallest display size. Below 20px, uppercase Erode loses legibility: switch to sans `heading`. |

### Sans roles — Public Sans

| Role | Recipe | Size / weight | Usage |
|------|--------|---------------|-------|
| `heading` | `text-lg font-semibold text-content-primary` | 18/600 | Overlay titles (Dialog, AlertDialog, Sheet), panel headers. Primitive default — bare `<DialogTitle>` etc. is already correct. |
| `subheading` | `text-base font-semibold` | 16/600 | Card titles (`CardTitle`), list-group headers, card names in detail views. |
| `body` | `text-sm` | 14/400 | Default UI body — descriptions, table cells, chat, list rows. Multi-line prose adds `leading-relaxed` and caps line length with `max-w-prose`. |
| `body-lg` | `text-base leading-relaxed` | 16/400 | Long-form or featured copy on content pages; the body floor inside the game board. |
| `label` | `text-sm font-medium text-content-secondary` | 14/500 | Form field labels, menu labels, key–value keys. Canonical primitive: `Label` (`@/components/ui`). |
| `overline` | `text-xs font-semibold uppercase tracking-widest text-content-tertiary` | 12/600 | Eyebrows, filter-group headers, zone/stat group titles, kicker text above headings. The only sanctioned uppercase sans treatment at 12px. |
| `caption` | `text-xs text-content-tertiary` | 12/400 | Timestamps, metadata, helper/hint text. Use `text-content-secondary` when it must stay readable against adjacent body text. |
| `badge` | `text-xs font-medium` | 12/500 | Badge/pill content. `Badge` primitive default; never uppercase a badge via the primitive — content may be user text. |

### Mono roles — Geist Mono

| Role | Recipe | Usage |
|------|--------|-------|
| `code` | `font-mono text-xs font-semibold` | Card/set IDs (`OP01-001`), inline technical values. |
| `code-entry` | `font-mono text-sm font-semibold tracking-widest` | Lobby join codes and other human-transcribed codes. |
| `code-block` | `font-mono text-xs break-all` | Error digests (already consistent app-wide); `font-mono text-sm` for deck import/export textareas. |

---

## 3. Weight Rules

Public Sans may render **400, 500, 600 — nothing else.**

| Weight | Utility | Means |
|--------|---------|-------|
| 400 | (default) | Reading text: body, captions, descriptions. |
| 500 | `font-medium` | Interactive/labeling text: buttons, tabs, labels, badges, menu items with emphasis. |
| 600 | `font-semibold` | Structural text: headings, subheadings, overlines, emphasized values. |

- `font-bold` (700) and `font-extrabold` (800) are **not part of the sans system**. Anywhere they exist today is migration debt (§7). If something needs more emphasis than 600, change its role (size/color), not its weight.
- Erode weights are fixed by treatment: 600 (`.font-display`), 700 (`.font-nav`). Never set Erode weights manually.
- Semantic `<strong>` / markdown bold inside prose renders 600, not 700 (matches the ramp's ceiling).

## 4. Case & Tracking Rules

Tracking is a function of size — one rule, no judgment calls:

| Context | Tracking |
|---------|----------|
| Uppercase sans at `text-xs` / `text-sm` | `tracking-widest` (0.1em) |
| Uppercase sans at `text-base` / `text-lg` | `tracking-wider` (0.05em) |
| Uppercase sans above `text-lg` | Don't. Use a display role — Erode owns large uppercase. |
| `.font-display` (any size) | Built-in 0.025em. Never add `tracking-*`. |
| Mixed-case text | No tracking, with two exceptions: `code-entry` (above) and keyboard-shortcut hints (`text-xs tracking-widest` in menus). |

Corollaries: **uppercase never ships without tracking**, and `tracking-widest` never appears above `text-sm`. `leading-none` is reserved for single-line display heroes; multi-line body always gets `leading-relaxed`.

## 5. Component Typography Defaults

What each primitive bakes in — components should rely on these, not re-specify them. Overriding a primitive's typography is a design-review flag.

| Primitive | Default | Role |
|-----------|---------|------|
| `Button` | `text-sm font-medium` (`sm` → `text-xs`, `lg` → `text-base`) | label |
| `Badge` | `text-xs font-medium` | badge |
| `Label` | `text-sm font-medium text-content-secondary` | label |
| `DialogTitle` / `AlertDialogTitle` / `SheetTitle` | `text-lg font-semibold text-content-primary` | heading |
| `DialogDescription` / `AlertDialogDescription` / `SheetDescription` | `text-sm text-content-secondary` | body |
| `CardTitle` | `text-base font-semibold leading-snug` (`sm` card → `text-sm`) | subheading |
| `CardDescription` | `text-sm text-muted-foreground` | body |
| `PageHeaderTitle` | `font-display text-3xl` | title-page |
| `PageHeaderDescription` | `text-sm text-content-secondary` | body |
| `TabsTrigger` | `text-sm font-medium` | label |
| `TooltipContent` | `text-xs` (weight 400) | caption |
| `Input` / `Select` / `DropdownMenuItem` / `CommandItem` / Popover / HoverCard | `text-sm` | body |
| `DropdownMenuLabel` | `text-sm font-medium` | label |
| `SelectLabel` / Command group heading | `text-xs` group heading (target: overline recipe — migration §7) | overline |
| `DropdownMenuShortcut` / `CommandShortcut` | `text-xs tracking-widest` | (shortcut exception, §4) |
| Toast (`sonner.tsx`) | title `text-sm font-medium`, description `text-xs text-content-secondary` | label / caption |
| `AvatarFallback` | `text-sm` (`sm` → `text-xs`) | body |

Known quirk: `Textarea` is the only primitive with responsive sizing (`text-base md:text-sm`, vendored shadcn iOS-zoom guard). Leave it.

## 6. Inside-Board Floor

Inside the `<ScaledBoard>` / `BoardLayout` scaled subtree the board renders at ~0.59 scale at the floor viewport, so chrome sizes collapse below legibility. Roles translate:

| Chrome role | Inside-board recipe |
|-------------|---------------------|
| overline | `text-base font-semibold uppercase tracking-wider` (zone labels, empty-slot hints) |
| body | `text-lg` |
| caption / counters | `text-base tabular-nums` |
| heading (on-board overlays) | `text-base`–`text-lg` `font-semibold`; spotlight moments may use `font-display text-3xl` (deliberate hero exception) |

Portaled content (tooltips, modals, popovers) is chrome and keeps chrome roles, even when triggered from the board. Full override table: `BRANDING-GUIDELINES.md` §13.
`NavMenu` dropdown content is portaled outside `<ScaledBoard>` and keeps its chrome `text-xs` menu-item role.

## 7. Numbers, Prose, and Misc

- **All numeric data** (costs, power, life, counts, timers) gets `tabular-nums`. Currently applied ad hoc — apply it whenever a number can change while displayed.
- **Long-form prose** (rules text, card effect text rendered as paragraphs): `body`/`body-lg` with `leading-relaxed` and `max-w-prose`.
- **shadcn "Typeset"** (the current shadcn typography offering) was evaluated 2026-08 and not adopted: it styles rendered markdown inside a wrapper class and knows nothing about our display treatment. Revisit only if we ship long-form rendered-markdown surfaces; the named-role approach in §2 replaces shadcn's old h1–h4/lead/muted recipes.

---

## 8. Migration Checklist

State of the codebase at audit time (2026-08-09): the documented ramp existed nowhere; the items below are ordered by visibility. Each maps existing treatments → a §2 role.

1. **Modal titles** — 7 treatments spanning 12–30px. Target: bare `DialogTitle` (heading role) everywhere. Offenders: `trash-preview-modal`, `arrange-top-cards-modal`, `select-target-modal`, `player-choice-modal`, `life-preview-modal` (`text-sm font-bold`); `optional-effect-modal`, `reveal-trigger-modal` (`text-xs` overline-as-title); `mulligan-modal` (`text-2xl font-bold tracking-widest uppercase`); `card-detail-modal` (`text-xl font-bold tracking-tight`); `game-overlay-gate:107` (tracking without uppercase). `spotlight-overlay`'s `font-display text-3xl` is the sanctioned hero exception.
2. **Eyebrows/overlines** — canonize the dominant recipe (overline role, already ~25 sites). Fix the 6 deviant variants: `font-bold` (`scenario-info-panel`, `event-log:178`, `live-game-shell:420`, `preview/card:358`), `font-medium` (`test-order-editor`, `card-info-panel:52,164`), weightless (`game-ui:27`, `deck-preview-modal:74`, `deck-builder-list:116`, `priority-roll-display:97`, `game-overlay-gate:325`), tracking-less (`pregame-settings:113`). `card-info-panel` (Tier-5 surface, post-audit) also uses `font-bold` for stat values and its name row — target `font-semibold` per §3.
3. **Page titles** — collapse 6 sizes onto `title-page` (text-3xl) via `PageHeader`; heroes stay per §2. Migrate `lobby-room-shell:429,826` + `onboarding` + `preview/card` (text-4xl → text-3xl), `admin/cards/[id]:81` (text-2xl → text-3xl). Give `min-viewport-gate:34` and `sandbox-shell:51` real h1 treatment or demote the element.
4. **`font-bold`/`font-extrabold` sweep** — 98 sites → `font-semibold` (or a role change). Mechanical once 1–3 land.
5. **Form labels** — adopt the `Label` primitive (`login/credentials-form`, `admin/card-edit-form`, `admin/cards/new`, `pregame-settings`). Filter-group headers in `card-filters` are overlines, not labels — already correct.
6. **Large-size tracking** — remove `tracking-widest` at `text-2xl`/`text-3xl` (`priority-roll-display:31`, `game-overlay-gate:256`, `mulligan-modal:49`); per §4 these become display roles or drop to `tracking-wider`≤`text-lg`.
7. **Board navbar floor violation** — `board-navbar.tsx` (8 sites) + `nav-menu.tsx` (2) use `text-xs` inside the scaled subtree; lift to `text-base` or document an exemption in §6.
8. **Card names** — 5 treatments → subheading (`text-base font-semibold`) in tooltips/previews/lists; detail-modal title is a modal title (item 1).
9. **Empty states** — 4 treatments → `text-sm text-content-tertiary` (caption color at body size).
10. **Card/set codes** — 3 combos → `code` role (`set-filter`, `set-browser`, `card-detail-modal`, `admin/cards/[id]`).
11. **Sibling drift in `lobby-room-shell`** — five h2/h3, three treatments (`:1125,1162,1218,937,1248`) → title-section / heading per hierarchy; delete the no-op `uppercase` at `:429`.
12. **`max-w-prose`** — currently zero uses; add to multi-line description blocks as touched.

## 9. Decision Traceability

| Decision | Rationale | Date |
|----------|-----------|------|
| Public Sans replaces Geist Sans as body | Geist read generic/default-AI against Erode; Public Sans is warmer, editorial, self-hostable, strong at 12px | 2026-08-09 |
| Geist Mono retained | Only used for machine strings; neutrality is desirable there | 2026-08-09 |
| Sans weight ceiling = 600 | Audit found 102 semibold vs 92 bold with no rule; one structural weight ends the coin flip; Erode owns "loud" | 2026-08-09 |
| `.font-display` stays un-overridable (unlayered) | Treatment is atomic brand expression; overridability caused the drift it now prevents | 2026-08-09 |
| Role-based ramp over named size tokens | BRANDING §4's token ramp (`display-xl`…`caption`) was never implemented; roles map 1:1 to existing Tailwind utilities so there is nothing new to build or drift from | 2026-08-09 |
| Responsive type reduction dropped | The 3-breakpoint table was never implemented; app is desktop-first with a min-viewport gate, hero sizes may add responsive steps case-by-case | 2026-08-09 |
| shadcn Typeset not adopted | Prose-wrapper system for rendered markdown; wrong tool for a product type ramp | 2026-08-09 |
