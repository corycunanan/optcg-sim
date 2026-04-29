---
name: investigate
description: Investigate a bug end-to-end — root cause analysis, scope assessment, fix plan, and Linear project with broken-down issues
argument-hint: "[bug description or Linear issue ID]"
allowed-tools: Read Glob Grep Bash Agent mcp__linear-server__list_issues mcp__linear-server__get_issue mcp__linear-server__save_issue mcp__linear-server__save_project mcp__linear-server__list_issue_labels AskUserQuestion
---

# Bug Investigation

Investigate a bug, determine root cause and scope, plan a fix, and create a Linear project with implementation-ready issues.

## Phase 1: Gather Context

If `$ARGUMENTS` is a Linear issue ID (e.g. OPT-118), fetch it with `get_issue` and use its description as the starting context.

If `$ARGUMENTS` is a free-text bug description, use that as the starting context.

If `$ARGUMENTS` is empty, ask the user to describe the bug.

**Before investigating, ask the user clarifying questions about anything you cannot determine from the codebase alone:**

- How was the bug discovered? (user report, testing, code review)
- What is the expected behavior vs actual behavior?
- Are there specific cards, effects, or scenarios that trigger it?
- Is there a reproduction path?
- How urgent is this? (blocking gameplay, cosmetic, edge case)

Do NOT assume answers. Wait for the user to respond before proceeding.

## Phase 2: Investigate

Once you have enough context, investigate the bug in the codebase. Your goal is to answer three questions:

### WHY is this happening?

- Trace the code path from trigger to symptom
- Identify the exact line(s) where behavior diverges from intent
- Understand the original design decision that led to this bug
- Check git blame/log if the code was recently changed

### WHAT is the scope?

- Is this limited to one specific card, or a pattern of cards?
- Does it affect a category of effects (e.g. all "redistribute" actions, all "on play" triggers)?
- Are there other code paths that share the same flawed logic?
- Search for similar patterns in schemas and action handlers
- List all affected cards/effects explicitly

### HOW should it be fixed?

- Describe the correct behavior per game rules
- Identify all files that need to change
- Determine if new abstractions, types, or helpers are needed
- Identify if the fix requires UI changes (new prompts, modals, drag interactions)
- Consider if existing tests cover this path, or if new tests are needed
- Note any risks or side effects of the fix

## Phase 3: Report Summary

Present your findings to the user as a structured summary:

```
## Bug: [one-line title]

### Root Cause
[2-3 sentences explaining WHY]

### Scope
- Affected cards: [list]
- Affected code paths: [list of files:lines]
- Pattern: [is this isolated or systemic?]

### Fix Plan
[Numbered steps describing the fix at a high level]

### Files to Change
[List of files with brief description of what changes]

### Risks
[Any side effects, regressions, or open questions]
```

Ask the user if they agree with the assessment before proceeding to Phase 4.

## Phase 4: Create Linear Project and Issues

Once the user approves:

1. **Create a Linear project** with:
   - Name: the issue ID + short title (e.g. "OPT-118: Fix REDISTRIBUTE_DON")
   - Description: paste the full summary from Phase 3

2. **Break down the fix into individual issues.** Each issue must be:
   - A single, measurable unit of work (one PR or less)
   - Ordered by dependency (foundational work first)
   - Tagged with appropriate labels (Game Engine, Feature, Bug, Testing, etc.)
   - Estimated (1 = trivial, 2 = small, 3 = medium, 5 = large, 8 = very large)
   - Assigned to "me"
   - Linked to the project

3. **Each issue description must contain enough context for an agent to implement it without additional prompting:**
   - Exact file paths and line numbers where changes go
   - The specific types, functions, or interfaces to create/modify
   - Code snippets showing the target shape (pseudocode is fine)
   - Acceptance criteria (what "done" looks like)
   - Reference to any relevant game rules or card text
   - Explicit list of what is NOT in scope for this issue

4. **Track dependencies** using Linear's `blockedBy` field:
   - Type/helper issues block implementation issues
   - Engine issues block UI issues
   - Shared types block both engine and UI

5. **Issue ordering convention:**
   - First: shared types and interfaces
   - Then: low-level helpers and mutations
   - Then: core logic (engine handlers, resolvers)
   - Then: plumbing (resume handlers, pipeline integration)
   - Then: UI components (prompts, modals, drag interactions)
   - Last: integration/wiring (connecting UI to engine)

After creating all issues, display a summary table:

```
| # | ID | Title | Estimate | Blocked By |
|---|-----|-------|----------|------------|
```
