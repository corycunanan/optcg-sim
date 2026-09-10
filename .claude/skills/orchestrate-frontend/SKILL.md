---
name: orchestrate-frontend
description: Coordinate Linear frontend/UI issues under the track orchestration charter, adding design briefs, interaction checks and live visual verification.
argument-hint: "OPT-501 OPT-502 [allow merges for this run]"
---

# Frontend track supplement

Read `.claude/skills/orchestrate/SKILL.md` and execute `docs/project/ORCHESTRATION-CHARTER.md`. This supplement adds design work; it does not change merge authorization, roles, dependency scheduling or review gates. Merge permission defaults off for all authors and requires the same explicit run-scoped grant.

## Resolve design uncertainty

For each ticket ask whether two reasonable implementations could look or behave materially differently. If so, gather the missing product decision, inspect current patterns, and produce a concrete design brief before dispatch. Continue independent determinate tickets while a design decision is pending. Read current AGENTS.md and `docs/design/BRANDING-GUIDELINES.md`; follow their live typography, tokens, shapes and scaled-board rules rather than copying historical values.

A brief states:

- Existing reference components and behavior to preserve.
- Layout and information hierarchy; use a small wireframe when it clarifies spatial decisions.
- Semantic tokens, responsive behavior and whether content lives inside the scaled board.
- Relevant loading, empty, error, disabled, hover, focus, keyboard and interaction states.
- Observable acceptance criteria and before/after verification plan.

Delegate to an implementer suited to the remaining design judgment. Do not mandate historical model/provider choices. The coordinator reviews implementation against the brief and actual app; independent review remains required.

## Live verification

Read `docs/project/PREVIEW-VQA-RUNBOOK.md` when using previews. Verify the actual branch/commit and environment before capture. Coordinate shared browser sessions and databases so parallel agents cannot overwrite each other's state.

Exercise the changed flow at representative desktop and narrow viewports. Inspect hierarchy, overflow, keyboard/focus, touch targets and the scaled-board legibility floor where relevant. Record screenshots and interaction results for the reviewed candidate. A screenshot alone does not prove interactions; class-string tests do not prove geometry. For game prompts verify legal choices, cancellation/decline where applicable, stale response handling and player-specific visibility.

After each visual/interaction correction, repeat affected live checks. Missing browser access or inaccessible changed states are verification gaps, not passing VQA. Add these results to the charter readiness receipt. Every required VQA and mechanical check must pass before a permitted merge.
