---
name: grill
description: Relentless interview that sharpens a plan, ticket, or design decision before any implementation — maps the decision tree, asks the whole frontier each round with a recommended answer, looks facts up itself. Use before /investigate or /triage-feedback on ambiguous scope, or when the user says grill.
argument-hint: "[plan, ticket ID, or decision to sharpen]"
---

# Grill

Interview the user until you share one understanding. Adapted from mattpocock/skills `grilling`. The output is a settled decision tree the next skill (`/investigate`, `/triage-feedback`, `/orchestrate-frontend` briefing) can execute without guessing.

## Why this exists here

Review rounds are the most expensive place to discover a misread requirement: a PR that encodes a guess costs a Codex implementation plus an adversarial review plus a findings loop. A grilling round costs one chat exchange. Memory precedent: five answered VQA decisions reversed at once when the mockup finally arrived; a nav ticket rested on a wrong premise that would have stripped the only CTA.

## Process

1. **Anchor.** If `$ARGUMENTS` is an `OPT-NNN`, fetch the issue; if a path, read it; otherwise take the text as the plan. Ask for the design artifact (mockup, screenshot, spec) up front when one plausibly exists — tickets describe diffs, artifacts describe the target.
2. **Map the tree.** Every decision branches into the decisions that hang off it. The **frontier** is every decision whose prerequisites are already settled.
3. **Ask the whole frontier in one round.** Number each question, give your recommended answer. A question whose answer depends on another open question in the same round belongs to a later round.
4. **Facts are your job; decisions are the user's.** When a question needs a fact from the repo, design docs, Linear, or the running app, get it (Explore agent, grep, browser) — do not ask the user for anything you can look up. Questions downstream of a pending lookup wait; ask the rest now.
5. **Recompute and repeat.** Answers settle decisions and push the frontier outward. Stop when the frontier is empty: nothing left silently assumed.
6. **Confirm.** Restate the settled tree in one block and get a yes before any skill acts on it.

## Round format

```
❓ **Q1 — <title>**: <question; include the concrete options when there are some>
➡️ <your recommended answer and the one-line reason>

---

❓ **Q2 — <title>**: …
➡️ …
```

## Hand-off

- Ticket-shaped outcome → `/triage-feedback` or `/investigate` with the settled tree pasted in; the ticket gets the `Ready for agent` label only once every acceptance criterion is determinate.
- Design-shaped outcome → the `/orchestrate-frontend` design brief, with the ASCII wireframe the user ratified.
