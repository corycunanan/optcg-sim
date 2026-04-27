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

<Portal container={getPortalContainer()}>
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

## Layout shape

```tsx
// In <LiveGameShell> / <SandboxShell>:
<>
  <ScaledBoard designWidth={1920} designHeight={1080}>
    <Board ... />
  </ScaledBoard>
  <PortalRoot />
</>
```

Both shells mount one `<PortalRoot>` instance, outside the `<ScaledBoard>` wrapper but inside the page layout.
