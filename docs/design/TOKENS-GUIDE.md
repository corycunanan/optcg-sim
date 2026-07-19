# Semantic token usage

[`src/app/globals.css`](../../src/app/globals.css) is the executable source of
truth. It defines raw CSS variables in `:root`, compatibility aliases for
shadcn/ui, and Tailwind v4 mappings in `@theme inline`. This guide explains which
semantic family to choose; it does not duplicate token values or the full visual
rationale in [`BRANDING-GUIDELINES.md`](./BRANDING-GUIDELINES.md).

## Choose by role

| Need                        | Tailwind utility family                                                                             | Notes                                                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page/panel elevation        | `bg-surface-base`, `bg-surface-1`, `bg-surface-2`, `bg-surface-3`, `bg-surface-nav`                 | Use the ordered surface scale; nav has its own structural surface.                                                                                                                                   |
| Standard text hierarchy     | `text-content-primary`, `-secondary`, `-tertiary`, `-disabled`, `-inverse`                          | `content-*` avoids collisions with shadcn's `text-primary`. The contrast comments in `globals.css` document tertiary's worst/current ratios.                                                         |
| Borders and focus           | `border-border`, `border-border-strong`, `border-border-focus`; shadcn `ring-ring`                  | Focus resolves to gold through `--border-focus`; preserve visible focus styles.                                                                                                                      |
| Primary/premium interaction | `bg-gold-500`, `hover:bg-gold-400`, `active:bg-gold-600`, `text-gold-600`                           | `gold-600` is the current pressed-gold and text-accent token; it is mapped in `@theme inline` and should not be replaced with an arbitrary color.                                                    |
| Destructive/emphasis        | `bg-red-600`, `hover:bg-red-500`, `bg-red-100`; shadcn `destructive`                                | Reserve red for destructive/error/emphasis roles.                                                                                                                                                    |
| Status feedback             | `text-success`, `bg-success-soft`, `text-warning`, `bg-warning-soft`, `text-error`, `bg-error-soft` | Pair a foreground status token with its soft surface where appropriate. The warning ratio comments in `globals.css` are the maintained accessibility record.                                         |
| Card identity               | `bg-card-red`, `bg-card-blue`, `bg-card-green`, `bg-card-purple`, `bg-card-black`, `bg-card-yellow` | The same names support text/border prefixes. They are functional TCG identifiers, not general UI accents.                                                                                            |
| Game board                  | `bg-gb-*`, `text-gb-*`, `border-gb-*`, and `gb-signal-*` roles                                      | Use the applicable utility prefix and signal tokens for battle, eligible, selected, hostile, and disabled states. The board text ratio comments in `globals.css` document AA against `--gb-surface`. |
| Overlay/shadow              | `bg-overlay`, `bg-overlay-light`, `shadow-sm/md/lg`, `shadow-don`                                   | `shadow-don` is board-specific. Holofoil variables support the dedicated holo-card effect.                                                                                                           |

## Compatibility aliases

shadcn primitives use aliases such as `background`, `foreground`, `card`,
`primary`, `secondary`, `muted`, `accent`, `destructive`, `input`, `ring`,
`chart-*`, and `sidebar-*`. Prefer these when styling a shadcn component in its
native vocabulary; prefer the semantic families above in feature components.
Both resolve to the same `:root` tokens.

## Non-color tokens

- Fonts map to `font-sans`, `font-mono`, and `font-display`.
- Radius is limited to `rounded`, `rounded-md`, `rounded-lg`, and
  `rounded-full`; `globals.css` overrides the first three values.
- Responsive section spacing uses `--section-pad-x`, `--section-pad-y`, and
  `--content-gap` at the current 1024px and 600px breakpoints.
- Do not hardcode design colors or use inline design styles in components. Add a
  named token and Tailwind mapping in `globals.css` when no existing semantic
  role fits.

The component rules, typography scale, motion language, and scaled-board
legibility floor remain in [`BRANDING-GUIDELINES.md`](./BRANDING-GUIDELINES.md).
