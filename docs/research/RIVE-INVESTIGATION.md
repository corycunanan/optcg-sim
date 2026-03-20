# Rive Investigation — OPTCG Simulator Game Board

**Date:** 2026-03-18
**Status:** Evaluated, not adopted (revisit after M4)
**Decision:** Proceed with React + Framer Motion for M3; Rive remains an option for M5 polish

---

## What Is Rive?

Rive is a design-and-animation platform with three parts:

- **Editor** — browser-based design tool (Figma-like). Author vector artwork, rig animations on a timeline, wire them into a State Machine with visual logic. Scripting available in Luau (Roblox dialect of Lua).
- **`.riv` format** — compact binary: vector paths, bones, animation keyframes, state machine graphs, embedded fonts.
- **Runtimes** — open-source libraries that load `.riv` files at runtime. App runtimes: Web/React/React Native/iOS/Android/Flutter. Game runtimes: Unity/Unreal/Defold.

The web runtime is WASM-backed C++ compiled to WebAssembly. The React package is a thin wrapper around it.

---

## React / Next.js Compatibility

| Concern | Status |
|---|---|
| React 19 support | Officially added January 2025 (PR #323) — **supported** |
| Next.js App Router | Works, but requires `"use client"` + `dynamic(..., { ssr: false })` — WASM cannot run at SSR time |
| Next.js 14 loading bug | GitHub #249 — unresolved, appears to be a CORS misconfiguration issue |
| HMR in dev | "File Instance Already Deleted" errors (#141) — a known friction point |

**Bundle sizes (brotli-9):**
| Package | Compressed |
|---|---|
| `canvas-lite` | 222 KB |
| `canvas` | 567 KB |
| `webgl2` (recommended) | 648 KB |

For comparison: Framer Motion is ~100 KB gzipped. Rive's WASM overhead is 5–6x larger.

---

## How to Drive Rive from React Game State

Rive exposes React hooks that bridge JS state → animation state:

```typescript
// Push game state into Rive
const { value: isTapped, setValue: setTapped } = useViewModelInstanceBoolean('isTapped', vmi);
setTapped(true); // → card tilt animation plays on next frame

// Listen for animation events back in React
rive.on(EventType.RiveEvent, (e) => {
  if (e.data.name === 'attackAnimationComplete') resolveCounterWindow();
});
```

The data flow is: **WebSocket game state → React state → ViewModel hooks → Rive animation state**. This is clean and well-supported. Rive's state machine handles *what animation is playing*; game logic (turn phases, validation) stays entirely in TypeScript.

---

## Performance: Multiple Cards on the Board

**Critical constraint:** Browsers cap concurrent WebGL contexts at ~8–16. 10+ animated card canvases will hit this limit.

**Mitigation:** `useOffscreenRenderer: true` consolidates all Rive instances into one shared WebGL context. **Mandatory for any game board with multiple cards.** The low-level API also supports rendering multiple artboards onto a single `<canvas>` — explicitly documented as "useful if you're building a game."

Additional best practices:
- Cache `.riv` files with `useRiveFile` — parsed once, reused across instances
- Pause offscreen instances — negligible CPU when paused
- Avoid aggressive mount/unmount of `RiveComponent` (causes lag — GitHub #400)

---

## What Rive Does Well (Relevant to OPTCG)

| Use Case | Rive Fit |
|---|---|
| Card flip (tap/rest) | Excellent — bone rigs, timeline, full art control |
| Attack declaration animation | Excellent — pre-authored with full visual control, triggered via JS |
| Counter window burst / VFX | Excellent — multi-stage sequences |
| Damage resolution / life card discard | Excellent |
| Idle card ambient effects (glow, breathing) | Excellent |
| Custom card destruction animation | Excellent |

---

## What Rive Does Poorly (Also Relevant)

| Use Case | Problem |
|---|---|
| Card hand display (N cards in a row) | Layout is design-time defined, not DOM-flow. Can't do dynamic flexbox for variable hand sizes. |
| Drag-and-drop | No native DnD API. Requires manual pointer position tracking via ViewModels per frame. |
| Card stats / text overlays | Canvas text only — bypasses browser text APIs, no DOM accessibility. |
| Menus, modals, filters, HUD | Wrong tool. Use React/HTML for all UI chrome. |
| Fast dev iteration | No HMR. Every animation change requires editor → export → deploy cycle. |
| Accessibility | All canvas, all manual ARIA. Screen readers are blind to canvas content. |

---

## Recommended Architecture If Rive Is Adopted

A hybrid split is the right approach — not Rive for everything, not Rive for nothing:

**React / HTML / Tailwind handles:**
- Hand display (flexbox row of cards, variable count)
- Zone layout (CSS Grid: leader / characters / DON / life / stage)
- Drag-and-drop (dnd-kit or similar)
- All card text / stat overlays (DOM text, full browser rendering)
- Menus, modals, phase HUD, game log
- WebSocket game state management

**Rive handles** (absolutely-positioned `<canvas>` overlays per zone/card):
- Card flip, tap, untap, rest animations
- Attack declaration sequence (leader lunges forward)
- Counter window / blocker window burst effects
- Damage resolution (life card animation)
- Zone ambient effects (active zone glow during your turn)

Technically: each Rive element is a React component with a `<canvas>` inside an absolutely-positioned `<div>` overlaying the relevant zone. React drives Rive via ViewModel hooks; Rive fires events back via `rive.on(EventType.RiveEvent)` to advance game state.

---

## Rive vs. Framer Motion — TCG Game UI Tradeoffs

| Dimension | Rive | Framer Motion |
|---|---|---|
| Animation fidelity | Exceptional — bone rigs, mesh deforms, blend states | CSS transforms + spring/tween only |
| Visual authoring | Yes — design tool with full art control | No — code only |
| Card flip | First-class with 3D-like rig | Manual 3D CSS `perspective` + `rotateY` |
| Attack/damage VFX | Pre-authored, production quality | Programmatic only; lower ceiling |
| Bundle size | ~648 KB (webgl2) | ~100 KB |
| React/Next.js friction | Client-only, CORS gotchas, HMR issues | Zero friction |
| Layout / dynamic card counts | Cannot do DOM flow | Animates DOM elements — inherits CSS layout |
| Drag-and-drop | Manual pointer tracking | No native DnD; pair with dnd-kit |
| Accessibility | Manual ARIA on canvas | DOM elements, inherits HTML a11y |
| Designer workflow | Requires editor, ~2–4 week ramp-up | Pure code, standard JS iteration |
| Multiple instances | WebGL context limit (use offscreen renderer) | No limits, GPU-accelerated CSS transforms |
| Production TCG examples | None publicly documented | None either, but DOM model is simpler |

**Summary:** Framer Motion is the lower-risk path for a DOM-based game board. Rive's ceiling is genuinely higher for specific rich animations, but it introduces real workflow costs for a solo or small team.

---

## Decision

**Proceed with React + Framer Motion for M3 (Simulator Core) and M4 (Effect Engine).**

Rationale:
1. No production web TCG examples with Rive exist to validate the approach
2. The hybrid overlay pattern works but adds coordinate-alignment complexity
3. The authoring workflow (editor → export → deploy) breaks fast iteration critical for M3/M4
4. Framer Motion + CSS 3D transforms achieves 70% of the visual quality at a fraction of the cost
5. Rive's real value is in animations that justify pre-authoring in a design tool — card flip, attack sequences, VFX bursts. These are M5 concerns, not M3.

**Revisit at M5 (Polish & Scale):** Rive becomes compelling for specific high-impact moments — attack declarations, damage resolution, idle ambiance — once the game engine is stable and the team has capacity to invest in the editor workflow.

---

## Open Questions (If Rive Is Adopted Later)

- Confirm `useOffscreenRenderer` behavior with React 19 (untested at time of research)
- Test Next.js 15/16 `.riv` loading with current CORS configuration
- Benchmark: how many simultaneous card artboards at 60fps on a mid-range laptop?
- Evaluate Rive Marketplace for pre-built card game assets to reduce editor ramp-up time
- Assess Luau scripting for in-animation logic vs. pure JS event driving
