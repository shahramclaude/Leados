import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { computeEventHash } from "@/lib/platform/events/envelope";

export const dynamic = "force-dynamic";

export default async function AdminEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
  if (rows.length === 0) notFound();
  const event = rows[0];

  const recomputedHash = computeEventHash(event.prevHash, {
    eventId: event.id,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    orgId: event.orgId,
    entityType: event.entityType,
    entityId: event.entityId,
    occurredAt: new Date(event.occurredAt).toISOString(),
    recordedAt: new Date(event.recordedAt).toISOString(),
    correlationId: event.correlationId,
    causationId: event.causationId,
    idempotencyKey: event.idempotencyKey,
    payload: event.payload,
    seq: event.seq,
  });
  const hashMatches = recomputedHash === event.hash;

  let predecessor = null;
  if (event.prevHash) {
    const prevRows = await db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.orgId, event.orgId), eq(schema.events.hash, event.prevHash)))
      .limit(1);
    predecessor = prevRows[0] ?? null;
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link className="text-sm text-indigo-600 hover:underline" href={`/admin/events?orgId=${event.orgId}`}>
          ← Back to event log
        </Link>
        <h1 className="text-2xl font-semibold text-slate-950">Event {event.id}</h1>

        <section className={`rounded-2xl border p-4 text-sm ${hashMatches ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          <p className="font-medium">{hashMatches ? "✓ Hash chain verified" : "✗ Hash mismatch — chain is broken or tampered"}</p>
          <p className="mt-1 font-mono text-xs break-all">stored: {event.hash}</p>
          <p className="font-mono text-xs break-all">recomputed: {recomputedHash}</p>
          {event.prevHash && <p className="mt-1 text-xs">predecessor {predecessor ? "found in log ✓" : "NOT FOUND ✗"}</p>}
        </section>

        <section className="grid grid-cols-2 gap-4 rounded-2xl bg-white p-6 shadow-sm text-sm">
          <Field label="Event type" value={event.eventType} />
          <Field label="Schema version" value={String(event.schemaVersion)} />
          <Field label="Org" value={event.orgId} />
          <Field label="Entity" value={`${event.entityType} / ${event.entityId}`} />
          <Field label="Actor" value={`${event.actorKind}: ${event.actorDisplayName} (${event.actorId})`} />
          <Field label="Seq" value={String(event.seq)} />
          <Field label="Occurred at (business time)" value={new Date(event.occurredAt).toISOString()} />
          <Field label="Recorded at (system time)" value={new Date(event.recordedAt).toISOString()} />
          <Field label="Correlation id" value={event.correlationId} />
          <Field label="Causation id" value={event.causationId ?? "—"} />
          <Field label="Idempotency key" value={event.idempotencyKey} />
        </section>

        <section className="rounded-2xl bg-slate-950 p-6 shadow-sm">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Payload</p>
          <pre className="overflow-x-auto text-xs text-emerald-300">{JSON.stringify(event.payload, null, 2)}</pre>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 break-all font-mono text-xs text-slate-800">{value}</p>
    </div>
  );
}
