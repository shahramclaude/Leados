import { db } from "@/db";
import { signals } from "@/db/schema";
import { desc } from "drizzle-orm";
import { createSignal, deleteSignal, updateSignalStatus } from "@/lib/actions";
import { Badge, Card, EmptyState, PageHeader, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const SEVERITY_OPTIONS = ["low", "medium", "high", "critical"] as const;
const STATUS_OPTIONS = ["new", "investigating", "resolved", "dismissed"] as const;

export default async function SignalsPage() {
  const rows = await db.select().from(signals).orderBy(desc(signals.detectedAt));

  return (
    <div>
      <PageHeader
        title="Signals"
        description="Early-warning intelligence: weak signals and emerging risks worth leadership attention."
      />

      <Card className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Log a new signal</h2>
        <form action={createSignal} className="grid gap-4 sm:grid-cols-2">
          <input name="title" required placeholder="Signal title" className="input sm:col-span-2" />
          <input name="source" required placeholder="Source (e.g. market, internal, customer)" className="input" />
          <select name="severity" defaultValue="medium" className="input">
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <textarea name="description" placeholder="Description" className="input sm:col-span-2" rows={2} />
          <button type="submit" className="btn-primary sm:col-span-2">
            Log signal
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState message="No signals captured yet." />
      ) : (
        <div className="space-y-4">
          {rows.map((signal) => (
            <Card key={signal.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{signal.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Source: {signal.source} · Detected {fmtDate(signal.detectedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge value={signal.severity} />
                  <Badge value={signal.status} />
                </div>
              </div>
              {signal.description ? <p className="mt-3 text-sm text-slate-700">{signal.description}</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <form action={updateSignalStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={signal.id} />
                  <select name="status" defaultValue={signal.status} className="input-sm">
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-secondary">
                    Update
                  </button>
                </form>
                <form action={deleteSignal}>
                  <input type="hidden" name="id" value={signal.id} />
                  <button type="submit" className="btn-danger">
                    Delete
                  </button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
