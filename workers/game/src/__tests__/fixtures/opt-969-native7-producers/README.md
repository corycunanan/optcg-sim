# Native7 future-producer corpus

82 isolated synthetic scenarios from actual frozen writer `ed6b264be4e38e2d52f4db49429f8efd976f5d45`; no production-capture or authored reachability claim.171 generated pending boundaries and253 starting boundaries are replayed without state/event/identity normalization. Historical corpora are untouched.

`manifest.json` is authoritative for source schemas/card-db hashes, scripted replies, independent resource expectations, generator hashes, payload hashes and counts. `producer/metadata.json` and `producer/production-from-485.patch` reconstruct all eight production files from reachable reader485; local producer commits need not be fetched. The patch is a producer artifact, not deployable reader source.

One serial capture entry point generates all82 cases, including the eight ordered DON pairs:

```sh
OPT969_CAPTURE=1 OPT969_PRODUCER_ROOT=/path/to/rebuilt-producer pnpm --filter optcg-game exec vitest list src/__tests__/opt-969-native7-producer-matrix.test.ts
OPT969_CAPTURE=1 OPT969_PRODUCER_ROOT=/path/to/rebuilt-producer pnpm --filter optcg-game exec vitest run src/__tests__/opt-969-native7-producer-matrix.test.ts
```

Run capture in isolated scratch and compare every payload hash. Default tests replay only. `OPT969_REPLAY_ROOT` selects an external immutable runtime; absent it uses the amendment. Both builds use real repository/coordinator/lifecycle. The optional pinned diagnostic enumerates negative controls against original485 and must not be described as compatibility success.

The complete source/acceptance map and limitations are in `docs/project/handoffs/opt969-native7-producers.md`. There are no fixture adapters or production opt-outs.
