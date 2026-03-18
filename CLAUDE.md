# OPTCG Simulator — CLAUDE.md

## Project

One Piece Trading Card Game simulator — deck builder, card database, and game engine. Built with Next.js 16, React 19, Tailwind CSS v4, Prisma 6, TypeScript.

## Design Context

### Users
One Piece Trading Card Game players — competitive and casual — who want to build decks, browse cards, and play games online. They're typically engaged fans who spend long sessions deckbuilding and testing. The context is focused, functional play: search a card, build a deck, jump into a game. They expect the tool to feel like a premium OPTCG product, not a generic gaming app or a spreadsheet.

### Brand Personality
**Adventurous. Warm. Confident.**

The OPTCG Simulator channels the spirit of One Piece — joyful, energetic, and alive. It should feel like the official OPTCG website but purpose-built for play: clean, welcoming, unmistakably One Piece. Card art is spectacular and deserves a bright, uncluttered stage.

Emotional goals: delight when browsing cards, focus when building decks, immersion during gameplay.

### References
- **[Official OPTCG Website](https://en.onepiece-cardgame.com/)** — bright white surfaces, deep navy navigation, gold accents, generous whitespace, card art as hero. This is the primary reference.
- **[MTG Arena](https://magic.wizards.com/en/mtgarena)** — spacing discipline, fluid typography, purposeful motion, CSS variable system.

### Aesthetic Direction
- **Visual tone:** Clean and bright, with purposeful dark moments for the game board. Not dark/moody/gamer — that's not what One Piece is.
- **Primary theme:** Light mode. Dark surfaces reserved for the game board where immersion matters most.
- **Color palette:**
  - Warm white (`oklch(98% 0.005 75)`) and off-white for surfaces
  - Deep navy (`oklch(22% 0.04 245)`) — **primary accent AND structure**: buttons, active states, navigation, highlights
  - Warm gold (`oklch(72% 0.14 75)`) — secondary accent for premium/treasure moments
  - One Piece red (`oklch(55% 0.20 25)`) for emphasis, energy, and destructive actions only
  - Six TCG card colors (Red, Blue, Green, Purple, Black, Yellow) remain functional identifiers only
- **Typography:**
  - **Display/headings:** Barlow Condensed (Google Fonts) — bold condensed for page titles, section headers. Weights 600–800.
  - **Body:** Geist Sans — all body text, labels, UI elements.
  - Strict type scale: 12/14/16/18/20/24/30px. No custom `text-[Xpx]` sizes in components.
- **Accessibility:** WCAG AA — 4.5:1 contrast for text, keyboard navigable, focus visible.
- **Card presentation:** Warm white or light surfaces let art breathe. Single, clean hover state — no stacking of lift + shadow + blur.
- **Anti-references:** NOT dark/teal/moody. NOT gamer-neon. NOT generic SaaS dashboard. NOT over-decorated with gradients and backdrop blurs.

### Styling Rules (enforced)

These rules exist to prevent "AI slop" — arbitrary decisions that look reasonable in isolation but break the system:

1. **No inline `style={{}}` for design properties** — all colors, borders, and backgrounds go through Tailwind utilities backed by CSS tokens
2. **No hardcoded oklch/hex values in component files** — define in `globals.css` tokens, reference by name
3. **No custom font sizes** — `text-[9px]`, `text-[10px]`, `text-[11px]` are banned. Use `text-xs` (12px) minimum
4. **Spacing scale only** — only Tailwind steps 1/2/3/4/5/6/8/10/12/16. No `p-2.5`, `px-3 py-1.5`, etc.
5. **Three border-radius values** — `rounded` (4px, badges), `rounded-md` (8px, inputs/buttons), `rounded-lg` (12px, panels/modals), `rounded-full` (pills). Nothing else.
6. **No JS style manipulation** — no `element.style.X =` or `onMouseOver` setting inline properties. Use CSS state (Tailwind `group-hover:`, `data-[state]:`)
7. **`cn()` for all conditional classes** — use clsx + tailwind-merge, never string concatenation

### Design Principles

1. **Card art is the hero** — Clean, bright surfaces amplify artwork. UI chrome minimizes and recedes.
2. **One Piece warmth** — Bright, energetic, inviting. Color and whitespace create warmth, not decoration or gradients.
3. **Tight system, loose expression** — Every spacing, type, and color decision traces back to a token. Within that system, layouts can be expressive.
4. **Motion earns its place** — Transitions communicate state. One clear animation per interaction, not stacked effects.
5. **Progressive clarity** — Simple at rest, detailed on interaction. Dense information (stats, filters) is scannable through hierarchy, not visual noise.
