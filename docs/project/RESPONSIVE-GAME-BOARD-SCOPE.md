---
status: Ready to start
created: 2026-04-27
owner: Cory Cunanan
linear-project: Responsive Game Board
linear-project-url: https://linear.app/optcg-sim/project/responsive-game-board-e42dfec537cc
handoff-doc: docs/project/handoffs/responsive-game-board.md
---

# Responsive Game Board — Scope & Plan

> This doc is the **architectural source of truth**. Ticket descriptions reference it; the handoff doc tracks ticket-by-ticket execution. Use [`/ticket OPT-XXX`](../../.claude/skills/ticket/SKILL.md) to start any of the tickets below.

---

## Summary

Make the game board fully responsive across desktop viewports (1280×720 and up) using a fixed-composition + uniform-scale approach. The board is authored once at a fixed design resolution (1920×1080) and rendered through a `<ScaledBoard>` wrapper that measures the viewport, computes a single scale factor, and applies a CSS `transform: scale()` to the whole composition. Every zone, card, on-board UI element, and animation scales together — there is no per-zone responsive logic. Chrome (navbar, tooltips, modals, side panels, sandbox controls) lives outside the scaled subtree and stays at fixed pixel sizes.

This is the same pattern used by Hearthstone, Legends of Runeterra, TFT, Yu-Gi-Oh! Master Duel, and Pokémon TCG Live — translated from Unity's `CanvasScaler` to CSS/React.

---

## Goals

- Game board fills the full viewport height at every supported size, with horizontal letterboxing as needed.
- Zero vertical scrolling. All zones visible at all times.
- Sandbox and live game share the same scaled-board infrastructure and remain visually identical.
- Card art reads as crisp on monitors up to 4K.
- Tooltips, navbar, and modal chrome stay at fixed real-pixel sizes regardless of viewport.
- Single-source-of-truth for board layout: change an animation in one place and both surfaces get it.

## Non-goals (v1)

- Tablet support — gated with a "use a larger screen" message below 1280×720. Future work.
- Mobile support — gated. Future work.
- Cross-boundary animations (e.g., card flying from board into a portaled modal). Out of scope; YAGNI until concrete need.
- Layout reflow at narrow viewports (no zone re-arrangement). The composition is fixed; only the scale changes.
- Visual regression tests between sandbox and live (filed as deferred tech debt).

---

## Architecture

### The 10 alignment decisions

| # | Decision |
|---|---|
| 1 | Design resolution: **1920×1080**, 16:9 |
| 2 | Board aspect: **16:9 commit**. Letterbox anything narrower (industry standard — same as Hearthstone, LoR, Master Duel) |
| 3 | **Inside scaled subtree:** board zones + on-board UI (life, don, end-turn, action prompts, counters). **Outside:** navbar, side panels, modals, tooltips, popovers, sandbox controls, toast notifications. Side panels overlay the letterbox area; they do not push the board inward. |
| 4 | Animations stay inside the scaled subtree. Project-wide `useScaledDrag` hook for any drag interaction. Cross-boundary animations explicitly deferred. |
| 5 | **Min viewport floor: 1280×720.** Below the floor → "use a larger screen" gate. Browser zoom: accept default behavior (chrome scales with zoom; board stays fitted). |
| 6 | Card images served at **2x design size** for crisp 4K rendering. Source asset resolution must be ≥ 2x design size — verified before commit. |
| 7 | **Two shells**: `<LiveGameShell>` and `<SandboxShell>` compose shared primitives in `src/components/game/scaled-board/`. Shells inject only `state` and `dispatch` into `<Board>` — they MUST NOT customize board internals. |
| 8 | ESLint import restriction enforces the shell contract. Visual regression test deferred as tech debt. |
| 9 | Migration plan **B**: PR 1 (primitives in isolation) → PR 2 (zone CSS audit + both shells together, atomic) → PRs 3–6 (portal audit, drag refactor, asset verification, gate UI + ESLint). Initial render: opacity-zero until first measure, fade-in (respects `prefers-reduced-motion`). |
| 10 | **Inside-board text floor:** `text-sm` (14px) minimum for labels, `text-base` (16px) minimum for body text. **Chrome text floor:** `text-xs` (12px). Reduced-motion respected on fade-in; resize re-scaling always snaps. **Focus rings inside board:** `ring-3` (3px proportional). Text inputs always live in chrome, never inside the scaled board. |

### Layout shell

```
┌─────────────────────────────────────────────────────┐
│  Navbar (fixed real-pixel height)                   │
├─────────────┬─────────────────────────┬─────────────┤
│             │                         │             │
│  Side       │   <ScaledBoard>         │  Side       │
│  panel      │   designWidth=1920      │  panel      │
│  (chat,     │   designHeight=1080     │  (log,      │
│  fixed-     │   16:9 composition      │  fixed-     │
│  width      │   centered both axes    │  width      │
│  chrome,    │   transform: scale(N)   │  chrome,    │
│  overlays   │                         │  overlays   │
│  letterbox) │                         │  letterbox) │
│             │                         │             │
└─────────────┴─────────────────────────┴─────────────┘
                         │
                         └──> portal target outside subtree
                              for tooltips, modals, popovers
```

### Shared primitives

All in `src/components/game/scaled-board/`:

- **`<ScaledBoard designWidth designHeight>`** — measures wrapper, computes scale via `min(height/designHeight, width/designWidth)`, applies transform, centers both axes, hides until first measure, fades in.
- **`<PortalRoot id="overlay-root" />`** — top-level portal target outside the scaled subtree. Tooltips, modals, popovers render here.
- **`useBoardScale()`** — hook exposing current scale factor for any component that needs viewport math.
- **`useScaledDrag(...)`** — wraps motion.dev `drag` with scale-aware coordinate division (otherwise drag feels off at non-1.0 scales).

### Shell contract

```tsx
// LiveGameShell.tsx
<ScaledBoard designWidth={1920} designHeight={1080}>
  <Board state={liveGameState} dispatch={wsDispatch} />
</ScaledBoard>

// SandboxShell.tsx
<ScaledBoard designWidth={1920} designHeight={1080}>
  <Board state={scenarioState} dispatch={scenarioDispatch} />
</ScaledBoard>
```

**Rule:** shells inject only `state` and `dispatch`. All animations, drag behaviors, hover states, zone rendering, and on-board UI live inside `<Board>` and its descendants — shared between both shells. Sandbox-only chrome (scenario picker, playback controls, debug overlays) and live-only chrome (chat sidebar, opponent info, connection status) live in the shell, **outside** the `<ScaledBoard>` wrapper.

### What scales vs what doesn't

| Inside scaled subtree (scales) | Outside scaled subtree (fixed real pixels) |
|---|---|
| Board zones (life, deck, hand, character, stage, leader, don, trash) | Navbar |
| Cards and card art | Tooltips (portaled) |
| On-board UI (end-turn button, phase indicator, action prompts) | Modals (portaled) |
| Counters and life totals | Popovers (portaled) |
| Drag indicators and hover states | Toast notifications |
| Animations (motion.dev inside the board) | Chat sidebar (live shell) |
| Focus rings (`ring-3` proportional) | Game log / event history (live shell) |
|  | Scenario picker, playback controls (sandbox shell) |
|  | Debug overlays (sandbox shell) |
|  | Min-viewport gate UI |

---

## Risks

### High

- **`position: fixed` does NOT escape a transformed parent.** It's a CSS spec gotcha — fixed-positioned elements inside `<ScaledBoard>` will position relative to the scaled parent, not the viewport. Any "stuck to viewport" element inside the board must portal out. Phase 5 portal audit must catch this.
- **Drag math regression.** Pre-migration drag code uses viewport-pixel deltas directly. Post-migration, those deltas must be divided by `scale` or drag will feel off. Centralized via `useScaledDrag`; ESLint rule should flag direct `motion.div drag={...}` usage that bypasses the wrapper (deferred — call out in code review for now).

### Medium

- **Long-lived migration branch** (PR 2 touches every zone component). Mitigation: land PR 1 (primitives) first as its own PR; PR 2 only touches zone files — minimize concurrent work in `src/components/game/zones/` while PR 2 is open.
- **M5d motion code overlap.** M5d ships first (per merge plan); PR 2's CSS audit will touch M5d-modified files. Most motion code (transform-based) survives the migration intact; only viewport-relative units (`vh`, `vw`, `clamp`) and `position: fixed` need rework.
- **Source card image resolution.** If existing R2 assets are below 2x design size, "serve at 2x" is a nominal strategy that produces upscaled output. PR 5 verifies and surfaces a pipeline change if needed.

### Low

- **Text rasterization at extreme upscale (4K).** Browsers re-rasterize text on transformed layers in most static cases, but heavy upscale of small text can look slightly soft. Mitigated by stricter inside-board text floor (`text-sm`/`text-base`) and `will-change: transform` on the scale wrapper.
- **Focus ring visibility at minimum viewport.** A 3-design-pixel ring renders as 2px at the floor — visible but tight. Acceptable; revisit if QA flags.
- **Initial render flash.** Mitigated by opacity-zero until first measure + 150ms fade-in (skip fade if reduced-motion).

---

## References

- [Animation Sandbox scope doc](./ANIMATION-SANDBOX-SCOPE.md) — sibling project; established the sandbox surface this work makes responsive
- [Branding Guidelines](../design/BRANDING-GUIDELINES.md) — design tokens; this work tightens the inside-board text floor on top of the existing system
- [CLAUDE.md](../../CLAUDE.md) — codebase conventions (styling rules, design principles)
- Industry references for the fixed-composition + scale approach: Hearthstone, Legends of Runeterra, TFT, Yu-Gi-Oh! Master Duel, Pokémon TCG Live (all use Unity's `CanvasScaler` "Scale With Screen Size" mode — the same pattern translated to CSS)
