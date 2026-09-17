# Testing and evidence

## What was reviewed

The portfolio review inspected the implementation's README, package manifest, repository tree, and selected test definitions on **17 September 2026**. This establishes the documented stack and the existence of the cases summarized below.

**The FASTLANE application test suite was not run for this showcase.** There is no reported pass rate, model benchmark, or production validation result here.

## Selected implementation test cases

| Area | Behavior represented in the reviewed tests |
| --- | --- |
| Fact extraction | Limit extraction to registered technical zones and preserve unknown technical fields |
| Measurements | Normalize locale-sensitive power, energy, range, and duration values |
| Source context | Preserve explicit qualifiers attached to a measurement |
| Ambiguity | Report ambiguous aliases and reject incompatible or multiple numerical quantities |
| Conflicting observations | Keep verified facts and emit a conflict when observations change |
| Source authority | Prevent partial snapshots or lower-authority observations from replacing canonical facts |
| Determinism | Keep canonical JSON hashing independent of object-key order; produce stable dry-run output |
| Fact retrieval | Deduplicate inputs and preserve contextual ordering |
| Schema availability | Fail safely when the canonical schema is unavailable |
| Assistant rollout | Use canonical data for eligible questions and retain fallback behavior for held-back or unavailable data |
| Ambiguous model queries | Return bounded facts for each matching model |

The reviewed files were `lib/catalog-intelligence/catalog-intelligence.test.ts`, `lib/catalog-intelligence/assistant-facts.test.ts`, and `app/api/v1/search/assistant/route.test.ts`. These paths identify the evidence reviewed in the separate implementation; the test source is not included in this documentation repository.

## Application checks defined by the project

The implementation defines commands for Vitest tests, TypeScript checking, OpenAPI checking, a production build, and performance-budget validation. Its `verify` command combines these checks. Publishing this showcase does not imply that those commands have just passed.

## Public showcase checks

Publication review checks the selected public file set, internal documentation links, project attribution, credential patterns, and the distinction between inspected tests and executed tests. Public repository access and the CV's project link are checked after publication.

## Limits

A documentation review cannot establish correctness across all application paths. Live integrations, checkout and payment flows, identity configuration, deployment behavior, AI response quality, and external-provider failures require the implementation and an appropriate test environment.
