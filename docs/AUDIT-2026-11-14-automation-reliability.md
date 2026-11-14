# LeadOS evaluation: efficiency, intelligence and automation

Scope: canonical local-first `app/` and standalone distribution. This note supersedes the trigger-index claims in the earlier Efficiency · Intelligence · Automation audit; it is not a claim of a comprehensive security or performance audit.

## Findings and changes

- **Automation correctness:** the manually maintained prefix index was active in the app but incomplete. For example, `retentionRule` handles `goal.*`, and `responseRule` handles `case.created`; neither appears under those prefixes. Custom rules could also be excluded. The spine now delivers each event to every rule, even when the old index option is supplied. The existing lazy savepoints and proven decline memo remain. This can increase write latency; restoring filtering requires enforceable, complete trigger contracts and indexed/unindexed end-to-end equivalence tests, not a hand-maintained allowlist.
- **Intelligence:** unrelated workspace-level findings no longer count as convergence or gain its ranking boost. Deduplication includes entity type, and invalid or future timestamps no longer receive a recency bonus. Failures or non-array results from a registered source are reported in the hub and make its health reading unhealthy instead of looking like a quiet workspace. A fusion cap also makes health incomplete. These are heuristic rankings, not proof of independent causes; destination-based entity inference still warrants review.
- **Efficiency:** the diagnostics view now reuses its fusion reading for coverage rather than running the collection, deduplication, clustering and ranking twice. Removed unused per-rule performance marks that were never ended. No asynchronous persistence or event reprioritization was introduced: both would change established data and ordering guarantees.

## Next priorities

1. Measure real write and navigation latency on representative large workspaces before optimizing. Keep durable writes synchronous unless a new persistence contract is explicitly designed.
2. Define typed entity identity and evidence provenance for all signals; avoid treating a shared destination or a different domain label as proof of independent evidence.
3. Make any future automation index opt-in only after every rule has a checked trigger contract and production-like differential tests cover source, derived and custom events.
