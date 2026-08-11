---
name: orchestrate-frontend
description: Run a Linear scope of frontend/UI work through a design-aware orchestration pipeline — the Fable orchestrator triages by design ambiguity, briefs, reviews, and VQAs; Opus subagents implement design-lead tickets; Codex Sol on low reasoning implements spec-executable tickets. Every PR gates on VQA + design-system checks. Args - same as /orchestrate - a Linear project name, a comma/space-separated issue list, or a single issue ID.
---

# Orchestrate Frontend — design-aware implementation pipeline

Variant of `/orchestrate` for frontend/UI scopes. Inherit everything from `.claude/skills/orchestrate/SKILL.md` (dispatch runtime, scope resolution, queue discipline, monitoring, close-out, hard rules) except where overridden below. Canonical policy: `docs/project/ORCHESTRATION-CHARTER.md`; recall `project-codex-orchestration` memory for sandbox/VQA recipes.

**Charter amendment (this skill only):** the base rule "Claude never authors implementation code" is replaced by the two-track model below. Claude authors implementation code on the design-lead track. State this explicitly at kickoff and get in-session ratification, including the merge-consent ritual naming both cases in plain words: "Codex-authored PRs merged with no human review" AND "Claude-authored PRs merged with cross-family Codex review but no human review."

## Design authorities (read before triage, cite in every brief)

- `docs/design/BRANDING-GUIDELINES.md` — typography, palette roles, theming contract, motion, §13 scaled-board floor
- `docs/design/INTERACTION-GRAMMAR.md` — board interaction verbs, spotlight reveals, grey rejection, travel-vs-transform motion
- **`docs/design/SHAPE-LANGUAGE.md`, `docs/design/COLOR-LANGUAGE.md`, `docs/design/MATERIAL-LANGUAGE.md`** — adopted 2026-08-07; **standing user directive (2026-08-08): every touched surface adopts these immediately, folded into the PR that owns the surface.** Shape semantics: rounded rectangles = cards ONLY; circles = people; square corners = dense rows + Tier-5 info surfaces; chamfered polygon (4/8/12px, 45°, default top-left+bottom-right cuts) = default chrome; feature polygons budgeted ~one per region; pills deprecated for chrome. Color: salience hierarchy (card art > one focal action > live status > quiet chrome), compressed elevation, chroma reserved, gradients ambient-only — accessibility contrast untouchable. Material: Tier-5 tooltips (square, flat near-opaque dark, neutral 1px border w/ TL→BR lighting, white numerics), one premium CTA per screen. Shared primitives (Button, Dialog, etc.) migrate via dedicated tickets, NOT opportunistically inside feature PRs — per-PR adherence covers only elements the PR owns. clip-path implementation notes (two-layer borders, inset focus rings, rectangular hit areas) are in SHAPE-LANGUAGE.md §Implementation.
- `src/app/globals.css` — token source of truth; CLAUDE.md "Styling Rules (enforced)" — the 8 hard rules
- Mechanical gates (never a review lens, never a model's job to check): `pnpm lint:design-system`, `pnpm run check:contrast` (when tokens/pairs change), `npx tsc --noEmit`, `npm run lint`

## 1. Triage (replaces routing in kickoff §1)

For each ticket, the orchestrator answers one question: **would two reasonable implementations look or feel meaningfully different?**

**Design-lead track — Claude implements** (yes, or unclear):
- New UI surfaces, layout/composition changes, visual hierarchy work
- Motion/animation, transitions, visual effects (holofoil-class work)
- Empty states, onboarding, anything where the ticket describes intent, not pixels
- Any ticket whose acceptance criteria include words like "polish," "feels," "premium," "cohesive"

**Spec-execute track — Codex `gpt-5.6-sol`, low reasoning** (no — the visual outcome is fully determined):
- Token/class swaps, copy changes, prop plumbing, dead-code removal
- Applying an existing component pattern to a new location (pattern cited by file:line)
- Bugfixes with defined expected behavior; design-system normalization sweeps
- Dispatch flag: add `-c model_reasoning_effort="low"` to the `codex exec` invocation. Sol, not Terra — only Sol reliably completes commit/push/PR (memory: `.git` sandbox denial stops Terra).

Route on **design ambiguity, not size**. A one-line spacing change on the game board hero is design-lead; a 40-file mechanical token rename is spec-execute. When in doubt, design-lead. Present the routing table at kickoff for ratification.

**Escalation:** a spec-execute PR that fails VQA gets ONE findings loop with screenshot-annotated feedback. A second VQA failure escalates the ticket to design-lead — an Opus subagent takes over the branch with a Fable-authored diagnosis of why the Sol attempts failed (the technique-brief pattern). Never loop Sol on aesthetic judgment; low-reasoning Sol executes specs, it does not converge on taste.

## 2. Track mechanics

**Design-lead (Claude):**
- Implementation by an **Opus subagent** (`model: "opus"`, always — never Fable, and the orchestrator never implements) with `isolation: "worktree"`. Worktrees are fine here — the clone-not-worktree rule is a Codex-sandbox constraint only.
- **Fable cost discipline:** the Fable orchestrator does only planning, alignment, briefing, review, and VQA. Design judgment reaches implementation through the design brief, not through Fable writing code. Design-lead tickets get the same latitude-removing brief as spec-execute tickets — the difference is the implementer's ability to fill remaining gaps tastefully and the tighter feedback loop (SendMessage), not a thinner brief.
- Same deliverable spec as base: commit suffix `(OPT-NNN)`, push, `gh pr create` ready-for-review, before/after screenshots embedded in the PR body, no merge, no Linear writes by the subagent.
- Cross-family review is mandatory: Codex adversarial review (fresh read-only `codex exec` with the hunt brief below) reviews every Claude-authored PR. Same-family Claude review alone is insufficient — Claude reviewers share the implementer's blind spots.

**Spec-execute (Codex Sol low):**
- Claude first authors a **design brief** that removes all design latitude, embedded in the dispatch prompt: exact tokens/semantic roles, Tailwind spacing steps, radius values, type-scale sizes, the reference component by file:line, every interaction state enumerated (hover/focus-visible/active/disabled/loading/empty/error), chrome-vs-scaled-board context called out with the §13 floor values where applicable, an ASCII wireframe for any spatial change (§2b), and acceptance stated as observable criteria ("X is nameable from a static screenshot"), not vibes. Memory precedent: a PM-authored technique brief succeeded where two unaided Codex attempts failed.
- Standard brief boilerplate from memory: embed full ticket text + acceptance criteria verbatim; "Do NOT use Linear/MCP/network — missing external access is not grounds to withhold a verdict/stop work"; "deps are installed, do NOT run any install command; EPERM there is an environment artifact."
- Clone + dispatch mechanics unchanged from base skill.

## 2b. ASCII wireframes (use liberally for layout & information decisions)

Whenever a decision involves **spatial arrangement or information hierarchy** — what goes where, what's adjacent, what collapses at narrow widths, what's above the fold — draw it as an ASCII wireframe instead of (not in addition to) describing it in prose. Prose descriptions of layout are lossy in both directions: the user can't ratify what they can't see, and implementers fill spatial gaps with their own guesses. Default to drawing; skip only when the change has no spatial component (pure token/color/copy work).

Use them at every stage where layout is decided or communicated:

- **Kickoff/alignment:** when a ticket admits multiple layouts, present the candidates as wireframes via AskUserQuestion `preview` fields (monospace-rendered, side-by-side) so the user ratifies a picture, not a paragraph.
- **Design briefs (both tracks):** any brief touching layout embeds the target wireframe — annotated with region names, the spacing steps between regions, and responsive variants (one wireframe per breakpoint behavior that differs). For Sol this is load-bearing spec; for Opus it bounds the composition while leaving micro-decisions open.
- **VQA findings:** when the rendered result deviates spatially from the brief, show expected-vs-actual as paired wireframes in the findings message rather than describing the delta.
- **Handoff docs / PR bodies:** design-lead PRs with layout changes include the final wireframe next to the screenshots.

Conventions: box-drawing characters (`┌─┐│└┘`), region labels in caps, `~~~` for scrollable overflow, `[Button]` / `(input)` for controls, one wireframe per breakpoint variant, annotate gaps with the Tailwind step (`gap-4`, `p-6`). Keep each under ~30 rows; wireframes communicate structure, not fidelity — never try to render styling in ASCII.

## 3. VQA gate (every frontend PR, both tracks, before merge)

Run by the orchestrator with Chrome MCP against a local dev server (`pnpm dev`; may land on port 3001). Do not delegate VQA to Codex computer-use — the orchestrator's own eyes are the point of this skill.

1. Capture the touched surface at rest and in each interaction state the ticket affects. Pause/wait out animations (0.5–1.5s stabilization); re-hover after element appearance (pointerenter quirk — hover out then back in); cross-check pointer-driven CSS custom props via javascript_tool computed styles rather than trusting screenshots alone.
2. Judge against the design authorities: token discipline, hierarchy, brand tone (warm navy, not gloomy/neon), motion restraint (one animation per interaction), §13 floor inside `ScaledBoard`.
3. Interaction-state checklist: hover, focus-visible (keyboard tab-through), disabled, loading, empty, error, and reduced-motion where motion was touched.
4. Known access paths: `/admin` requires `isAdmin` (test accounts lack it) — use the deck-builder CardDetailModal as luffy@optcg.test for card-UI surfaces.

VQA findings go back through the track's findings loop (resume thread for Codex; SendMessage to the Opus subagent for design-lead — never fix it yourself). Cap and escalation per §1.

## 4. Adversarial hunt brief (frontend lens set)

Name these failure classes in every review dispatch; design-system rule compliance is deliberately absent (mechanical gates own it):

- **Blast radius**: shared component/token edits rippling into untouched surfaces — grep consumers of every edited component/prop/token and list them.
- **State completeness**: missing hover/focus/disabled/loading/empty/error states; state added in one theme context but not the other.
- **Context floor**: chrome-sized text/rings (`text-xs`/`ring-2`) rendered inside the scaled board subtree, or board-floor sizes leaking into chrome.
- **React correctness**: unstable keys, effect deps, server/client component boundary violations, hydration mismatch, JS style manipulation (banned by rule 6).
- **A11y**: contrast regressions on new fg/bg pairs (must be added to `scripts/contrast-pairs.json`), focus traps, missing keyboard paths.
- **Responsive**: fixed dimensions where fluid was required; overflow at narrow widths.

## 5. Merge gate (extends base §2.6)

CI green + mechanical gates pass + adversarial review approve + VQA pass + orchestrator diff review clean → `gh pr merge --squash --match-head-commit <reviewed-sha>`. For Claude-authored PRs the adversarial approve MUST be Codex (cross-family); for Codex-authored PRs the orchestrator's VQA + diff review is the cross-family check.

## Hard rules (delta from base)

- "Never author implementation code" is lifted ONLY for design-lead-track tickets ratified at kickoff; everything else in the base hard rules stands.
- No PR merges without a passing VQA capture recorded in the session report.
- Design decisions made during triage/briefing are logged in the kickoff table so escalations don't re-litigate them.
