// Section C: turns org rows into retrievable text chunks, each carrying
// hard provenance (entity id / event id / timestamp) — never retrieval
// without a traceable source.
import type { EvidenceChunkT } from "@/lib/promptRegistry/common";

export function entityToChunk(row: { id: string; type: string; name: string; attributes: Record<string, unknown> }): EvidenceChunkT {
  const attrText = Object.entries(row.attributes)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
  return {
    id: `entity:${row.id}`,
    kind: "entity",
    text: `Entity "${row.name}" (${row.type}).${attrText ? ` Attributes: ${attrText}.` : ""}`,
  };
}

export function eventToChunk(row: {
  id: string;
  entityName: string | null;
  type: string;
  summary: string;
  occurredAt: Date;
}): EvidenceChunkT {
  return {
    id: `event:${row.id}`,
    kind: "event",
    text: `[${row.type}] ${row.entityName ? `${row.entityName}: ` : ""}${row.summary}`,
    timestamp: row.occurredAt.toISOString(),
  };
}

export function metricToChunk(row: {
  id: string;
  entityName: string | null;
  name: string;
  value: string;
  unit: string;
  asOf: Date;
}): EvidenceChunkT {
  return {
    id: `metric:${row.id}`,
    kind: "metric",
    text: `${row.entityName ?? "Org-wide"} metric "${row.name}" = ${row.value}${row.unit !== "number" ? ` ${row.unit}` : ""} as of ${row.asOf.toISOString().slice(0, 10)}.`,
    timestamp: row.asOf.toISOString(),
  };
}

export function docToChunk(row: { id: string; title: string; body: string; updatedAt: Date }): EvidenceChunkT {
  return {
    id: `doc:${row.id}`,
    kind: "doc",
    text: `${row.title}: ${row.body}`,
    timestamp: row.updatedAt.toISOString(),
  };
}

export function memoryNoteToChunk(row: { id: string; title: string; body: string; createdAt: Date }): EvidenceChunkT {
  return {
    id: `memory_note:${row.id}`,
    kind: "memory_note",
    text: `${row.title}: ${row.body}`,
    timestamp: row.createdAt.toISOString(),
  };
}
