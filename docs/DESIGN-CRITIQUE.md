# OPTCG Simulator — Design Critique
_Generated 2026-03-17_

---

## Anti-Patterns Verdict: MIXED ⚠️

**The deck builder itself passes.** Components that went through M2.5 cleanup look legitimate — no AI palette, no glassmorphism, no gradient text, no decorative glow. The token system is principled.

**The page files fail.** `page.tsx`, `decks/page.tsx`, and `deck-builder-shell.tsx` are littered with `style={{ background: "var(--accent)" }}` — the exact pattern M2.5 was meant to eliminate. These pages look like early-session AI output that never got the cleanup pass.

**Specific tells found in page files:**
- `style={{ background: "var(--accent)" }}` on every CTA button (instead of `bg-navy-900`)
- `style={{ border: "1px solid var(--border-subtle)" }}` — removed token, renders broken
- `style={{ background: "var(--surface-0)" }}` — removed token, renders as browser default
- `text-[10px]` on deck cards (banned by rule #3 in `.impeccable.md`)
- Gradient-to-top overlay on deck card images — the most generic AI deck card pattern in existence

**The verdict is conditional pass:** The component library is clean; the page files are not. The AI slop lives in the pages, not the components.

---

## Overall Impression

The deck builder shell is genuinely good. Well-structured, token-driven, functionally complete. The problem is what surrounds it: a homepage that has no opinion, a decks page with broken styles and a cookie-cutter grid, and a brand personality (Adventurous. Warm. Confident.) that has not yet made contact with any actual page.

**Single biggest opportunity:** Apply the design system to the pages that users actually land on first. Right now the landing experience looks like it was forgotten.

---

## What's Working

### 1. The component system is immaculate
Every deck builder component uses Tailwind utilities, `cn()`, and design tokens correctly. `card-inspect-modal`, `deck-builder-list`, `deck-builder-stats`, `deck-builder-search` — all clean. Zero inline design properties. This is what the whole app should look like.

### 2. Color is used semantically, not decoratively
Navy = interactive/structural. Gold = premium/treasure. Red = destructive/emphasis. Six TCG colors = card identity. There is no color used "just because it looks nice." This is discipline that most AI-generated UIs lack entirely.

### 3. Independent scroll panels in the deck builder
Left and right panels scroll independently without fighting each other. This is a UX detail that's genuinely hard to get right and is done correctly here. A real sign of intentional development.

---

## Priority Issues

### 1. Page files are still using removed tokens and inline styles
**What:** `page.tsx`, `decks/page.tsx`, `login/page.tsx`, and `deck-builder-shell.tsx` all use `var(--surface-0)`, `var(--accent)`, `var(--border-subtle)` — tokens that were removed in M2.5. These resolve to nothing, causing invisible/unstyled elements. Additionally, all design properties on these pages use `style={{}}` instead of Tailwind utilities — the exact pattern the design system forbids.

**Why it matters:** These are the first pages users see. Broken styles here mean the whole app looks broken before users even reach the deck builder. It also creates a two-tier codebase where components are clean but pages are not.

**Fix:** Run the normalize pass on all page files. Replace every `style={{ background: "var(--accent)" }}` → `className="bg-navy-900"`, `style={{ color: "var(--text-primary)" }}` → `className="text-content-primary"`, etc. Remove all removed token references.

**Command:** `/normalize`

---

### 2. Barlow Condensed is loaded but completely invisible
**What:** `--font-display: var(--font-barlow-condensed)` is defined in `@theme` and the font is loaded in `layout.tsx` — but `font-display` is applied to zero elements anywhere in the codebase. Every heading, page title, section label, and card name is in Geist Sans. The display font that was specifically chosen to communicate "One Piece energy" doesn't exist in the UI.

**Why it matters:** Barlow Condensed was selected precisely because condensed bold display type matches the aesthetic direction — the official OPTCG site uses condensed type for headers, MTG Arena uses it for card names. Without it, the whole typographic system is just "Geist Sans at different sizes" — which reads as generic SaaS, not a game client.

**Fix:** Apply `font-display` to: `<h1>` on the homepage, "My Decks" heading, deck builder section headers (Cost Curve, Colors, Validation), the deck name in the header. The difference will be immediate and transformative.

**Command:** `/typeset`

---

### 3. The homepage has zero personality
**What:** `page.tsx` is three centered lines of text and three buttons on a white background. The deck name on line 1 is in default Geist Sans. There is no One Piece imagery, no motion, no character, no energy. It looks like a placeholder landing page.

**Why it matters:** This is the first thing a new user sees. "Adventurous. Warm. Confident." should describe this page immediately. Right now it describes nothing — it's a login splash screen for a CRUD app. The emotional goal of "delight when browsing cards" cannot be achieved if the first screen communicates nothing about what the product is or why it's exciting.

**Fix:** The homepage needs at minimum: a strong Barlow Condensed headline (large, bold, condensed), some card art or visual treatment that communicates "TCG simulator," and a primary CTA that looks like it was designed rather than dropped in. This is a bolder design moment.

**Command:** `/bolder`, then `/typeset`

---

### 4. Deck cards on `/decks` are the most generic AI card pattern possible
**What:** Each deck card is: full-width image (opacity 60%) with a gradient-to-top overlay, then title + subtitle below the gradient. This is pattern #1 in the AI interface playbook. It appears in approximately 40% of all AI-generated grid layouts.

**Why it matters:** The brand goal is explicitly "NOT Moxfield's utilitarian approach." But the current pattern is actually *less* distinctive than Moxfield — it's stock AI card design. The leader card image is the hero and deserves better than generic card-with-gradient-overlay.

**Fix:** Rethink the deck card. The leader image could be shown at its natural card proportion (portrait) rather than cropped into a landscape hero. The color dots indicating deck colors could be larger, more intentional TCG color swatches. The card could feel more like a game artifact, less like a music streaming playlist item.

**Command:** `/arrange`, `/bolder`

---

### 5. Empty state is functional but characterless
**What:** The empty decks page shows "No decks yet" and "Create your first deck to get started." This copy is accurate and harmless. It is also the most boring possible thing to say to a One Piece fan opening a simulator for the first time.

**Why it matters:** Empty states are the highest-leverage moments for brand personality. This is when the user has the most attention and the most willingness to be welcomed. "No decks yet" doesn't sound like it was written by someone who loves One Piece. It sounds like it was generated by `{emptyStateTemplate}`.

**Fix:** Give the empty state a character. Something like: "Ready to set sail? Build your first deck." or "Your collection starts here — pick a Leader and get building." Add an illustration or the outline of a card to make the space feel intentional rather than blank.

**Command:** `/delight`, `/onboard`

---

## Minor Observations

- **`deck-builder-shell.tsx`** loading state uses `style={{ background: "var(--surface-0)" }}` and `style={{ color: "var(--text-tertiary)" }}` — removed tokens. This loading state is technically broken.
- **`text-[10px]`** appears in `decks/page.tsx:188` on the date label — banned per rule #3. Replace with `text-xs`.
- **`gap-1.5`** appears in the header and elsewhere — off the 8px grid (rule #4). Should be `gap-2`.
- **`py-0.5`** on several badges — border-case acceptable for pill shapes, but worth reviewing for consistency.
- **"Saved 12:34:56 PM"** — the save status shows full locale time with seconds. Most users don't need seconds here. "Saved 5 min ago" or "Saved 12:34 PM" would be more readable.
- **The ✕ close button on `card-inspect-modal`** — `DialogClose` now shows correctly (fixed), but `h-8 w-8` (32px) is below the 44px WCAG touch target minimum.
- **No `aria-label` on the deck name edit button** — the pencil icon button in the header has no accessible label.

---

## Questions to Consider

- **"What would this look like if a One Piece fan built it?"** Not an engineer who likes One Piece — someone who opens the simulator and immediately feels the universe. What's the one thing that would make that happen?
- **"Does the deck builder header communicate status clearly enough?"** Users need to know at a glance: is this saved? Is it valid? The current design has both but they're quiet. What if the save button pulsed when unsaved?
- **"What if the six TCG colors were more prominent in the deck experience?"** The color system is functional but invisible at rest. On the decks page, a multi-color deck could have a stronger color identity than three 12px dots.
- **"Does the app need a nav bar, or is the back arrow enough?"** The current model has no persistent navigation. For a multi-page app with decks/builder/game, discoverable navigation might become important as features grow.
- **"What does 'immersion during gameplay' look like in this system?"** The design principles mention it, but M1/M2 have only built the deck builder. How does the design language need to extend for the game board?

---

## Overall Grade

| Dimension | Grade |
|---|---|
| Design system / tokens | A+ |
| Component quality (M2.5 pass) | A |
| Page quality (pre-normalize) | D |
| Typography (Barlow unused) | C |
| Brand personality expression | C+ |
| Microcopy & voice | B− |
| Accessibility (after Radix migration) | B |

**Overall: B−** — The foundation is genuinely strong. The problem is the surface layer that users see first hasn't been brought up to the same standard as the components inside it. Fix the pages and apply Barlow Condensed and this jumps to A−.
