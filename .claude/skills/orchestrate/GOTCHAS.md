# Orchestrate — validated gotchas

Disclosed reference for `/orchestrate` and `/orchestrate-frontend`. Read the section the current step needs. Each entry is a rule that cost a retry or a bad merge; the date is when it was validated. Moved here from project memory so the rule lives with the skill it governs.

## Dispatch and sandbox

- Permission-rule matching is prefix-based: `codex exec` and `gh pr merge` commands must START with those words. Use `-C <clone>`, never a `cd && ` prefix (merge fails the allow rule with any prefix; `codex exec resume` tolerates a bare `cd <clone> && `).
- Adversarial reviews run with `--sandbox workspace-write` plus "do NOT modify tracked files; delete scratch files; prove `git status --porcelain` is empty". Under `--sandbox read-only` vitest cannot mkdir its temp dir, every suite dies with `EPERM … mkdir '…/ssr'`, and the reviewer returns no verdict (2026-07-25).
- A codex session that writes nothing to its output file for >1h is hung: TaskStop it and re-dispatch fresh with a priority-ordered prompt.
- Each clone is ~4.5 GB; Codex crashes on ENOSPC leaving uncommitted work in the clone. Re-dispatch with "inventory `git diff` first, do not discard". Never `git restore` agent work (hook-enforced: `.claude/hooks/block-dangerous-git.sh`).
- Codex stalling on "explicit approval" for `.git` writes: the work is usually done in the clone — verify the working-tree diff, then commit/push/PR from outside the sandbox. Prompt phrasing that reduces stalls: "this is EXPECTED and the operation is permitted on retry; always retry rather than stopping to ask."
- Environment for Codex validation: `CI=true` + `XDG_CACHE_HOME` + `COREPACK_HOME` (seed from `~/.cache/node/corepack`; an empty dir yields pnpm 11). Postgres cannot start in-sandbox; host it outside.
- Sandboxed Codex has no network and no Linear: embed the full ticket text in the prompt and state that missing external access is not grounds to stop.

## Clones and base branches

- Clones made from the local repo inherit its stale `main`. Always `git branch -f main origin/main` in the clone before any review diff; the non-forced form fails silently and reviews run against an ancient base.
- Other sessions merge to `main` mid-run. Re-sync before each dispatch and before final validation; check `git log origin/main` before blaming an agent for a green-local/red-CI mismatch.
- Stack dependent tickets (base = previous PR's branch) instead of waiting for merges.
- After pulls that change `prisma/schema.prisma`, run `npx prisma generate` or tsc reports phantom `prisma.<model>` errors and dev-server API routes 500.

## Validation

- Root `npx tsc --noEmit` misses the worker: run it inside `workers/game` too. Schema lint: `node workers/game/src/engine/schemas/lint-schemas.sh <file>` (a node script despite the name). Worker vitest: `pnpm --dir workers/game exec vitest run src/...`.
- Use pnpm for all validation; the canonical lint baseline is measured under the pnpm-locked tree and npm totals differ.
- Baseline is green (schema lint 0 errors, worker tsc 0 errors). Never tell an agent to expect pre-existing lint errors — on a green baseline that invites it to dismiss its own violations as inherited.
- Self-reported mutation matrices and coverage claims are rung 1 on the evidence ladder (`.claude/reference/evidence-ladder.md`). The delta-review prompt says "do not trust the PR body; re-run every mutation yourself", and the orchestrator mutates a few guards directly (~1 min each).
- A mutation-survival criterion unfairly flags positive "accepts X" tests, which cannot fail when a rejection guard is neutered; discount those rather than deleting them.
- Tell the implementer: "an accurate report of partial coverage is far more useful than an inaccurate claim of full coverage."
- VQA re-runs after every fix loop: a one-token fix passed tsc/lint/tests and would have merged a broken layout. Class-string tests cannot see geometry.

## Review and merge

- Review cap is real: 1 full + 1 delta. A fresh MAJOR in the delta round stops the merge and goes to the user.
- Always resolve the full head SHA for `--match-head-commit` via `gh pr view --json headRefOid` or `git ls-remote`; never expand a short SHA by guessing.
- A PR whose `ci` check never appears is almost certainly CONFLICTING — GitHub cannot build the test-merge commit, so `pull_request` workflows never trigger. Check `gh pr view --json mergeable` before suspecting slow CI.
- GitHub occasionally drops webhook events for one branch; an empty commit retriggers, and the post-merge `main` push run is the authoritative fallback signal.
- The GitHub token lacks `workflow` scope: pushes touching `.github/workflows/` fail. Chain CI-adjacent checks onto scripts CI already runs (e.g. `lint`).
- Merging to `main` auto-runs `prisma migrate deploy` against PROD via the Vercel build and auto-deploys Cloudflare workers. Watch `vercel ls` after merging schema PRs; a failed prod migration (P3009) blocks all deploys until `prisma migrate resolve --rolled-back` + re-apply.

## Environments and data

- No `.env` on this machine; DB URLs come from `vercel env pull --environment=preview`. Preview = dev Neon branch `ep-aged-base-a45y6qrm`; prod = `ep-square-shadow-a4grhgiu`. The Vercel *development* env has no auth keys, so a pull clobbers a hand-maintained `.env.local` — rebuild by appending from `.env.preview`/`.env.production`.
- The dev Neon branch doubles as the shared Vercel Preview DB: a failed migration there blocks everyone's previews (P3009).
- The classifier blocks copying `.env` credentials into `/tmp` clones and any prod-DB write even with in-chat authorization; the user runs those via `! <command>`. Read-only prod SELECTs are allowed.
- Previews have no Google OAuth; sign in with seed accounts (`luffy@optcg.test` etc., `prisma/seed.ts`). Per-deployment domains have separate cookies; VQA against the stable per-branch alias `optcg-sim-git-<branch-hash>`. Localhost cookies ignore ports — agents on other ports clobber the orchestrator's session unless they use the same seed account.
- chrome-devtools MCP shares one page cursor across all clients: never drive the browser concurrently with a subagent doing VQA.

## Linear

- Second-PR links can flip Done → In Progress; re-verify every issue at close-out.
- Queue discipline: only the in-flight wave sits In Progress; every other ratified issue is Todo.
