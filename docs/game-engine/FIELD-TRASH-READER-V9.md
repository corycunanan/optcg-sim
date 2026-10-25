# Field-trash replacement reader (OPT-1006 / OPT-1001 / OPT-998)

The verified reader shipped at `d8309e70fef64a133ce19d8a2bd327bb625e56fb`
(PR788; worker deployment `bd251100-440e-40f8-b381-302f0a3db6f2`). The final
writer now enables its existing route when an explicit schema8/cost-mode6|7|8
graph executes selected field-Character `TRASH_CARD`. It immutably sets only
`schemaVersion: 9` immediately before the scan, including synchronous/no-match
and selected-but-prohibited cases. Native9 remains9. Ordinary setup remains8/mode8,
hand-only and empty selections remain8, and cost mode never changes here. Raw
source6/7/undefined direct engine callers retain their historical behavior;
Repository/Coordinator ingress owns their existing validated8/mode7 promotion.
Both OPT-1001 debt controls are now normal source8 regressions.

## Ownership and semantics

The existing batch scanner owns the complete simultaneous target group until
all replacement offers/substitutes finish. Members stay on field during payment.
The batch stores `actionKind: TRASH_CARD`, the removal/leave event family,
causing controller and optional `EffectSourceIdentity`; trash never advertises
`WOULD_BE_KO`. The existing replacement continuation reports finalized new IDs
once to its paused action's result reference. `finalizeTrashCards` is the prior
movement loop extracted in the same removal module, used synchronously and after
batch resumption. It retains one hand-trash aggregate per owner for mixed-zone
groups. Field movement uses the zone-transition contract, emits `CARD_TRASHED`
and never `CARD_KO`. Substitute movement is excluded from the original action's
`CARDS_TRASHED_THIS_WAY` result (OPT-885).

Eligibility follows printed removal protection: Koby protects own Navy Characters
with base power<=7000 removed by an opponent effect, when exactly three Trash
cards can be returned. Beckman's printed power<=6000 target restriction remains
separate. The rules basis is8-1-3-4 (replacement ordering, one application,
whole-process scope, feasibility, rescan, owner attribution) and8-3-1 (cost
sequencing/replaced printed cost). Canonical texts are OP09-009/OP11-001, Brook
OP06-092, Luffy OP07-091, Kaido OP08-079 and Tashigi ST19-003. The recursive
[consumer inventory](evidence/opt-1006/consumer-inventory.md) additionally records
own-field/self-trash and hand-only consumers. Tests include Brook's real choice,
Koby/Zoro rescan, Thatch/Zoro/LittleOars self-trash substitutes, negative Navy/base
power/resource controls, simultaneous payment, exact action counts and scale128.

## Compatibility and rollout

The persisted discriminator is new meaning an old reader cannot understand,
so source9 retains9 throughout save/load, stable completion, terminal cleanup
and later actions. Source<=8 rejects the discriminator in frames and retired
batch contexts/riders by field/index. No historical envelope or fixture is
retagged. Source9 requires explicit costSemanticsVersion6/7/8 and preserves it;
mode6 keeps its old cost semantics. Native cost and battle capability guards
explicitly accept8|9; source9 cannot fall into historical cost promotion.

Producer activation is narrowly scoped to the selected field consequence:
return a new `{ ...state, schemaVersion: 9 }` before filtering/scanning. It never
mutates the input, derives provenance from a parked batch, changes cost mode,
activates hand-only actions or blanket-promotes sessions. The minimum rollback
floor is the verified reader merge `d8309e70fef64a133ce19d8a2bd327bb625e56fb`.
Already saved9 graphs continue fresh trash actions on that actual floor;
restoring an actual pre-transition8 undo preserves8. `05d02e88` rejects9 and is
only a pre-writer negative control.

OPT-998 shares the same strict source schema used by event payloads. Malformed
identity values reject live and undo before retention or writes, naming frame
index and field. Valid complete bytes are compared to a frozen actual05d writer
capture, plus the existing full writer golden. All four historical5b engine
states remain readable.

## Evidence and limitations

The manifest `workers/game/src/__tests__/fixtures/opt-1006-writer-corpus.manifest.json`
pins11 synthetic engine-generated families,28 starts and22 native9 starts,
producer SHAs, complete compressed-payload hash and reproduction commands. The
reader starts each native9 pause and reloads after every reply. Downstream
families include a fresh authored Ganzui trash offer after stable9, mode8
Oden/Ganzui COST accept/decline, and the actual EOB completion owner after a
protected battle. Actual coordinator undo is empty at these mandatory prompts;
separate repository tests cover mixed live9/undo8 and retained modes. The
GameSession test recreates the Durable Object after each websocket reply and
rejects duplicate replies without state/storage changes.

Producer09b6b43 supplies six Beckman families. Producer7ccfecb supplies group and
successor families. Their patches relative to the frozen reader implementation
are archived non-executably under `evidence/opt-1006/`; these isolated producers
are evidence only and are absent from this reader branch. The first prototype
group capture had a reply without the writer-assigned prompt ID; it failed the
reader stale-response guard. The corrected producer captures an authoritative
save/load/reply chain. Failed logs remain in the run evidence rather than being
presented as passing evidence.

These are synthetic minimal sessions using actual authored abilities, not
production captures or full-deck simulations. The user approved the scoped
engine-generated-corpus exception for this rollout. Production evidence remains
unavailable. Existing historical families and goldens are immutable.

OPT-997 is already delivered by the OPT-969 prerequisites and is not reimplemented.
The Decision10 stack/drain regressions and authored Oden/Ganzui cases preserve the
OPT-958 accepted rollback debt. Acceptance restores earlier DON and leaves use
unconsumed; rule-literal8-3-1-3-1 retains the paid portion. Applying10-2-13-5 use
consumption specifically to replaced costs remains the documented assumed reading.
This compatibility result does not claim rules conformance or close OPT-958.
The next policy review condition remains an applicable authoritative ruling or a
payment/card change expanding authored reachability.

## Final writer evidence

The final writer uses a distinct canonical corpus and manifest named
`opt-1006-final-writer-corpus.*`; the reader-stage corpus above remains immutable.
The writer tests begin with actual setup8/mode8 (explicit6/7 variants are separate),
exercise the producer through Coordinator/pipeline, and save/load after every
reply. A run-owned clone at the deployed floor uses its own frozen-lockfile
dependencies. `OPT1006_WRITER_FLOOR_ROOT` selects its actual Repository,
Coordinator, prompt lifecycle and GameSession classes. Newly emitted9 states,
complete persisted outcomes/events/IDs and reloaded duplicate-response rejection
are compared exactly, including successor Ganzui, COST and battle completion.
Reader semantics and every historical fixture byte are unchanged.

The original six pre8 Beckman starts are independently saved historical choice
scripts: their first target reply lacks a prompt ID, and loading that first
saved prompt consumes one ID before later recorded replies. They now execute
with authoritative live IDs through completion and independent Navy/trash/deck
expectations. They are not falsely advertised as contiguous exact-ID suffixes.
All22 original native9 starts retain exact frozen final-state comparisons.
New canonical final-writer captures carry their own contiguous authoritative
save/load/reply chain, exact complete outcomes and immutable producer pin.

The bounded source delta is only the capability guard and immutable scalar
assignment in `executeTrashCard`; existing native9 paths, source-identity
validation, continuation, feasibility and movement code are byte-equivalent to
the verified reader. The reader-stage strict validation and historical corpus
results therefore remain applicable to unchanged code; new writer tests cover
the scalar/provenance boundary, input/undo, IDs/RNG/events and actual floor replay.
