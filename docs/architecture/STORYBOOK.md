# Storybook

Storybook 9 (`@storybook/nextjs-vite` framework) for developing and reviewing UI components in isolation. Useful for primitives that depend on viewport size (e.g. the scaled-board primitives in `src/components/game/scaled-board/`), visual states that are hard to reach in-app (drag interactions, focus rings, hover cards), and design-system surfaces (typography, color tokens).

## Scripts

```bash
pnpm storybook         # dev server on http://localhost:6006
pnpm build-storybook   # static build to ./storybook-static (gitignored)
```

`build-storybook` is **not** wired into `pnpm build`. Storybook is a developer tool — production deploys (`next build --webpack`) ignore the `.storybook/` folder and `**/__stories__/` files entirely.

## Convention: `__stories__/` co-location

Stories live in a `__stories__/` folder next to the component:

```
src/components/ui/
├── button.tsx
└── __stories__/
    └── button.stories.tsx
```

The glob in `.storybook/main.ts` picks up `src/**/__stories__/*.stories.@(ts|tsx)` and `src/**/__stories__/*.mdx`. The `__stories__/` segment keeps stories adjacent to source without polluting the component directory's flat listing, and matches the existing `__tests__/` convention used in `src/lib/sandbox/`.

## What's already wired

- **Tailwind v4** — `globals.css` is imported in `.storybook/preview.tsx`, so design tokens (`bg-navy-900`, `text-content-primary`, etc.) and the `@theme inline` mappings work in stories.
- **Fonts** — Geist Sans, Geist Mono, and DM Serif Display load via `next/font/google` (same call as `src/app/layout.tsx`). A preview decorator applies the CSS variables (`--font-geist-sans`, `--font-dm-serif-display`, …) to a wrapper, so `font-sans` / `font-display` resolve correctly.
- **next/image, next/link, next/font** — handled automatically by `@storybook/nextjs-vite` (no manual mocks).
- **App Router** — for stories of components that call `useRouter` / `usePathname`, set `parameters.nextjs.appDirectory: true` in the story's meta. Default is Pages Router compatibility.

## What's deferred

- **Visual regression / Chromatic** — not installed; file as a follow-up if needed.
- **`@storybook/addon-a11y`** — not installed; file as a follow-up.
- **RSC (server component) story support** — `@storybook/nextjs-vite` renders client components only. Server components stay out of stories until there's a concrete need.

## Adding a new story

1. Create `<component-folder>/__stories__/<name>.stories.tsx`.
2. Import the component via the `@/` alias.
3. `import type { Meta, StoryObj } from "@storybook/nextjs-vite"` (not `@storybook/react` — the framework type carries Next-specific parameters).
4. Run `pnpm storybook` to verify.

See `src/components/ui/__stories__/button.stories.tsx` for the smoke story this setup ships with.
