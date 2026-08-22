export const meta = {
  name: 'pr-review',
  description: 'Multi-model lens review: GPT-5.6 Codex lenses + cross-family Claude verification',
  whenToUse: 'Adversarial multi-lens review of a PR (args: {pr: 123}) or the current branch vs main (no args) before merge',
  phases: [
    { title: 'Scope', detail: 'classify diff areas, select lenses' },
    { title: 'Review', detail: 'GPT-5.6 lens agents over the diff (Codex usage, not Claude); spec-fidelity lens reads the Linear ticket' },
    { title: 'Verify', detail: 'cross-family refutation: Claude tries to kill each Codex finding' },
  ],
}

// ---- Model routing ----------------------------------------------------------
// Codex (GPT-5.6 family) does the heavy reading/judgment — generous usage plan.
// Claude appears only as: haiku shims (relay Codex output), haiku scope pass,
// and sonnet refuters (cross-family verification, small focused contexts).
const SOL = 'gpt-5.6-sol'      // frontier tier: deep-judgment lenses
const LUNA = 'gpt-5.6-luna'    // mid tier: test/boundary lenses
const TERRA = 'gpt-5.6-terra'  // fast/high-usage tier: mechanical sweeps

// args may arrive as a JSON string depending on how the workflow is invoked
const A = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : (args || {})
const BASE = A.base || 'main'
const PR = A.pr
// Codex exec runs sandboxed without network: gh cannot reach api.github.com inside
// a lens. For PR mode the (unsandboxed) scope agent fetches the diff to a local
// file and lenses read that; branch mode uses local git, which works everywhere.
const DIFF_FILE = PR ? `/private/tmp/pr-review-${PR}.diff` : null
const FETCH_CMD = PR ? `gh pr diff ${PR}` : `git diff ${BASE}...HEAD`
const DIFF_CMD = PR ? `cat ${DIFF_FILE}` : `git diff ${BASE}...HEAD`
// Spec-fidelity lens input: the originating Linear ticket, fetched by an
// unsandboxed haiku agent (Codex lenses have no network) into a local file.
const TICKET_FILE = `/private/tmp/pr-review-${PR || 'branch'}-ticket.md`

// Evidence ladder (.claude/reference/evidence-ladder.md). Every finding and
// every refutation names its rung; rung <= 3 is unproven and never decisive.
const LADDER = `Evidence ladder — state the rung for every claim you make: 1 = said so (prose only); 2 = pointed at a real file:line; 3 = walked the failure step by step through real code; 4 = ran it (a test or script against the real code, output pasted); 5 = reproduced in the running app. Rung 1-3 claims are UNPROVEN. Do not write "verified" over a rung 2 claim.`

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          title: { type: 'string' },
          detail: { type: 'string', description: 'What is wrong, the concrete failure scenario, and the evidence (rule text, code path, message ordering) supporting it' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          rung: { type: 'integer', minimum: 1, maximum: 5, description: 'Evidence-ladder rung reached for this finding: 1 said so, 2 file:line, 3 walked the failure, 4 ran it, 5 reproduced in the app' },
        },
        required: ['file', 'title', 'detail', 'severity', 'rung'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: 'Errors or caveats from running the lens; empty string if none' },
  },
  required: ['findings', 'notes'],
  additionalProperties: false,
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reasoning: { type: 'string' },
    rung: { type: 'integer', minimum: 1, maximum: 5, description: 'Evidence-ladder rung the refutation (or confirmation) reached' },
  },
  required: ['refuted', 'reasoning', 'rung'],
  additionalProperties: false,
}

const GROUP_VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          refuted: { type: 'boolean' },
          reasoning: { type: 'string' },
          rung: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['index', 'refuted', 'reasoning', 'rung'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdicts'],
  additionalProperties: false,
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    areas: { type: 'array', items: { type: 'string', enum: ['engine', 'api', 'ui', 'pipeline', 'docs', 'config'] } },
    files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    ticketId: { type: 'string', description: 'Linear issue ID like OPT-123 found in the PR title/body/branch name; empty string if none' },
  },
  required: ['areas', 'files', 'summary', 'ticketId'],
  additionalProperties: false,
}

// ---- Lenses -----------------------------------------------------------------
// `when` lists diff areas that activate the lens; 'always' runs regardless.
const LENSES = [
  {
    key: 'spec-fidelity',
    when: 'ticket', // runs only when the originating Linear ticket was fetched
    model: TERRA,
    effort: 'low',
    sandbox: 'read-only',
    prompt: `You are checking a diff against the ticket that requested it — spec fidelity, not code quality and not bugs. Read the ticket with \`cat ${TICKET_FILE}\` and the diff with \`${DIFF_CMD}\`. Report two kinds of finding only: (a) MISSING — an acceptance criterion, listed file, named behavior, or explicit constraint in the ticket that the diff does not satisfy (severity major; minor if the ticket marks it optional); (b) UNASKED — behavior, files, or API surface the diff adds or changes that the ticket neither requests nor implies (severity minor, major if it touches shared engine handlers, shared UI primitives, or data contracts). Quote the ticket sentence and the diff hunk for every finding. Past failure classes in this repo: a schema encoding that flipped the controller (player/opponent), dropped an "if" gate from the card text, or defaulted a feasibility flag the ticket specified. If the ticket and diff agree, return zero findings.`,
  },
  {
    key: 'adversarial',
    when: 'always',
    model: SOL,
    effort: 'high',
    sandbox: 'read-only',
    prompt: `You are an adversarial code reviewer. Review the diff produced by \`${DIFF_CMD}\` in this repository (a One Piece TCG simulator; game engine in workers/game, Next.js app in src/). Your goal is to BREAK this change: find real correctness bugs an approving reviewer would miss. Read the surrounding code, not just the diff hunks. Ignore style. Only report findings you can defend with a concrete failure scenario.`,
  },
  {
    key: 'rules-fidelity',
    when: ['engine'],
    model: SOL,
    effort: 'high',
    sandbox: 'read-only',
    prompt: `You are a One Piece TCG rules judge reviewing an engine change for fidelity to the OFFICIAL game rules — not internal code consistency. Steps: (1) run \`${DIFF_CMD}\` and identify which cards/mechanics the change affects; (2) read the official Comprehensive Rules in docs/rules/ and the exact card text/FAQ rulings in docs/cards/ for every affected card; (3) report every place the implemented behavior diverges from the official text — wrong condition, wrong timing window, missing "you may", wrong target constraint, trigger firing when the printed condition is not met. Quote the exact rule/card text as evidence in each finding's detail. Do not report code-quality issues.`,
  },
  {
    key: 'ordering',
    when: ['engine', 'api'],
    model: SOL,
    effort: 'high',
    sandbox: 'read-only',
    prompt: `You are reviewing a change to a WebSocket-driven game engine (Cloudflare Durable Object, workers/game/) for sequencing bugs. Run \`${DIFF_CMD}\`, then attack every touched code path with these assumptions: client responses arrive out of order or duplicated; a prompt response arrives after the prompting effect was cancelled or a new prompt superseded it (stale prompt state); a player disconnects and reconnects mid-prompt; two effects queue prompts back-to-back and the client answers the first one late. Known past bug classes in this repo: out-of-order cost-prompt responses (OPT-371), stale SELECT_TARGET modal state. Report only concrete sequences of events that produce wrong state, each as a numbered event sequence in the finding detail.`,
  },
  {
    key: 'blast-radius',
    when: ['engine'],
    model: TERRA,
    effort: 'medium',
    sandbox: 'read-only',
    informational: true, // behavior reports, not defect claims — never send to verify
    prompt: `You are mapping the blast radius of an engine change in this One Piece TCG simulator. Run \`${DIFF_CMD}\` and list every handler, action type, trigger, or shared utility in workers/game/src/engine/ that the diff modifies. For each one, search the 51 card schema sets (workers/game/src/engine/schemas/) and the resolver for OTHER consumers of that same handler/action/trigger. Report each card or code path whose behavior changes as a side effect and was NOT the target of this diff, with the card ID and why its behavior shifts. This is a search-and-report task: do not judge whether the change is good.`,
  },
  {
    key: 'test-adequacy',
    when: ['engine', 'api', 'ui', 'pipeline'],
    model: LUNA,
    effort: 'medium',
    sandbox: 'workspace-write',
    prompt: `You are auditing test adequacy for a diff. Run \`${DIFF_CMD}\`. For each behavior change, answer: would the new/changed tests FAIL if the fix were reverted? Mentally revert each functional hunk and check whether some assertion breaks; where cheap, verify by actually running a targeted test (\`npx vitest run <file>\` in workers/game or repo root). Then list nearby untested inputs: boundary values, the negative case of every new condition, interactions with adjacent effects. For engine changes, also check that at least one test exercises the PRODUCTION entry path (GameSession.handleAction / the engine action pipeline), not only helper functions — helper-only coverage has previously hidden real integration bugs (PR #255). Report each gap as a finding (severity minor unless the change's core behavior is unpinned — then major).`,
  },
  {
    key: 'api-boundary',
    when: ['api'],
    model: LUNA,
    effort: 'medium',
    sandbox: 'read-only',
    prompt: `You are reviewing trust-boundary handling in a diff touching Next.js API routes (src/app/api/) or WebSocket message handling (workers/game/). Run \`${DIFF_CMD}\`. For every client-supplied value: is it validated against the Zod schemas in src/lib/validators/ (or the worker's message validation) before use? Is authorization checked — session via auth(), lobby/game membership, player-owns-this-card — before acting? Can a crafted payload act on another player's resources or skip a game-legality check the UI would enforce? Report only exploitable or state-corrupting gaps, with the crafted payload described in the detail.`,
  },
]

// Generic Codex relay: a haiku shim writes the task + schema to temp files, runs
// codex exec, and returns the structured JSON verbatim. All heavy reading and
// judgment happens on the Codex side.
function codexShim({ model, effort, sandbox, schema, task, fallback }) {
  return `You are a thin relay shim. Do NOT do the task yourself — your only job is to run the OpenAI Codex CLI with the exact parameters below and relay its structured output.

Steps:
1. Create a temp dir (mktemp -d). With your Write tool, write the task below (everything between <TASK> tags, verbatim) to prompt.txt in it, and the JSON Schema below (between <SCHEMA> tags) to schema.json.
2. Run this single Bash command with timeout 600000:
   codex exec -m ${model} -c model_reasoning_effort="${effort}" --sandbox ${sandbox} --output-schema <tmpdir>/schema.json -o <tmpdir>/out.json - < <tmpdir>/prompt.txt
3. Read <tmpdir>/out.json and return its contents via your structured output. If codex fails or out.json is missing/invalid, return ${fallback}.
Never fabricate content; relay exactly what Codex produced.

<SCHEMA>
${JSON.stringify(schema)}
</SCHEMA>

<TASK>
${task}
</TASK>`
}

function shimPrompt(lens) {
  return codexShim({
    model: lens.model,
    effort: lens.effort,
    sandbox: lens.sandbox,
    schema: FINDINGS_SCHEMA,
    fallback: '{"findings": [], "notes": "<the error text>"}',
    task: `${lens.prompt}\n\n${LADDER}\n\nIf \`${DIFF_CMD}\` produces empty output, STOP: return zero findings with notes saying the diff was empty. Do not substitute a different range, reverse the diff, or reconstruct the change from git history. Otherwise, output findings as JSON conforming to the provided schema; if you find nothing, output {"findings": [], "notes": ""}. Findings without concrete evidence will be discarded — include the evidence in detail.`,
  })
}

// ---- Phase 1: Scope ---------------------------------------------------------
phase('Scope')
log(`Reviewing ${PR ? `PR #${PR}` : `branch vs ${BASE}`}`)

const scope = await agent(
  `Run \`${FETCH_CMD} --name-only\` (if that flag fails, run \`${FETCH_CMD}\` and extract the file list).${DIFF_FILE ? ` Then run \`${FETCH_CMD} > ${DIFF_FILE}\` and confirm the file is non-empty — downstream sandboxed reviewers have no network access and will read the diff from that file.` : ''} If the diff output is EMPTY, return files: [], areas: [], and a summary saying the diff is empty — do not substitute another range or reverse the diff. Otherwise classify the changed files into areas: engine (workers/game/), api (src/app/api/ or WebSocket message handling), ui (src/components/, src/app/ pages), pipeline (pipeline/), docs (docs/, *.md), config (everything else). Return the areas present, the file list, and a 2-sentence summary of what the diff appears to change. Also return ticketId: the Linear issue ID (pattern OPT-<digits>) from ${PR ? `\`gh pr view ${PR} --json title,body,headRefName\`` : '`git branch --show-current` and `git log ' + BASE + '..HEAD --format=%s`'} — prefer the one in the title/branch; empty string if none.`,
  { model: 'haiku', effort: 'low', schema: SCOPE_SCHEMA, label: 'scope-diff' }
)

if (!scope) throw new Error('Scope agent failed — cannot select lenses')
const areas = scope.areas
if (!scope.files.length) {
  return { confirmed: [], skipped: `empty diff for ${DIFF_CMD} — nothing to review`, summary: scope.summary }
}
const ticketId = (A.ticket || scope.ticketId || '').toUpperCase().match(/OPT-\d+/)?.[0] || ''
let ticket = null
if (ticketId) {
  ticket = await agent(
    `Fetch Linear issue ${ticketId}: load the tool with ToolSearch "select:mcp__claude_ai_Linear__get_issue", call it, and write a markdown file to ${TICKET_FILE} containing the issue identifier, title, description (verbatim, including acceptance criteria and "not in scope" sections), labels, and any comments that amend the spec. Return found=true with the path on success. If the tool is unavailable or the issue does not exist, return found=false and write nothing.`,
    { model: 'haiku', effort: 'low', label: `fetch-ticket:${ticketId}`, phase: 'Scope',
      schema: { type: 'object', properties: { found: { type: 'boolean' }, path: { type: 'string' } }, required: ['found', 'path'], additionalProperties: false } }
  )
  if (!ticket?.found) log(`Ticket ${ticketId} not fetched — spec-fidelity lens skipped`)
} else {
  log('No Linear ticket ID in PR/branch — spec-fidelity lens skipped')
}

const docsOnly = areas.length === 1 && areas[0] === 'docs'
if (docsOnly && !ticket?.found) {
  return { confirmed: [], skipped: 'docs-only diff with no ticket, no review lenses apply', summary: scope.summary }
}
// Docs-only diffs with a ticket still get the spec-fidelity lens (did the docs
// change cover what the ticket asked?) but no code lenses.
const selected = LENSES.filter(l => docsOnly
  ? l.when === 'ticket'
  : (l.when === 'always' || (l.when === 'ticket' ? !!ticket?.found : l.when.some(a => areas.includes(a)))))
log(`Areas: ${areas.join(', ')} → lenses: ${selected.map(l => `${l.key}(${l.model.replace('gpt-5.6-', '')})`).join(', ')}`)

// ---- Phase 2: Review (barrier — dedup needs all findings before verify) -----
phase('Review')
const reviews = await parallel(selected.map(lens => () =>
  agent(shimPrompt(lens), {
    model: 'haiku',
    effort: 'low',
    schema: FINDINGS_SCHEMA,
    label: `lens:${lens.key}`,
    phase: 'Review',
  }).then(r => r && { lens: lens.key, ...r })
))

const lensErrors = reviews.filter(Boolean).filter(r => r.notes).map(r => `${r.lens}: ${r.notes}`)
if (lensErrors.length) log(`Lens caveats: ${lensErrors.join(' | ')}`)

const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, lens: r.lens })))
const seen = new Set()
const deduped = all.filter(f => {
  // file:line only — two lenses describing the same bug word titles differently
  const key = `${f.file}:${f.line || 0}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
log(`${all.length} raw findings → ${deduped.length} after dedup`)
if (!deduped.length) {
  return { confirmed: [], areas, lensesRun: selected.map(l => l.key), lensErrors, summary: scope.summary }
}

// ---- Phase 3: Verify --------------------------------------------------------
// Two gates, cheapest first:
//   Stage 1 (Codex plan, ~free): cross-MODEL refute — Sol findings refuted by
//   Luna and vice versa, refute-by-default. Kills most false positives before
//   Claude spends anything.
//   Stage 2 (Claude sonnet — the cost center): cross-FAMILY final gate, majors
//   only, batched one agent per FILE so repo reading is shared across findings.
//   Skippable with args {claudeVerify: false}.
// Informational lenses (blast-radius) bypass verification entirely.
phase('Verify')
const LENS_BY_KEY = Object.fromEntries(LENSES.map(l => [l.key, l]))
const behaviorNotes = deduped.filter(f => LENS_BY_KEY[f.lens]?.informational)
const candidates = deduped.filter(f => !LENS_BY_KEY[f.lens]?.informational)

const stage1 = await parallel(candidates.map(f => () =>
  agent(codexShim({
    model: LENS_BY_KEY[f.lens]?.model === LUNA ? SOL : LUNA, // refute with the model that didn't find it
    effort: 'high',
    sandbox: 'read-only',
    schema: VERDICT_SCHEMA,
    fallback: '{"refuted": false, "reasoning": "codex refute unavailable: <error text>", "rung": 1}',
    task: `You are an adversarial verifier of a code-review finding in this repository (One Piece TCG simulator; game engine in workers/game, official rules in docs/rules/, card text in docs/cards/${f.lens === 'spec-fidelity' ? `; the originating ticket is at ${TICKET_FILE}` : ''}). Try to REFUTE it: read the actual code and, for rules claims, the official text. Default to refuted=true if the evidence does not hold up, the scenario is unreachable, or the behavior is intended. ${LADDER} A refutation at rung 1-3 is not decisive: if you cannot get to rung 4 cheaply, say so and lean on the finding's own rung — a rung 4-5 finding survives a rung 1-3 refutation. Keep reasoning to one short paragraph.\n\nFinding (lens: ${f.lens}, severity: ${f.severity}, rung: ${f.rung})\nFile: ${f.file}${f.line ? `:${f.line}` : ''}\nTitle: ${f.title}\nDetail: ${f.detail}`,
  }), { model: 'haiku', effort: 'low', schema: VERDICT_SCHEMA, label: `refute:${f.title.slice(0, 30)}`, phase: 'Verify' })
    .then(v => ({ ...f, codexVerdict: v || { refuted: false, reasoning: 'codex refute agent failed — unverified', rung: 1 } }))
))

// A refutation only counts when it out-evidences the finding: rung 4-5 kills
// anything; rung 1-3 kills only a finding that is itself rung 1-3.
const decisive = (finding, verdict) => verdict.refuted && ((verdict.rung ?? 1) >= 4 || (finding.rung ?? 1) <= 3)

const s1 = stage1.filter(Boolean)
const s1Refuted = s1.filter(f => decisive(f, f.codexVerdict))
const survivors = s1.filter(f => !decisive(f, f.codexVerdict))
log(`Codex refute gate: ${s1Refuted.length} killed, ${survivors.length} survive`)

const codexOnly = survivors.filter(f => f.severity === 'minor')
const toConfirm = survivors.filter(f => f.severity !== 'minor')
let confirmed = []
const claudeRefuted = []

if (A.claudeVerify === false) {
  confirmed = toConfirm.map(f => ({ ...f, verdict: { refuted: false, reasoning: 'claude verify skipped by args' } }))
} else if (toConfirm.length) {
  const byFile = {}
  toConfirm.forEach(f => { (byFile[f.file] = byFile[f.file] || []).push(f) })
  const groups = Object.entries(byFile)
  log(`Claude gate: ${toConfirm.length} findings in ${groups.length} file groups`)
  const groupResults = await parallel(groups.map(([file, fs]) => () =>
    agent(
      `Below are ${fs.length} code-review findings, all anchored in ${file}. For EACH one independently, try to REFUTE it: read the actual code (and for rules claims, the official text in docs/rules/ or docs/cards/) and decide whether the failure scenario is real in the current code on this branch. Default to refuted=true if the evidence does not hold up, the scenario is impossible, or the behavior is intended. Return one verdict per finding, keyed by its [index]. ${LADDER} Where a targeted test run is cheap (\`npx vitest run <file>\`), run it and report rung 4; a rung 1-3 refutation does not kill a rung 4-5 finding. Keep each reasoning to one short paragraph — state the decisive evidence, not a full audit trail.${fs.some(f => f.lens === 'spec-fidelity') ? ` The originating Linear ticket is at ${TICKET_FILE}.` : ''}\n\n` +
      fs.map((f, i) => `[${i}] (lens: ${f.lens}, severity: ${f.severity}, rung: ${f.rung}) ${f.file}${f.line ? `:${f.line}` : ''} — ${f.title}\n${f.detail}`).join('\n\n'),
      { model: 'sonnet', effort: 'high', schema: GROUP_VERDICT_SCHEMA, label: `verify:${file.split('/').pop()}`, phase: 'Verify' }
    ).then(r => r && { fs, verdicts: r.verdicts })
  ))
  // Results cross the workflow runtime as clones, so track coverage by key,
  // not object identity (identity tracking double-counted findings in run
  // wf_040a675d-284).
  const fkey = f => `${f.file}:${f.line || 0}:${f.title}`
  const covered = new Set()
  for (const g of groupResults.filter(Boolean)) {
    for (const v of g.verdicts) {
      const f = g.fs[v.index]
      if (!f || covered.has(fkey(f))) continue
      covered.add(fkey(f))
      if (decisive(f, v)) claudeRefuted.push({ ...f, verdict: v })
      else confirmed.push({ ...f, verdict: v })
    }
  }
  // A failed/partial group agent must not silently drop findings — pass them
  // through flagged as codex-verified only.
  confirmed.push(...toConfirm.filter(f => !covered.has(fkey(f)))
    .map(f => ({ ...f, verdict: { refuted: false, reasoning: 'claude verify unavailable — codex-verified only', rung: 1 } })))
}
log(`${confirmed.length} confirmed, ${claudeRefuted.length} refuted by Claude gate`)

const rank = { critical: 0, major: 1, minor: 2 }
confirmed.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))

return {
  confirmed,
  codexOnlyConfirmed: codexOnly,
  behaviorNotes,
  refuted: {
    codexGate: s1Refuted.map(f => `${f.title} — ${f.codexVerdict.reasoning.slice(0, 120)}`),
    claudeGate: claudeRefuted.map(f => `${f.title} — ${f.verdict.reasoning.slice(0, 120)}`),
  },
  areas,
  ticketId: ticket?.found ? ticketId : null,
  lensesRun: selected.map(l => l.key),
  lensErrors,
  summary: scope.summary,
}
