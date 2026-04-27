# Scaled Board Primitives

Primitives that author the game board once at a fixed design resolution (1920×1080) and apply a uniform CSS `transform: scale()` to fit the viewport. Same approach Hearthstone, Legends of Runeterra, TFT, and Master Duel use — translated from Unity's `CanvasScaler` to CSS/React.

Full scope: [`docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md`](../../../../docs/project/RESPONSIVE-GAME-BOARD-SCOPE.md).

## Exports

- `<ScaledBoard designWidth designHeight>` — measures wrapper, computes scale, applies transform, centers both axes. Hides until the first measure, then fades in (respects `prefers-reduced-motion`).
- `<PortalRoot id?>` — top-level portal target. Mount **outside** any `<ScaledBoard>` in the page layout. Defaults to `id="overlay-root"`.
- `getPortalContainer(id?)` — returns the `HTMLElement` for the portal target, or `null` on the server. Pass to Radix's `Portal container={...}` prop, or use as the `createPortal` target.

## The portal rule

**Tooltips, modals, popovers must portal to `#overlay-root`. Never use `position: fixed` inside the scaled subtree.**

CSS spec gotcha: `position: fixed` does **not** escape a transformed parent. Any element that needs to be viewport-relative (real pixels, ignoring scale) must render in a DOM subtree that is not transformed. `<PortalRoot>` provides that subtree.

```tsx
// Inside an overlay component:
import { Portal } from "@radix-ui/react-portal";
import { getPortalContainer } from "@/components/game/scaled-board";

<Portal container={getPortalContainer() ?? undefined}>
  <Tooltip />
</Portal>
```

Or with React's `createPortal`:

```tsx
import { createPortal } from "react-dom";
import { getPortalContainer } from "@/components/game/scaled-board";

const container = getPortalContainer();
return container ? createPortal(<Tooltip />, container) : null;
```

The `?? undefined` (or `?? document.body`) fallback matters: `<PortalRoot>` is mounted by shells (OPT-314/315), and until those land, `getPortalContainer()` returns `null`. Without a fallback, the overlay renders nowhere.

## Layout shape

```tsx
// In <LiveGameShell> / <SandboxShell>:
<>
  <PortalRoot />
  <ScaledBoard designWidth={1920} designHeight={1080}>
    <Board ... />
  </ScaledBoard>
</>
```

`<PortalRoot>` mounts **before** `<ScaledBoard>` so `#overlay-root` exists in the DOM when the first scaled descendant tries to portal into it. Both shells mount one `<PortalRoot>` instance, outside the `<ScaledBoard>` wrapper but inside the page layout.

## Audited overlays (OPT-317)

The `getPortalContainer()` default is wired into every overlay primitive in the repo. Callers don't need to opt in — using the wrapper is enough.

**Radix primitives (`src/components/ui/`)** — `container` defaults to `getPortalContainer() ?? undefined`, falls back to `document.body`:

| Primitive | File |
|-----------|------|
| AlertDialog | `alert-dialog.tsx` (`AlertDialogPortal` wrapper) |
| Dialog | `dialog.tsx` (`DialogPortal` wrapper, used by `command.tsx`) |
| DropdownMenu | `dropdown-menu.tsx` (`DropdownMenuPortal` wrapper) |
| HoverCard | `hover-card.tsx` (inline portal in `HoverCardContent`) |
| Popover | `popover.tsx` (inline portal in `PopoverContent`) |
| Select | `select.tsx` (inline portal in `SelectContent`) |
| Sheet | `sheet.tsx` (`SheetPortal` wrapper) |
| Tooltip | `tooltip.tsx` (inline portal in `TooltipContent`) |

**Custom overlays (`src/components/game/`)** — explicit `createPortal` calls:

| File | Purpose |
|------|---------|
| `board-layout/card-animation-layer.tsx` | Card flight overlay (settled in OPT-313) |
| `arrange-top-cards-modal.tsx` | dnd-kit `DragOverlay` |

**Chrome (`position: fixed` outside the scaled subtree — intentionally not portaled):**

These render at the page-layout level, *outside* any `<ScaledBoard>`, so `position: fixed` resolves against the viewport correctly today. Shell authors (OPT-314/315) must keep them outside the scaled wrapper:

- `src/app/layout.tsx` — Sonner `<Toaster />` (app root)
- `src/app/game/layout.tsx` — game-route bg wrapper
- `src/components/ui/sidebar.tsx` — chrome
- `src/components/game/event-log.tsx` — sibling of `BoardLayout`
- `src/components/game/game-board-visual.tsx` — opponent-away banner + dev modal-test panel (siblings of `BoardLayout`)

If a future shell wraps any of these inside `<ScaledBoard>`, they must move into the portal subtree (or stop using `position: fixed`).

## Overriding the default

A consumer can pass `container={null}` (or any `HTMLElement`) to a `*Portal` wrapper to opt out of `#overlay-root` and target Radix's body fallback (or a custom container). This is rare — chrome consumers should still portal to `#overlay-root` so behavior is uniform.
