#!/bin/bash
# PreToolUse hook (matcher: Bash). Blocks git commands that discard work that is
# not yet committed or pushed. Adapted from mattpocock/skills git-guardrails.
#
# Why: a `git restore` on uncommitted agent work in a clone has already cost a
# transcript-diff recovery (see memory: op17-orchestrate-run-learnings). These
# commands are never needed by the ticket/orchestrate pipeline, which merges via
# `gh pr merge` and syncs with `git branch -f main origin/main`.
#
# Bypass: prefix the whole command with `GIT_GUARDRAILS_OK=1 ` after looking at
# what the target holds (`git status`, `git stash list`) and saying so in the
# reply. Only a leading prefix counts; the token elsewhere in the command is
# ignored.

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && exit 0

if printf '%s' "$COMMAND" | grep -qE '^[[:space:]]*GIT_GUARDRAILS_OK=1[[:space:]]'; then exit 0; fi

# `git` (bare or by path) plus any global options (-C <dir>, -c key=val,
# --git-dir=<x>, --git-dir <x>, --no-pager, ...) before the subcommand, then the
# subcommand plus any options before the argument that makes it destructive.
# The scan is textual over the whole command string: a quoted mention of a
# guarded command (grep/echo) also trips it — a false positive costs one bypass
# prefix, a false negative costs work.
G='(^|[^[:alnum:]_.-])([^[:space:]]*/)?git([[:space:]]+(-[cC][[:space:]]+[^[:space:]]+|-[a-zA-Z]|--[a-z-]+(=[^[:space:]]*|[[:space:]]+[^[:space:]-][^[:space:]]*)?))*[[:space:]]+'
O='([[:space:]]+-[^[:space:]]+)*[[:space:]]+'
A='([[:space:]]+[^[:space:]]+)*[[:space:]]+'   # any arguments

# Patterns are extended regexes matched against the whole command string.
DANGEROUS_PATTERNS=(
  "${G}restore([[:space:]]|$)"                                  # git restore <anything>, incl. --staged
  "${G}checkout${A}(--|\\.)([[:space:]]|$)"                       # git checkout [ref] -- <path> / git checkout .
  "${G}checkout${O}(-f|--force|-[a-zA-Z]*f[a-zA-Z]*)([[:space:]]|$)"  # git checkout -f <ref>
  "${G}reset${O}(--hard|--merge)"                                 # git reset [-q] --hard|--merge
  "${G}clean${O}(-[a-zA-Z]*[fx]|--force)"                         # git clean -f / -fd / -x / --force
  "${G}branch${O}(-D|--delete${O}--force|--force${O}--delete|-[a-zA-Z]*D)"
  "${G}push${O}(-f|--force|--force-with-lease)([[:space:]]|=|\$)"  # force flags
  "${G}push([[:space:]]+[^[:space:]]+)*[[:space:]]+\+[^[:space:]]+"  # forced refspec: push origin +main
  "${G}stash${O}(drop|clear)"
  "${G}worktree${O}remove${O}(--force|-f)"
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
