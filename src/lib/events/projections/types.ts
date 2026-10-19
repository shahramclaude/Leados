// src/lib/events/projections/types.ts
//
// Shared contract for per-domain projectors. Each projector folds one
// event into its query-optimized table(s). Projectors must be:
//   - PURE w.r.t. the event + current projection state (no wall-clock
//     reads, no randomness) so `rebuildProjections()` reproduces the exact
//     same projection rows as the synchronous on-write path.
//   - IDEMPOTENT-safe: re-applying the same event twice (which cannot
//     happen in normal operation, but matters for rebuilds) must not
//     double-count anything, because rebuilds always truncate first.

import type { DbOrTx } from "@/db";
import type { LeadosEvent } from "../eventStore";

export interface Projector {
  name: string;
  /** Event types this projector folds. Used so the dispatcher only calls relevant projectors. */
  handles: (eventType: string) => boolean;
  apply: (tx: DbOrTx, event: LeadosEvent) => Promise<void>;
  /** Delete all rows this projector owns — used only by rebuildProjections(). */
  reset: (tx: DbOrTx) => Promise<void>;
}
