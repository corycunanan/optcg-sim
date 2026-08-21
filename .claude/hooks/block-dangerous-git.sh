#!/bin/bash
# PreToolUse hook (matcher: Bash). Blocks git commands that discard work that is
# not yet committed or pushed. Adapted from mattpocock/skills git-guardrails.
#
# Why: a `git restore` on uncommitted agent work in a clone has already cost a
# transcript-diff recovery (see memory: op17-orchestrate-run-learnings). These
# commands are never needed by the ticket/orchestrate pipeline, which merges via
# `gh pr merge` and syncs with `git branch -f main origin/main`.
#
# Bypass: prefix the command with `GIT_GUARDRAILS_OK=1 ` after looking at what
# the target holds (`git status`, `git stash list`) and saying so in the reply.

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && exit 0

case "$COMMAND" in *GIT_GUARDRAILS_OK=1*) exit 0 ;; esac

# Patterns are extended regexes matched against the whole command string.
DANGEROUS_PATTERNS=(
  'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?restore[[:space:]]'        # git restore <anything>, incl. --staged
  'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?checkout[[:space:]]+(--|\.)'  # git checkout -- <path> / git checkout .
  'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?reset[[:space:]]+(--hard|--merge)'
  'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?clean[[:space:]]+-[a-zA-Z]*[fx]'
  'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?branch[[:space:]]+(-D|--delete[[:space:]]+--force)'
  'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?push[[:space:]]+(.*[[:space:]])?(-f|--force|--force-with-lease)([[:space:]]|$)'
  'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?stash[[:space:]]+(drop|clear)'
  'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?worktree[[:space:]]+remove[[:space:]].*--force'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE "$pattern"; then
    cat >&2 <<MSG
BLOCKED by .claude/hooks/block-dangerous-git.sh: the command matches '$pattern'.
This command can discard uncommitted or unpushed work. Look at what the target
holds first (git status / git stash list / git log), then either pick a
non-destructive alternative (git stash, a new branch, git branch -f main
origin/main) or, if discarding is really intended and you have said so in your
reply, re-run with the prefix GIT_GUARDRAILS_OK=1.
MSG
    exit 2
  fi
done
exit 0
