Fixture acquisition only; no writer production changes.

Source: actual merged reader e14af35bad3a7189a40294f5d4ab3db5b5602f0e, tree 29d53132b06c2ac0aad8b4ab56415531f645d186. Clean future writer checkout: /private/tmp/opt969-mode8-writer, branch corymcunanan/opt-969-mode8-writer. Matching dependencies copied with APFS clone-on-write from the reader; unchanged lock hash is in manifest.json.

All inputs are synthetic. actual-default7-init-input.json is a synthetic new-game payload and actual-default7-setup-output.json is untouched buildInitialState + real SessionRepository.save output, mode7 chosen by this reader. synthetic-mode6/7-raw-seed.json are explicitly seeded stable gameplay inputs (rig plus the three authored cards); they are not untouched setup outputs. In particular mode6 is an explicit recorded-session seed, never an actual new-default6 game or a production capture. Embedded and separate saved cardDb variants were each loaded with the real repository and verified to preserve the old authored definitions.

manifest.json pins source, generator, lock, versions and all nine raw input/output/definition payload hashes. capture.test-source is the exact temporary generator; capture-list.log collected one case and capture-run.log reports one pass. The temporary executable test was removed after acquisition; the checkout remains clean.

To reproduce at that exact source revision, copy capture.test-source to workers/game/src/__tests__/opt-969-writer-preflight.capture.test.ts temporarily. From workers/game, run VITEST_MAX_WORKERS=2 pnpm exec vitest list src/__tests__/opt-969-writer-preflight.capture.test.ts, then OPT969_WRITER_PREFLIGHT_OUT=<fresh-output-directory> VITEST_MAX_WORKERS=2 pnpm exec vitest run src/__tests__/opt-969-writer-preflight.capture.test.ts. Remove the temporary source afterward. Never overwrite these original capture bytes.

Future writer tests must consume these historical definitions/sessions rather than rebuilding oldSchemas() from the future corrected registry. The final mode8 reader corpus remains separately immutable.
