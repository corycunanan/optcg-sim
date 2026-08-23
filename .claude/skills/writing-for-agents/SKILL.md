---
name: writing-for-agents
description: Standard for any document an agent consumes — a SKILL.md, CLAUDE.md, a hunt brief, a dispatch prompt, a reference file. Use when creating or editing a skill, a workflow prompt, or CLAUDE.md.
---

# Writing for agents

Condensed from mattpocock/skills `writing-for-agents`. The packaging differs (skill, CLAUDE.md, dispatch prompt); the writing does not.

## Context pointers

A pointer is any always-loaded line that names out-of-context material: a skill `description`, a CLAUDE.md line, a "see GOTCHAS.md" sentence. Its **wording** decides whether the material is reached. Front-load the triggering word; list one trigger per distinct branch; cut identity the body already carries. Every always-loaded word costs on every turn, so prune pointers harder than bodies.

## Two loads

- **Context load** — always-loaded material (descriptions, CLAUDE.md). Spent whether or not it fires.
- **Cognitive load** — the human remembering what exists. Fine to spend where human judgment matters.

Model-invoked skills (with a `description`) spend context load for discoverability. User-invoked skills (`disable-model-invocation: true`) spend cognitive load and cost nothing per turn. Pick model-invocation only when the agent or another skill must reach it on its own. Shared reference that several skills need lives in a plain file (`.claude/reference/`, a skill-adjacent `*.md`) that each skill points at — not restated in each.

## Information hierarchy

1. **In-file steps** — what the agent does, in order.
2. **In-file reference** — rules consulted on demand; a flat list is fine.
3. **Disclosed reference** — a separate file behind a pointer, loaded only by the branch that needs it.

Inline what every branch needs; disclose what only some branches reach. Keep a concept's definition, rule, and caveat under one heading. **Sprawl** (long but every line live) is still a failure: attention thins. Cure by disclosing and splitting by branch.

## Completion criteria

End every step on a checkable, exhaustive bound ("every modified handler accounted for", "`git status --porcelain` empty"), not a vague one ("understanding reached"). A sharp bound resists the pull of the visible next step.

## Leading words

One pretrained token that carries a region of behaviour (*red*, *tight*, *relentless*, *tracer bullet*) beats a sentence that restates it. Reuse the same word in prompts, docs, and code so the agent links them. Phrase the **positive** target; a prohibition activates the thing it bans and half-reads as an instruction. Keep prohibitions only as hard guardrails, paired with the positive.

## Pruning

- One source of truth per meaning; a restatement inflates its rank and goes stale.
- The environment (`package.json` scripts, `--help`, directory layout) is a source of truth; a doc line that copies it is a cache — keep only what the agent cannot look up (the unwritten convention, the reason, the gotcha).
- Test every sentence: does it change behaviour versus the default? If not, delete the sentence whole.
- Sediment — stale layers kept because removing feels risky — is the default fate. When a memory or skill grows by appended "additions", restructure it.

## Skill mechanics (this repo)

- Frontmatter: `name`, `description` (model-facing triggers, or a one-line human summary when `disable-model-invocation: true`), optional `argument-hint`, `allowed-tools`.
- Disclosed reference sits beside the skill (`.claude/skills/<name>/*.md`) or in `.claude/reference/` when several skills share it.
- Workflow scripts in `.claude/workflows/*.js` are agent documents too: the prompt strings follow these rules, and shared clauses live in one `const`.
