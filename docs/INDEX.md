# LEADOS Documentation Index

This index follows the [Diátaxis](https://diataxis.fr/) framework: four documents for four
different needs. Start with whichever matches what you're trying to do right now.

| I want to... | Go to |
|---|---|
| Get LEADOS running and see my first scored lead | [`tutorials.md`](./tutorials.md) — **Tutorial** |
| Do a specific task I already know the shape of | [`how-to-guides.md`](./how-to-guides.md) — **How-to guides** |
| Look up a config variable, API route, or event type | [`reference.md`](./reference.md) — **Reference** |
| Understand *why* LEADOS is built this way, including its limits | [`explanation.md`](./explanation.md) — **Explanation** |
| Cut a release | [`RELEASING.md`](./RELEASING.md) |
| Roll back a bad release | [`ROLLBACK.md`](./ROLLBACK.md) |
| Deploy to staging/production | [`DEPLOYMENT.md`](./DEPLOYMENT.md) |
| Triage an issue as a maintainer | [`MAINTAINER-RUNBOOK.md`](./MAINTAINER-RUNBOOK.md) |
| See past architectural decisions | [`adr/INDEX.md`](./adr/INDEX.md) |
| See what changed in this release and why docs don't contradict code anymore | [`CONSISTENCY-SWEEP.md`](./CONSISTENCY-SWEEP.md) |
| Read superseded/retired documents, with context | [`history/README.md`](./history/README.md) |

## Everything else at a glance

- Product capability matrix (live/partial/planned): [`../FEATURES.md`](../FEATURES.md)
- Project overview, quickstart, architecture diagram: [`../README.md`](../README.md)
- Version history: [`../CHANGELOG.md`](../CHANGELOG.md)
- Contribution rules and PR checklist: [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
- Code of conduct: [`../CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)

## Scope note for this release (Part 19)

This documentation set was written/rewritten in full during the release-engineering pass that
produced v0.1.0. The repository snapshot it was written against contains a small, real feature set
(lead intake + rule-based scoring + a dashboard) and **no prior documentation files** — no
`ARCHITECTURE.md`, `AUDIT-2026`, `SECURITY.md`, etc. existed beforehand in this working copy. Where
earlier planning material (e.g. an "Arena" starter template) left stale naming in the code, it was
corrected; see [`CONSISTENCY-SWEEP.md`](./CONSISTENCY-SWEEP.md) for the itemized list. Every
document below describes only what is in the code today, with roadmap items explicitly labeled as
such.
