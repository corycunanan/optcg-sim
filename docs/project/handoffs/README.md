# Project Handoffs — archive

**This folder is a read-only archive. Do not add or edit files here.**

From April to October 2026, agents wrote a handoff doc per Linear project (an Action Plan table plus per-ticket handoff entries), and later per-ticket notes and run ledgers. The Action Plan tables duplicated Linear and went stale within days, and handoff commits re-triggered review and caused merge conflicts between parallel PRs. As of 2026-11-03 the practice is retired.

## Where this lives now

| Need | Home |
| --- | --- |
| Execution order and status | Linear: roll-up parent issues for PR boundaries, `blockedBy` for order |
| What the next agent should know | The **Handoff** section of the PR body; the coordinator copies points a later ticket needs into a comment on that Linear issue or its parent |
| Follow-ups | PR body **Follow-ups**, then Linear tickets |
| Run checkpoint and readiness receipt | A local scratch file during the run; the receipt is posted as a PR comment |
| Lessons that outlive one ticket | `.claude/skills/orchestrate/GOTCHAS.md`, `CLAUDE.md`/`AGENTS.md`, or the engine docs |

See `docs/project/ORCHESTRATION-CHARTER.md` §2 and §4 and the `ticket` skill.

## Using the archive

Engine docs (`docs/game-engine/`, schema README, fixture READMEs) link to several files here: inventories, stage contracts, rules handoffs. Those links stay valid, so the files stay in place. Treat everything here as historical evidence: reverify claims against current code before relying on them. Action Plan statuses in these files are frozen and not authoritative.
