---
name: triage-feedback
description: Intake raw frontend/VQA feedback (word vomit), split it into atomic items, verify each premise against source, dedupe against Linear, classify severity + design-ambiguity routing, then create orchestratable Linear tickets after a user decision pass.
disable-model-invocation: true
argument-hint: "[pasted feedback | path to feedback file]"
---

# Triage Frontend Feedback → Linear

Turn a raw feedback dump into verified, deduplicated, orchestration-ready Linear tickets. The pipeline exists because past rounds failed in specific ways: tickets created from wrong premises, ambiguous items blocking orchestration mid-run, duplicates forking work, and vague tickets giving spec-execute implementers latitude they shouldn't have. Every phase below closes one of those holes. **Never create a ticket before the decision pass in Phase 5.**

## Intake

`$ARGUMENTS` may be inline feedback text or a path to a feedback file. If empty, ask the user to paste the feedback and stop until they do.

Split the dump into **atomic items**: one independently shippable, independently verifiable change per item. Splitting rules:
- A compound bullet splits when its parts touch different components or could merge in different PRs.
- Parts stay together when the same component owns both and one PR would naturally ship both (they become separate acceptance criteria on one ticket).
- Preserve the user's exact wording in a "Raw feedback" quote on each item — paraphrase drift is how premises get invented.

## Phase 1 — Premise verification (source of truth, not memory)

For each item, before any classification:

1. **Locate the surface.** Find the actual component file(s), token(s), and line(s) the feedback is about. Use parallel Explore agents when the batch is large; targeted grep/read when it's small.
2. **Verify the claimed current state.** The feedback says X currently looks/behaves some way — confirm that against the code (classes, tokens, conditional logic). Do not trust the description; do not trust your memory of the UI. If code inspection is inconclusive for a visual claim, verify in the browser or with a screenshot before marking it confirmed.
3. **Check against adopted design language.** Read the relevant sections of `docs/design/BRANDING-GUIDELINES.md`, `docs/design/SHAPE-LANGUAGE.md`, `docs/design/COLOR-LANGUAGE.md`, `docs/design/MATERIAL-LANGUAGE.md`, `docs/design/TYPOGRAPHY.md`, and the CLAUDE.md styling rules. A feedback item that contradicts an adopted doc is not automatically wrong — but it needs an explicit user decision and, if accepted, the ticket must include the doc amendment in scope.
4. **Assign a premise verdict:**
   - ✅ **Confirmed** — current state is as described; requested change is well-defined and consistent with (or silent in) the design docs.
   - ⚠️ **Premise wrong** — current state differs from the description. State what is actually true, with `file:line`. The item may still be actionable in amended form; propose the amendment.
   - ❓ **Ambiguous** — the request has more than one reasonable reading, conflicts with an adopted doc, or depends on a decision only the user can make. Write the specific question. When a batch carries more than a handful of ❓ items, or the items branch (one answer changes the next question), run `/grill` on the batch instead of a flat question list — it works the decision tree frontier by frontier and looks facts up itself. **Ambiguous items block ticket creation until answered** — an orchestration run cannot resolve them (learned the hard way; see `vqa-triage-tickets-need-decision-pass`).

Accessibility is a hard floor: if a requested color/contrast change would break WCAG AA or an existing `check:contrast` pair, flag it as ❓ with the measured ratio — and remember the contrast gate only tests pairs listed in `scripts/contrast-pairs.json`, so "CI passes" proves nothing for new pairings. New foreground/background pairs introduced by a ticket must add themselves to that file (put it in the acceptance criteria).

## Phase 2 — Dedupe against Linear

Search open Linear issues (unstarted, backlog, started) for each item's surface and intent using the connected Linear MCP tools. Mark each item:
- **New** — no overlap.
- **Duplicate of OPT-XXX** — same change already tracked; do not create, optionally comment on the existing issue with the fresh report.
- **Related to OPT-XXX** — same surface, different change; link it in the new ticket body.

## Phase 3 — Classification

Two independent axes per item:

**Severity:** 🔴 wrong/broken (violates spec, design language, or accessibility) · 🟡 polish (correct but below the quality bar) · ⚪ nice-to-have.

**Routing** (feeds `/orchestrate-frontend`): answer *"would two reasonable implementations look or feel meaningfully different?"*
- **spec-execute** — no: the feedback plus verified pointers fully determine the diff (token swap, class change, moving an existing element).
- **design-lead** — yes or unclear: layout/composition, motion, new visual treatment, anything described as intent rather than pixels.
- When in doubt, design-lead. Route on ambiguity, not size.

## Phase 4 — Draft tickets

One draft per surviving item (✅, or ⚠️/❓ after amendment/answer). Latitude-removing enough for a low-reasoning spec-execute implementer:

- **Title:** imperative, surface-first, ≤ 80 chars (matches existing OPT style, e.g. "Card modal header: badge row under the name").
- **Body template:**
  - **Raw feedback** — the user's original words, quoted.
  - **Current state (verified)** — what the code does today, with `file:line` pointers.
  - **Desired state** — the concrete change: exact classes/tokens where determinable; intent + constraints where design-lead.
  - **Acceptance criteria** — checkboxes, each independently checkable; include design-system gates when relevant (`pnpm lint:design-system`, `check:contrast` pair additions).
  - **Pointers** — files to touch, related components that already do it right, relevant design-doc sections cited by name and section.
  - **Routing** — `spec-execute` or `design-lead`, one line of why.
- Cite design-language docs in the body so orchestration briefs inherit them for free.

## Phase 5 — Decision pass (gate)

Present a single table: item # · surface · premise verdict · severity · routing · dedupe status · proposed title. Below it, list every ❓ question and every ⚠️ amendment needing sign-off. Ask the user in one message:
1. Answers to the ❓ items (these are their decisions, not yours).
2. Approval/edits of the ⚠️ amendments.
3. Target Linear project (list candidate projects; default to the current VQA/polish project if one is active).
4. Go/no-go on ticket creation.

Do not proceed past this gate on silence.

## Phase 6 — Create tickets

After approval: create the approved issues in the chosen project via the Linear MCP tools, applying the standard domain labels the team already uses (check existing issues in the project — typically "Design", "Improvement", "Bug") plus two workflow labels: the routing label (`Spec-execute` or `Design-lead`, from Phase 3) and `Ready for agent`. `Ready for agent` goes only on tickets whose every checkbox is determinate after the decision pass — `/orchestrate` gates dispatch on it, so a ticket without it is a ticket that will wait for a human. Fold ❓ answers into the ticket bodies as decided. For duplicates, add a comment to the existing issue instead if the user opted in. Finish by reporting the created ticket IDs with one-line summaries, and note the batch is ready for `/orchestrate-frontend`.
