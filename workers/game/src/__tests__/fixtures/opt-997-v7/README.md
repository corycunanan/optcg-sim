# Native7 semantic reader synthetic corpus

Producer `3213daf8bdd4aefd3a35c7ca5c423b805a960068`, isolated candidate based on
`b4ed42582fc601a90bf4ebce00b478af65939886`. Reader assessed against landed
`553a29551b16022aca64c002af7968e33c8cce31`. This is actual candidate-generated
synthetic evidence under the expressly approved synthetic-only exception for
OPT969 and bounded OPT997. It makes no production-capture/repair/retirement claim.

`manifest.json` records SHA256 of every full payload and the reproducible producer
patch. No IDs, events, RNG, prompt IDs, ownership, or payload fields are normalized.
18 families complete; one legacy-unknown family is diagnostic only. There are44
persisted starts, each replayed through all later pauses on live, undo, mixed-live
and mixed-undo ingress:176 tests (172 completion,4 diagnostic). Incoming mixed
version undo history is independently validated before the retention limit.

| Family | Boundary / independent expectation |
| --- | --- |
| fixed-accept / fixed-decline | REST_DON then TRASH_SELF; accepted substitute stands, earlier rest rolls back; decline pays once and draws |
| fixed-mandatory | mandatory child above exact COST owner, never owner above child |
| selected-accept / selected-mandatory | generic SELECT_TARGET replay; exact owner update below child |
| compound-select | self+trash, excess trash candidates, shuffle makes arrange unnecessary |
| compound-arrange | ordered self+trash ARRANGE_TOP_CARDS replay |
| opponent-life | opponent Character destination PLAYER_CHOICE, nonturn substitute owner |
| two-child-result-ref | two persisted target pauses; later power independently1000 from first trash only |
| nested-replacement | outer substitute KO offers nested replacement and later hand trash |
| later-cost-replacement | hand-trash trigger creates a new COST/replacement after the earlier owner settles |
| terminal-immediate / terminal-after-child | substitute deck exhaustion wins; no restored owner/baseline and exactly one GAME_OVER |
| upgrade-pending6 | actual old unanswered offer writes7, then answer records fresh explicit outcome |
| picker-fixed / picker-variable | actual future DON cost choice producer, optional picker and generic choices, later hand-cost pause |
| picker-action | native7 amount action with held/free and attached host identities |
| picker-replacement | pre-acceptance offer → native7 identity child → settlement (initial red4 regression) |
| legacy-accepted6-unknown | old accepted-child bytes upgraded by candidate retain missing outcome and remain parked; diagnostic, not completion |

Each supported nonterminal ownership family proves source retention/removal,
rollback, hand count and unconsumed/consumed activation; then an ordinary legal
Main ATTACH_DON succeeds, followed by actual battle and legal Block-Step PASS.
Bare Main-phase PASS is not a legal control. Full expected event order and
once-only publication are compared at every saved continuation; independent
terminal/event/count assertions supplement producer equality.

The separate owner-terminal test drives the real payment executor with99 caller
frames; mandatory child creation fills slot100 and owner insertion reaches101,
terminates and never recreates a removed owner. This is executor-boundary evidence,
not a captured ordinary action. Historical v6 payloads under `../opt-969` are
byte-unchanged and retain their known-debt expectations. Writer golden/current
writer tests retain ordinary version6 expectations. Native7 source fields are
rejected under every earlier source version before conversion.

## Reproduce

Create an isolated checkout at the patch base above with its own frozen-lockfile
dependencies, apply `producer-from-b4ed425.patch`, and run from that checkout:

```
pnpm --dir workers/game exec vitest list src/__tests__/opt-997-producer-corpus.test.ts
OPT997_REGENERATE=../../../opt997-v7-regenerated pnpm --dir workers/game exec vitest run src/__tests__/opt-997-producer-corpus.test.ts
```

The generator and storage/coordinator harness are checked in next to the replay
test. The patch includes the exact candidate producer: version7 ordinary saves,
future DON cost choices and native7 amount actions. Reader ordinary writers stay6;
native7 continuations may generate subsequent identity prompts. The generator is
opt-in and skipped in default CI; replay reads only checked-in files and has no
external path dependency. Compare every generated payload's SHA256 to manifest.
A second pinned regeneration matched all19 payloads byte-for-byte.

Reader deployment must precede ordinary writer7. Once native7 is written, rollback
requires a semantic7 reader. Old absent outcomes are never inferred or repaired.
Generic choices remain readable fallback for already-open old clients; old
`donReturn` metadata and bucket grammar remain unchanged.

## Version assignment / continuation inventory

| Surface | Disposition |
| --- | --- |
| engine/state initialization and SessionCoordinator actions | no newest-reader version assignment; ordinary unversioned state writes6 |
| game-state-schema constants / toPersistedGameState | writer6, readable/runtime7; preserve each existing7 independently |
| convertToCurrentShape | inspect source version and reject v7-only fields before legacy conversion |
| persistence native7 ingress | strict shape, owner references and continuation validation; retain7 |
| persistence native6/5/4 and older ingress | existing historical semantics; no upgrade to7 merely because reader supports7 |
| version5-reader projection | temporary validation shape4, unchanged; original source-version rejection precedes projection |
| parseStoredSession undo map | validate every entry independently before boundUndoHistory keeps last entry |
| repository save / undo persistence | canonicalize live and each undo entry independently;7 remains7, ordinary6 remains6 |
| coordinator undo restoration and later child replies | retain native version; no version assignment or unknown-outcome inference |
| isolated candidate ordinary writer | explicit flip to7; pending6 offer may receive fresh outcome after later answer; accepted6 unknown remains unknown |

Outcome continuation producers are gated native7: fixed mandatory orchestration,
compound SELECT, compound ARRANGE, opponent-Life destination, generic SELECT and
optional-offer answer settlement. Consumer is the existing shared drain after
children. There is no alternative engine or inferred legacy outcome.
