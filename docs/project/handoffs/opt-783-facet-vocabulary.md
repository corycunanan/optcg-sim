# OPT-783 — Public facet vocabulary

Implementation complete; independent review and merge readiness remain coordinator work. Branch: `corymcunanan/opt-783-public-facet-vocabulary-endpoint-distinct-traits-effect`, based on main `50331c89f742b4a0a04a6e6d8465b97e7999317f`. This handoff ships with the implementation commit.

`GET /api/cards/facets` returns the distinct, sorted `Card.traits` and `Card.effectTraits` vocabulary plus the unchanged `EFFECT_FACET_GROUPS`. It consumes the public card-search limiter before querying and caches successful responses publicly for one hour (with a one-day stale revalidation window). Errors and throttled responses do not receive that cache policy.

Read `src/lib/cards/facet-vocabulary.ts`, `src/app/api/cards/facets/route.ts`, and `CardFacetVocabularySchema` in `src/lib/validators/cards.ts` first. The schema follows existing response-envelope conventions; the exported `CardFacetVocabulary` type refers to its `data` payload. Array sorting uses JavaScript's deterministic string ordering; SQL performs distinct array expansion without loading full card records. Both empty arrays naturally contribute no vocabulary values.

OPT-781's facet columns are already on the base. OPT-782 is related search functionality, not a prerequisite; this branch does not include its query-parameter changes. No migration, UI, production command, or per-set/per-color narrowing is included. Downstream OPT-784/785 UI consumers can use this endpoint after this PR merges; those tickets remain outside this implementation.

Validation baseline: recovered work passed 3 focused mocked tests before additions; this is a new endpoint, so no pre-existing bug RED claim is made. Final evidence is recorded in the PR body. Focused verification includes a real migrated disposable PostgreSQL fixture with overlapping traits across cards, duplicates within a card, column separation, and empty arrays. Fixture creation/read/cleanup is transactional and unique values permit concurrent database suites. Route tests cover response schema/order/groups, one-hour caching, the shared limiter key, forged internal rate-limit headers, 429 before SQL, and uncached 500 responses.

Follow-ups: none discovered within scope. Endpoint vocabulary freshness follows the accepted import-time cache policy; no separate invalidation mechanism is introduced.
