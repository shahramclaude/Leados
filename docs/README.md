# `docs/` — read this first

**Start at [INDEX.md](INDEX.md).** It separates the documentation that describes the LeadOS app
from the archive that describes the quarantined pre-ADR-0006 system.

The one thing to know before opening anything else here: LeadOS is `index.html` + `app/**`, a
zero-build browser application served by `npm run app`. The `src/**` Next.js/PostgreSQL tree is
frozen history — see [LEGACY-TREES.md](LEGACY-TREES.md) — and any page in this directory that tells
you to run `db:push`, set `DATABASE_URL`, or open port 3000 is describing that frozen tree. Those
pages carry a "Historic" banner; none of their commands work here.

- Onboarding and architecture → [../CONTRIBUTING.md](../CONTRIBUTING.md)
- Decisions → [adr/INDEX.md](adr/INDEX.md)
- Quarantine and enforcement → [LEGACY-TREES.md](LEGACY-TREES.md)
