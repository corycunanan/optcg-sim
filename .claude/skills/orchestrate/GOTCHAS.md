# Orchestrate — historical runtime gotchas

**Policy:** `docs/project/ORCHESTRATION-CHARTER.md` supersedes lifecycle, authority, sandbox and scheduling advice here. Entries describe past machines; verify current capabilities and never use these notes to bypass an approval denial.

Disclosed reference for `/orchestrate` and `/orchestrate-frontend`. Read the section the current step needs. Each entry is a rule that cost a retry or a bad merge; the date is when it was validated. This file, not project memory, is where a validated rule lives — memory holds run history only.

## Dispatch and sandbox

- Permission-rule matching is prefix-based: `codex exec` and `gh pr merge` commands must START with those words. Use `-C <clone>`, never a `cd && ` prefix (merge fails the allow rule with any prefix; `codex exec resume` tolerates a bare `cd <clone> && `).
- A CLI dispatch that omits `-m` or `-c model_reasoning_effort=...` silently inherits local configuration. Use charter §4's explicit role routing and verify supported efforts in the current runtime; historical model catalogs are not dispatch policy. Native full-history forks may likewise inherit the parent model: use a fresh bounded brief when selecting a different model. Preflight only the filesystem/network capabilities the assigned role needs.
- Adversarial reviews run with `--sandbox workspace-write` plus "do NOT modify tracked files; delete scratch files; prove `git status --porcelain` is empty". Under `--sandbox read-only` vitest cannot mkdir its temp dir, every suite dies with `EPERM … mkdir '…/ssr'`, and the reviewer returns no verdict (2026-07-25).
- Silence alone does not prove a worker is hung. Inspect process and working-tree progress before recovery; preserve partial work and follow charter §7 rather than automatically redispatching.
- **macOS tmp reaper deletes `/private/tmp` clone files untouched for ~3 days** (2026-09-03): it kills in-flight resumed sessions and destroys uncommitted work, and the harness reports it as a "killed" task. For runs spanning days push WIP daily; recover by rebuilding the clone from the origin branch and dispatching fresh — resume cannot recover a deleted working tree.
- A clone with `node_modules` measures ~2 GB (1.9 GB on 2026-09-06 with pnpm hardlinks). Check `df -h /private/tmp` in preflight; Codex crashes on ENOSPC leaving uncommitted work in the clone. Re-dispatch with "inventory `git diff` first, do not discard". Never `git restore` agent work (hook-enforced: `.claude/hooks/block-dangerous-git.sh`).
- If a git operation is denied, inspect and preserve completed work, then follow the current approval flow. Do not dispatch another process outside the sandbox to bypass the denial.
- Run `pnpm install --frozen-lockfile` in the clone BEFORE dispatch, then tell Codex "deps are installed, do NOT run any install command; EPERM there is an environment artifact". The sandbox refuses writes outside the workspace root (`~/.npm`, `~/Library/pnpm/store`), and Codex burns turns diagnosing it otherwise (2026-08-04).
- Environment for Codex validation: `CI=true` + `XDG_CACHE_HOME` + `COREPACK_HOME` (seed from `~/.cache/node/corepack`; an empty dir yields pnpm 11). Put both cache dirs OUTSIDE the clone (`/private/tmp/optcg-cache-<NNN>/{xdg,corepack}`): in-clone `.cache`/`.corepack` dirs are traversed by root ESLint and fail `pnpm lint` with "could not find plugin react-hooks" (2026-09-09). Postgres cannot start in-sandbox; host it outside.
- Sandboxed Codex has no network and no Linear: embed the full ticket text in the prompt and state that missing external access is not grounds to stop. A review task that tries its own Linear MCP and fails will refuse to issue a verdict (2026-08-04).
- Background Codex tasks cannot escalate permissions; never instruct them to (the classifier blocks the prompt too).
- Codex dispatch models now follow charter §4 (2026-10-21): Sol 6.1 implementation, Luna 6 bounded chores, Astra high-risk review. Use the skill's parameterized CLI example; historical quota-fallback recipes do not select today's model.

  In Codex follow-up sessions, `.git/index.lock` writes were denied 4 of 6 times (2026-09-15). The coordinator read the diff and committed on the implementer's behalf.

## Claude subagent implementers and review worktrees (2026-09-27, PRs #681–#685)

- Create one implementation worktree per ticket (`git worktree add -b <branch> <dir> origin/main`), then install deps in it before dispatch.
- Review worktrees are detached at the PR head and symlink deps from the implementation worktree:
  - root: `node_modules -> ../<impl>/node_modules`
  - worker: `workers/game/node_modules -> ../../../<impl>/workers/game/node_modules`

  With `../../` for the worker link, tests still pass but worker type-check fails with TS2688, and both reviewers reported type-check as `incomplete`.
- Agents must put scratch copies in a temp dir outside git, never in a new worktree. The guardrails hook blocks forced worktree removal, so a scratch worktree holding one untracked file cannot be cleaned up without the user.
- `rm -f $R/...` is blocked by the root-expansion safety check. Use literal paths or `"${R:?}"`.
- The guardrail regexes scan the whole command line, including heredoc bodies. A ` -- <path>` on a line that also contains `checkout` reads as a checkout-discard. Split such commands, and write any prose that mentions guarded commands with the Edit tool.
- In the main checkout (on a stale branch), `git diff A B <path>` needs the `--` when the path is absent from the working tree.
- Opus implementers stop at the fence edge and ask. Two stalls came from facet registration. A new cost or action type becomes a `cost:<type>` or `action:<type>` facet tag, which must be added to three files:
  - `shared/effect-facets.ts`
  - `pipeline/__snapshots__/effect-facets.test.ts.snap`
  - `docs/cards/EFFECT-FACET-TAXONOMY.md`

  Pre-approve those three files in the brief, and list `pnpm pipeline:sync-facets` as a post-merge user action.
- The Codex review lens needs the two Codex environment entries under "Dispatch and sandbox" pasted into its brief: the cache env vars and the no-network sentence. With `--sandbox workspace-write` it ran vitest probes, then restored tracked files and deleted its scratch copies on all five PRs.
- The GitHub integration moves the Linear issue to Done when its PR merges. Read the issue state before writing a status after a merge. A blind "In Review" write regressed OPT-827 and needed an audit note.
- The automated Codex GitHub reviewer (`chatgpt-codex-connector`) posts inline PR comments within minutes. Read `gh api repos/<o>/<r>/pulls/<n>/comments` in the final recheck and disposition each comment before merging. On #683 it raised a real (latent) P2.
- Hot-path feasibility code needs a scale test. OPT-798's upfront cost check eagerly enumerated C(28,20) states and ran out of heap, and its own mutation table could not see it. Whenever a brief touches enumeration, ask for a timing test with large zones (for example, 30 trash cards).

## Clones and base branches

- Clones made from the local repo inherit its stale `main`. Always `git fetch origin && git branch -f main origin/main` in the clone before any review diff; the non-forced form fails silently and reviews run against an ancient base.
- Other sessions merge to `main` mid-run. Re-sync before each dispatch and before final validation; check `git log origin/main` before blaming an agent for a green-local/red-CI mismatch.
- Stack dependent tickets only when explicitly enabled for the run; otherwise wait for prerequisite merges. Follow the charter for retargeting and renewed review.
- After pulls that change `prisma/schema.prisma`, run `npx prisma generate` or tsc reports phantom `prisma.<model>` errors and dev-server API routes 500.
- A `node_modules` symlink into a clone passes tsc/lint/vitest but breaks `next dev` (`Cannot find module '.prisma/client/default'`). For a VQA server do a real `pnpm install --prefer-offline` + `pnpm prisma generate` in the clone (2026-08-10).
- `rm -rf .next` before the first dev-server start in a clone and after any commit lands in a running clone — a stale dev cache produces MODULE_NOT_FOUND 500s on every route that look like an app regression (2026-08-04).

## Validation

- Root `npx tsc --noEmit` misses the worker: run it inside `workers/game` too. Schema lint: `node workers/game/src/engine/schemas/lint-schemas.sh <file>` (a node script despite the name). Worker vitest: `pnpm --dir workers/game exec vitest run src/...`.
- Use pnpm for all validation; the canonical lint baseline is measured under the pnpm-locked tree and npm totals differ.
- Baseline is green (schema lint 0 errors, worker tsc 0 errors). Never tell an agent to expect pre-existing lint errors — on a green baseline that invites it to dismiss its own violations as inherited.
- OPT-618 exposed a stale API route test missed by a scoped check (2026-08-09). Current validation follows charter §3/§4: focused local checks plus required CI for Small/Medium; local full gate plus CI for Large. Select affected consumers rather than imposing a full local suite on every push.
- Self-reported mutation matrices and coverage claims need independent evidence (`.claude/reference/evidence-ladder.md`). Verify decisive changed guards and claims; carry unaffected evidence with a delta assessment under charter §4/§6 instead of asking every role to repeat every mutation.
- A mutation-survival criterion unfairly flags positive "accepts X" tests, which cannot fail when a rejection guard is neutered; discount those rather than deleting them.
- Grep-based acceptance invites guard deletion: Sol removed a negative assertion to reach grep-zero (2026-08-10). For mechanical sweeps, pair-check `git diff -U0` (normalize minus-lines by the intended substitution, compare to plus-lines) and treat any impure hunk as a finding.
- Audit line numbers go stale when sibling tickets rewrite files. Briefs say locate-by-content; the orchestrator re-derives what an element IS before accepting a role change (OPT-641).
- Tell the implementer: "an accurate report of partial coverage is far more useful than an inaccurate claim of full coverage."
- VQA re-runs after every fix loop: a one-token fix passed tsc/lint/tests and would have merged a broken layout. Class-string tests cannot see geometry.

## Review and merge

- Review-budget behavior follows charter §5: consolidate failure families and change the approach at a design checkpoint. A new PR or diagnostic label does not reset cumulative work. Missing authored examples alone do not refute supported-state defects; preserve independent reachability evidence.
- The spec-pass fork and the Codex adversarial reviewer run concurrently, so the fork never edits the ticket clone. For mutation runs it clones the clone and symlinks both `node_modules` dirs (root and `workers/game`), runs vitest there, then removes the copy. A fork's revert-and-restore inside the reviewer's window left a spurious `M` in the shared tree (2026-09-09).
- Triage findings by reachability and root cause before looping them back. Reviewers have returned real MAJORs rooted in pre-existing `main` behavior unreachable through any authored card (OPT-613); a review can also disprove the ticket's premise (OPT-638) — then land the salvageable part and correct the ticket.
- Always resolve the full 40-char head SHA for `--match-head-commit` via `gh pr view --json headRefOid`; a short SHA fails with a GraphQL coercion error.
- A PR whose `ci` check never appears is almost certainly CONFLICTING — GitHub cannot build the test-merge commit, so `pull_request` workflows never trigger. Check `gh pr view --json mergeable,mergeStateStatus` before suspecting slow CI. After merging any PR that touches a shared file (handoff docs collide constantly), re-check every open sibling PR.
- Codex has converted its own PR to draft; check `isDraft` at the merge gate and `gh pr ready <N>` if needed.
- Missing CI events require investigation of the exact head and workflow trigger. Prefer rerunning an eligible workflow; any retrigger that changes the head requires a renewed receipt and required checks. Post-merge CI never substitutes for missing required pre-merge checks.
- The GitHub token lacks `workflow` scope: pushes touching `.github/workflows/` fail. Chain CI-adjacent checks onto scripts CI already runs (e.g. `lint`).
- Merging to `main` auto-runs `prisma migrate deploy` against PROD via the Vercel build and auto-deploys Cloudflare workers. `vercel ls` (CLI 52) hangs non-interactively — check the prod deploy via `gh api repos/<owner>/<repo>/commits/<sha>/status`. A failed prod migration (P3009) blocks all deploys until `prisma migrate resolve --rolled-back` + re-apply.

## Environments and data

- No `.env` on this machine; DB URLs come from `vercel env pull --environment=preview`. Preview = dev Neon branch `ep-aged-base-a45y6qrm`; prod = `ep-square-shadow-a4grhgiu`. The Vercel *development* env has no auth keys, so a pull clobbers a hand-maintained `.env.local` — rebuild by appending from `.env.preview`/`.env.production`.
- The dev Neon branch doubles as the shared Vercel Preview DB: a failed migration there blocks everyone's previews (P3009).
- The classifier blocks compound rm+clone+codex one-liners and any prod-DB write even with in-chat authorization; the user runs those via `! <command>`. Read-only prod SELECTs are allowed. Copying `.env*` into a clone was blocked once (2026-08-09) and allowed once (2026-08-10); when blocked, VQA from a `review/optNNN` branch in the main checkout instead (env stays in place; restore the user's branch at close-out).
- Previews have no Google OAuth; sign in with seed accounts (`luffy@optcg.test` etc., `prisma/seed.ts`). Per-deployment domains have separate cookies; VQA against the stable per-branch alias `optcg-sim-git-<branch-hash>`. Localhost cookies ignore ports — an existing dev session carries into clone servers on other ports.
- `/admin` requires `isAdmin` (seed accounts lack it) — use the deck-builder CardDetailModal as luffy@optcg.test for card-UI surfaces. Game-board VQA without a game server: `/sandbox/<scenarioId>` renders the real board with fixture cards.
- Chrome MCP: viewport is emulated at 1209×756 CSS px and `resize_window` is silently ignored, so sub-1280 media queries are unverifiable locally — say so in the report. An element appearing under a stationary cursor gets no `pointerenter` (hover out then back in). An unfocused automation window freezes CSS animations, so closed Radix dialogs stay mounted: judge open/closed by `data-state`, never by node presence (2026-08-07).
- Chrome MCP shares one page cursor across all clients: never drive the browser concurrently with a subagent doing VQA.
- Codex computer-use in headless sessions needs the computer-use plugin and MCP server enabled in `~/.codex/config.toml` plus a Chrome approval seeded from an interactive `codex` terminal; desktop-app approvals do not propagate (2026-07-15).

## Linear

- Second-PR links can flip Done → In Progress; re-verify every issue at close-out.
- Queue discipline: only the in-flight wave sits In Progress; every other ratified issue is Todo.
