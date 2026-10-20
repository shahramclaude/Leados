// Projector: manufacturingThroughput — heterogeneous: batches (entityId =
// batchId) and per-line downtime totals (entityId = line name).
// Consumes: manufacturing.batch_started, manufacturing.batch_completed,
//           manufacturing.downtime_logged.
import type { Projector } from "../engine";

export type ManufacturingThroughputState =
  | { kind: "unknown" }
  | {
      kind: "batch";
      batchId: string;
      line: string;
      sku: string;
      plannedUnits: number;
      actualUnits: number | null;
      defectUnits: number | null;
      status: "running" | "done";
    }
  | { kind: "line_downtime"; line: string; totalMinutes: number; lastCause: string | null };

const initial: ManufacturingThroughputState = { kind: "unknown" };

export const manufacturingThroughputProjector: Projector<ManufacturingThroughputState> = {
  name: "manufacturingThroughput",
  interestedIn: ["manufacturing.batch_started", "manufacturing.batch_completed", "manufacturing.downtime_logged"],
  initial,
  apply(state, e) {
    switch (e.type) {
      case "manufacturing.batch_started": {
        const p = e.payload as { batchId: string; line: string; sku: string; plannedUnits: number };
        return {
          kind: "batch",
          batchId: p.batchId,
          line: p.line,
          sku: p.sku,
          plannedUnits: p.plannedUnits,
          actualUnits: null,
          defectUnits: null,
          status: "running",
        };
      }
      case "manufacturing.batch_completed": {
        if (state.kind !== "batch") return state;
        const p = e.payload as { actualUnits: number; defectUnits: number };
        return { ...state, actualUnits: p.actualUnits, defectUnits: p.defectUnits, status: "done" };
      }
      case "manufacturing.downtime_logged": {
        const p = e.payload as { minutes: number; cause: string };
        const prevMinutes = state.kind === "line_downtime" ? state.totalMinutes : 0;
        return { kind: "line_downtime", line: e.entityId, totalMinutes: prevMinutes + p.minutes, lastCause: p.cause };
      }
      default:
        return state;
    }
  },
};
