---
name: reflect
description: Mine the current session for durable learnings and route each to a structural home — a hook, lint, script, skill edit, or (last resort) a memory file. Use after a multi-PR orchestration run, after a user correction, or when the user says reflect.
disable-model-invocation: true
argument-hint: "[optional focus, e.g. 'the OPT-740 findings loop']"
---

# Reflect

Single-agent adaptation of pstack `reflect`: no reviewer fan-out, no synthesizer subagent. You already hold the transcript; the work is judgment and routing, and one pass at the end of a run costs less than one findings loop.

## 1. Harvest

Scan this session (narrowed by `$ARGUMENTS` if given) for:

- corrections the user made to your approach
- dead ends followed by the path that worked
- tool, sandbox, CLI, or MCP quirks that cost a retry
- a rule you typed into a prompt for the second time
- a validation claim that turned out false

Skip one-offs, typos, and anything the skill you followed already states clearly.

## 2. Filter — every candidate passes all of these

- **Durable:** still true in six months once SHAs, paths, and versions drift. Keep the rule, drop the instance.
- **Decision-changing:** a future agent does something different, not just reads more text.
- **Skill-was-used:** it routes to a skill, hook, script, or workflow this session actually invoked, or to a skill that should have triggered and didn't (`tune description`).
- **Not already covered:** read the target before proposing. If the guidance exists but was skipped, the fix is placement or wording, not a duplicate bullet.

## 3. Route — strongest rung first

Textual instructions need the reader to notice, remember, and comply; mechanisms don't. For each accepted learning pick the strongest home that fits:

1. **Unrepresentable** — a type or schema that makes the mistake impossible.
2. **Mechanical gate** — a lint rule, `scripts/*.mjs` check chained into `lint`, a `check-doc-drift`-style script, or a PreToolUse hook in `.claude/hooks/`.
3. **Workflow code** — a prompt clause or schema field in `.claude/workflows/*.js`.
4. **Skill edit** — a line in the owning `SKILL.md` or its disclosed reference (`.claude/skills/orchestrate/GOTCHAS.md`, `.claude/reference/*.md`), following `writing-for-agents`.
5. **Memory** — only for facts about the user, the machine, or external systems that no file in the repo can enforce. A memory that merely restates a skill is sediment; a memory whose rule could be a hook is a backlog item for rung 2.

If a recurring correction is already in memory prose, that is the signal to move it up a rung, not to append another paragraph.

## 4. Present, then wait

One table, one row per learning:

| # | Learning (one sentence) | Evidence (moment in this session) | Proposed home | Rung |
|---|---|---|---|---|

Below it: **Rejected** (learning + reason: durability / decision-changing / skill-not-used / already-covered) and **Backlog** (mechanisms worth a Linear ticket rather than a same-session edit). Stop and wait for the user to pick rows. Skill and hook edits change every future run; never auto-apply.

## 5. Apply

Approved rows only. Skill edits follow `writing-for-agents` (positive phrasing, leading words, single source of truth, disclose bulk behind a pointer). Hooks get a smoke test like `.claude/hooks/block-dangerous-git.sh`'s. Backlog rows become Linear issues labelled `Tech Debt` with the mechanism named in the body. Close with one line per applied edit, file path first.
