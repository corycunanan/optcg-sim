#!/usr/bin/env bash
# Decides what the "Deploy Cloudflare Workers" workflow ships for one green
# CI run on main (OPT-1062). Called from deploy-workers.yml after CI succeeds.
#
# Inputs (env):
#   REPO           owner/name
#   HEAD_SHA       the commit CI tested (github.event.workflow_run.head_sha)
#   CI_WORKFLOW_ID the CI workflow id (github.event.workflow_run.workflow_id)
#   CI_RUN_NUMBER  this CI run's number (github.event.workflow_run.run_number)
#   DEPLOY_WORKFLOW the deploy workflow file name, for its own run history
#   GITHUB_OUTPUT  where to write game/images/schemas (true|false)
#
# Base of the diff: the CI commit named by the newest successful run of this
# deploy workflow (its run-name carries that sha). A failed or cancelled
# deploy never moves the base, so its changes ship with the next green run.
# Over-inclusive diffs only redeploy; they never skip a change.
#
# A newer green CI run on main supersedes this one: deploying this commit
# would roll the worker back, so everything is skipped and the newer run
# (whose diff starts at an older base) ships both.
set -euo pipefail

emit() {
  echo "game=$1" >> "$GITHUB_OUTPUT"
  echo "images=$2" >> "$GITHUB_OUTPUT"
  echo "schemas=$3" >> "$GITHUB_OUTPUT"
}

newer=$(gh api "repos/$REPO/actions/workflows/$CI_WORKFLOW_ID/runs?branch=main&event=push&status=success&per_page=100" \
  --jq "[.workflow_runs[] | select(.run_number > $CI_RUN_NUMBER) | .head_sha] | first // empty")
if [ -n "$newer" ]; then
  echo "A newer green CI run on main ($newer) supersedes $HEAD_SHA; skipping."
  emit false false false
  exit 0
fi

base=""
while read -r sha; do
  [ -n "$sha" ] || continue
  [ "$sha" = "$HEAD_SHA" ] && continue
  if git merge-base --is-ancestor "$sha" "$HEAD_SHA" 2>/dev/null; then
    base="$sha"
    break
  fi
done < <(gh api "repos/$REPO/actions/workflows/$DEPLOY_WORKFLOW/runs?event=workflow_run&status=success&per_page=100" \
  --jq '.workflow_runs[] | .display_title | capture("(?<sha>[0-9a-f]{40})").sha? // empty')

if [ -z "$base" ]; then
  base=$(git rev-parse "$HEAD_SHA^")
  echo "No earlier deployed commit found; diffing against the parent $base."
else
  echo "Last deployed commit: $base"
fi

files=$(git diff --name-only "$base" "$HEAD_SHA")
echo "Changed files since $base:"
echo "$files" | sed 's/^/  /'

has() { grep -Eq "$1" <<<"$files" && echo true || echo false; }
emit \
  "$(has '^workers/game/')" \
  "$(has '^workers/images/')" \
  "$(has '^(workers/game/src/engine/schemas/|workers/game/src/engine/schema-registry\.ts$|src/lib/deck-builder/validation\.ts$|pipeline/sync-effect-schemas\.ts$)')"
