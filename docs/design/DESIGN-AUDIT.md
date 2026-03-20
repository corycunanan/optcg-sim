# OPTCG Simulator — Design Audit
_Generated 2026-03-17_

---

## Anti-Patterns Verdict: PASSED ✅

No AI slop detected. Zero cyan-on-dark, no arbitrary gradient overlays, no glassmorphism. Color, spacing, and border-radius all trace back to tokens. Shadows are functional. Animations are purposeful.

---

## Executive Summary

| Category | Issues | Severity |
|---|---|---|
| Theming (undefined CSS vars) | 20+ | **Critical** |
| Accessibility | 20+ | High |
| Responsive | 3 major | High |
| Typography (Barlow Condensed unused) | 1 | Medium |
| Performance | 3 | Medium |
| Spacing (off-grid) | 15+ | Low–Medium |

**Top 5 critical issues:**
1. `--surface-0`, `--accent`, `--border-subtle` used across pages/pages — vars no longer exist after M2.5 token rewrite
2. Focus trap missing in card-inspect-modal (Radix Dialog handles this — verify it's actually working)
3. Quantity control touch targets are 28px — below 44px WCAG minimum
4. Barlow Condensed loaded but never applied to any heading
5. Deck builder layout has no mobile breakpoints (420px fixed sidebar)

---

## Critical Issues

### 1. Undefined CSS Variables in Page Files
**Severity:** Critical
**Files:** `src/app/page.tsx`, `src/app/decks/page.tsx`, `src/app/login/page.tsx`, `src/components/deck-builder/deck-builder-shell.tsx`

These pages were not cleaned up as part of the M2.5 component pass and still reference removed tokens:

| Variable | Status | Replacement |
|---|---|---|
| `--surface-0` | ❌ Removed | `--surface-base` → `bg-background` |
| `--accent` | ❌ Removed | `--navy-900` → `bg-navy-900` |
| `--border-subtle` | ❌ Removed | `--border` → `border-border` |
| `--accent-soft` | ❌ Removed | `--navy-100` → `bg-navy-100` |
| `--teal` | ❌ Removed | `--navy-900` → `text-navy-900` |
| `--sage-muted` / `--sage` | ❌ Removed | `--gold-100` / `--gold-500` |

**Specific locations:**
- `page.tsx:10, 18, 31-33` — `--surface-0`, `--accent`
- `deck-builder-shell.tsx:180, 190` — `--surface-0`
- `decks/page.tsx:54, 62, 76, 104, 130-131` — `--accent`, `--border-subtle`
- `login/page.tsx:22, 33, 48` — `--surface-0`, `--accent`, `--border-subtle`

**Fix:** Run the page cleanup pass (Step 4 remainder of M2.5)
**Command:** `/normalize`

---

## High-Severity Issues

### 2. Touch Targets Below 44px
**Severity:** High — WCAG 2.5.5 (AAA) / 2.5.8 (AA in WCAG 2.2)
**Files:** `deck-builder-list.tsx`, `card-inspect-modal.tsx`, `deck-builder-search.tsx`

- `deck-builder-list.tsx:189-210` — Quantity `−`/`+` buttons are `h-7 w-7` (28px). Need `h-11 w-11` (44px) or at minimum `h-9 w-9` (36px) with adequate spacing.
- `card-inspect-modal.tsx:333-352` — Same quantity controls at 32px.
- `deck-builder-search.tsx:267-283` — Pagination `←`/`→` buttons are small.

**Fix:** Increase to at minimum 36px (h-9) with proper padding
**Command:** `/harden`

### 3. Missing Accessible Labels on Icon/Action Buttons
**Severity:** High — WCAG 1.1.1, 4.1.2
**Files:** Multiple

- `deck-builder-list.tsx` — Remove button (✕) has `title="Remove"` but no `aria-label`
- `card-inspect-modal.tsx` — Close button lacks `aria-label="Close"`
- `deck-builder-header.tsx` — Edit pencil icon has no label
- `deck-builder-search.tsx` — Card grid buttons lack `aria-label`

**Fix:** Add `aria-label` to all icon-only interactive elements
**Command:** `/harden`

### 4. No Mobile Layout
**Severity:** High
**Files:** `deck-builder-shell.tsx`, `card-inspect-modal.tsx`

- `deck-builder-shell.tsx` — `w-[420px] shrink-0` left panel will cause overflow on viewports < ~900px. No `sm:`/`md:` breakpoints.
- `card-inspect-modal.tsx` — `w-[280px]` left panel + right panel will overflow on mobile.

**Fix:** Stack layout on mobile with collapsible panels
**Command:** `/adapt`

### 5. Missing Input Labels
**Severity:** High — WCAG 1.3.1, 3.3.2
**Files:** `deck-builder-header.tsx`, `deck-builder-search.tsx`, `import-modal.tsx`

All text inputs (deck name edit, search, cost min/max, type select, import textarea) lack associated `<label>` elements. Using `placeholder` as a label is an accessibility failure.

**Fix:** Add `aria-label` or `<label htmlFor>` to all inputs
**Command:** `/harden`

---

## Medium-Severity Issues

### 6. Barlow Condensed Loaded but Never Applied
**Severity:** Medium
**Files:** All page/heading files

`--font-display: var(--font-barlow-condensed)` is defined in `@theme` but `font-display` class is never used. Page titles, section headers, and the deck name should use this for impact.

**Fix:** Apply `font-display` to `<h1>`, `<h2>` and display-context card names
**Command:** `/typeset`

### 7. Layout-Animating CSS Properties
**Severity:** Medium — Performance
**File:** `deck-builder-stats.tsx:89-119`

`CostCurveChart` animates `height` via inline style with `transition-all duration-300`. Animating `height` triggers layout recalculation. Should use `scaleY` transform with `transform-origin: bottom`.

**Fix:** Replace height animation with `transform: scaleY()` + `transform-origin: bottom`
**Command:** `/optimize`

### 8. Heading Hierarchy Issues
**Severity:** Medium — WCAG 1.3.1
**Files:** Multiple

Section headers inside components (`Cost Curve`, `Colors`, `Validation`) use `<h3>` without a parent `<h2>` or `<h1>` in the shell. This creates a broken heading hierarchy for screen readers.

**Fix:** Audit and correct heading levels throughout
**Command:** `/harden`

---

## Low-Severity Issues

### 9. Off-Grid Spacing Remnants
**Severity:** Low
**Files:** `card-inspect-modal.tsx`, `deck-builder-list.tsx`

- `card-inspect-modal.tsx:316` — `px-1.5 py-0.5` (6px/2px)
- `card-inspect-modal.tsx:393` — `px-2 py-0.5` (8px/2px)
- `deck-builder-list.tsx:142` — `gap-0.5` (2px)
- Various `py-0.5` on badges — acceptable for pill shapes but worth reviewing

**Fix:** Standardize small spacing in badge/tag components
**Command:** `/polish`

### 10. Missing Skeleton Loaders
**Severity:** Low — Perceived Performance
**Files:** `deck-builder-search.tsx`, `deck-builder-shell.tsx`

Search results show nothing during load. No shimmer/skeleton states.

**Fix:** Add skeleton card placeholders during search
**Command:** `/animate`

### 11. Missing will-change on Hover Transforms
**Severity:** Low — Performance
**Files:** `deck-builder-search.tsx:236`, `deck-builder-list.tsx:98`

Scale transforms on card hover lack `will-change: transform` hint.

**Fix:** Add `will-change-transform` Tailwind class
**Command:** `/optimize`

---

## Positive Findings

- **Token system is immaculate** — globals.css is the single source of truth. Every design decision is traceable.
- **`cn()` used correctly throughout** — No string concatenation for conditional classes.
- **Color used semantically** — Navy = interactive, Gold = premium, Red = destructive. No decorative color use.
- **Radix Dialog on all modals** — Accessibility primitives (focus trap, escape, overlay click) handled by the library.
- **Card images have `loading="lazy"`** — All images correctly lazy loaded.
- **Independent scroll panels** — Deck builder left/right scroll independently — hard to get right, done correctly.
- **Dynamic-only inline styles** — Remaining inline `style={{}}` usages are genuinely dynamic (card colors from data) — acceptable.

---

## Recommendations by Priority

### Immediate
1. Fix undefined CSS variables in page files (`--surface-0`, `--accent`, `--border-subtle`) — these are live bugs causing invisible/broken styles

### Short-term
2. Apply Barlow Condensed to headings (`/typeset`)
3. Fix touch target sizes on quantity controls (`/harden`)
4. Add `aria-label` to all icon-only buttons (`/harden`)
5. Add input labels (`/harden`)

### Medium-term
6. Mobile layout for deck builder (`/adapt`)
7. Replace height animation with transform (`/optimize`)
8. Fix heading hierarchy (`/harden`)

### Long-term
9. Skeleton loaders for search (`/animate`)
10. One Piece voice in microcopy (`/clarify`)
11. Empty state delight (`/delight`, `/onboard`)

---

## Suggested Commands

- `/normalize` — Fix undefined token references in page files (critical)
- `/typeset` — Apply Barlow Condensed, fix heading hierarchy
- `/harden` — Touch targets, aria-labels, input labels, heading semantics
- `/adapt` — Mobile layout for deck builder and modals
- `/optimize` — Height animation → transform, will-change hints
- `/animate` — Skeleton loaders for search
- `/delight` — Loading states, empty states, validation celebrations
- `/clarify` — One Piece microcopy voice pass
