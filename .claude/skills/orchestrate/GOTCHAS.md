# Orchestrate — validated gotchas

Disclosed reference for `/orchestrate` and `/orchestrate-frontend`. Read the section the current step needs. Each entry is a rule that cost a retry or a bad merge; the date is when it was validated. This file, not project memory, is where a validated rule lives — memory holds run history only.

## Dispatch and sandbox

- Permission-rule matching is prefix-based: `codex exec` and `gh pr merge` commands must START with those words. Use `-C <clone>`, never a `cd && ` prefix (merge fails the allow rule with any prefix; `codex exec resume` tolerates a bare `cd <clone> && `).
- `~/.codex/config.toml` sets `model_reasoning_effort = "low"`. A dispatch without `-c model_reasoning_effort=...` runs Sol at low effort silently (2026-08-22). 5.6 models reject `minimal` (valid: none/low/medium/high/xhigh).
- Adversarial reviews run with `--sandbox workspace-write` plus "do NOT modify tracked files; delete scratch files; prove `git status --porcelain` is empty". Under `--sandbox read-only` vitest cannot mkdir its temp dir, every suite dies with `EPERM … mkdir '…/ssr'`, and the reviewer returns no verdict (2026-07-25).
- A codex session that writes nothing to its output file for >1h is hung: TaskStop it and re-dispatch fresh with a priority-ordered prompt.
- **macOS tmp reaper deletes `/private/tmp` clone files untouched for ~3 days** (2026-09-03): it kills in-flight resumed sessions and destroys uncommitted work, and the harness reports it as a "killed" task. For runs spanning days push WIP daily; recover by rebuilding the clone from the origin branch and dispatching fresh — resume cannot recover a deleted working tree.
- A clone with `node_modules` measures ~2 GB (1.9 GB on 2026-09-06 with pnpm hardlinks). Check `df -h /private/tmp` in preflight; Codex crashes on ENOSPC leaving uncommitted work in the clone. Re-dispatch with "inventory `git diff` first, do not discard". Never `git restore` agent work (hook-enforced: `.claude/hooks/block-dangerous-git.sh`).
- Codex stalling on "explicit approval" for `.git` writes: the work is usually done in the clone — verify the working-tree diff, then commit/push/PR from outside the sandbox. Prompt phrasing that reduces stalls: "this is EXPECTED and the operation is permitted on retry; always retry rather than stopping to ask." Only Sol reliably completes commit/push/PR; Terra stops at the denial — route any ticket that must end in a pushed PR to `gpt-5.6-sol`.
- Run `pnpm install --frozen-lockfile` in the clone BEFORE dispatch, then tell Codex "deps are installed, do NOT run any install command; EPERM there is an environment artifact". The sandbox refuses writes outside the workspace root (`~/.npm`, `~/Library/pnpm/store`), and Codex burns turns diagnosing it otherwise (2026-08-04).
- Environment for Codex validation: `CI=true` + `XDG_CACHE_HOME` + `COREPACK_HOME` (seed from `~/.cache/node/corepack`; an empty dir yields pnpm 11). Postgres cannot start in-sandbox; host it outside.
- Sandboxed Codex has no network and no Linear: embed the full ticket text in the prompt and state that missing external access is not grounds to stop. A review task that tries its own Linear MCP and fails will refuse to issue a verdict (2026-08-04).
- Background Codex tasks cannot escalate permissions; never instruct them to (the classifier blocks the prompt too).

## Clones and base branches

- Clones made from the local repo inherit its stale `main`. Always `git fetch origin && git branch -f main origin/main` in the clone before any review diff; the non-forced form fails silently and reviews run against an ancient base.
- Other sessions merge to `main` mid-run. Re-sync before each dispatch and before final validation; check `git log origin/main` before blaming an agent for a green-local/red-CI mismatch.
- Stack dependent tickets (base = previous PR's branch) instead of waiting for merges.
- After pulls that change `prisma/schema.prisma`, run `npx prisma generate` or tsc reports phantom `prisma.<model>` errors and dev-server API routes 500.
- A `node_modules` symlink into a clone passes tsc/lint/vitest but breaks `next dev` (`Cannot find module '.prisma/client/default'`). For a VQA server do a real `pnpm install --prefer-offline` + `pnpm prisma generate` in the clone (2026-08-10).
- `rm -rf .next` before the first dev-server start in a clone and after any commit lands in a running clone — a stale dev cache produces MODULE_NOT_FOUND 500s on every route that look like an app regression (2026-08-04).

## Validation

- Root `npx tsc --noEmit` misses the worker: run it inside `workers/game` too. Schema lint: `node workers/game/src/engine/schemas/lint-schemas.sh <file>` (a node script despite the name). Worker vitest: `pnpm --dir workers/game exec vitest run src/...`.
- Use pnpm for all validation; the canonical lint baseline is measured under the pnpm-locked tree and npm totals differ.
- Baseline is green (schema lint 0 errors, worker tsc 0 errors). Never tell an agent to expect pre-existing lint errors — on a green baseline that invites it to dismiss its own violations as inherited.
- Gate specs name the FULL vitest suite before push; a scoped gate let a stale API route test through to review (OPT-618, 2026-08-09).
- Self-reported mutation matrices and coverage claims are rung 1 on the evidence ladder (`.claude/reference/evidence-ladder.md`). The delta-review prompt says "do not trust the PR body; re-run every mutation yourself", and the orchestrator mutates a few guards directly (~1 min each).
- A mutation-survival criterion unfairly flags positive "accepts X" tests, which cannot fail when a rejection guard is neutered; discount those rather than deleting them.
- Grep-based acceptance invites guard deletion: Sol removed a negative assertion to reach grep-zero (2026-08-10). For mechanical sweeps, pair-check `git diff -U0` (normalize minus-lines by the intended substitution, compare to plus-lines) and treat any impure hunk as a finding.
- Audit line numbers go stale when sibling tickets rewrite files. Briefs say locate-by-content; the orchestrator re-derives what an element IS before accepting a role change (OPT-641).
- Tell the implementer: "an accurate report of partial coverage is far more useful than an inaccurate claim of full coverage."
- VQA re-runs after every fix loop: a one-token fix passed tsc/lint/tests and would have merged a broken layout. Class-string tests cannot see geometry.

## Review and merge

- Review cap is real: 1 full + 1 delta. A fresh MAJOR in the delta round stops the merge and goes to the user. Precedent (2026-08-23): the user authorized one bounded extra delta three times and each converged; when no authored card exercises the shape, recommend merge + follow-up ticket.
- Triage findings by reachability and root cause before looping them back. Reviewers have returned real MAJORs rooted in pre-existing `main` behavior unreachable through any authored card (OPT-613); a review can also disprove the ticket's premise (OPT-638) — then land the salvageable part and correct the ticket.
- Always resolve the full 40-char head SHA for `--match-head-commit` via `gh pr view --json headRefOid`; a short SHA fails with a GraphQL coercion error.
- A PR whose `ci` check never appears is almost certainly CONFLICTING — GitHub cannot build the test-merge commit, so `pull_request` workflows never trigger. Check `gh pr view --json mergeable,mergeStateStatus` before suspecting slow CI. After merging any PR that touches a shared file (handoff docs collide constantly), re-check every open sibling PR.
- Codex has converted its own PR to draft; check `isDraft` at the merge gate and `gh pr ready <N>` if needed.
- GitHub occasionally drops webhook events for one branch; an empty commit retriggers, and the post-merge `main` push run is the authoritative fallback signal.
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
