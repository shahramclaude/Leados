import { db } from "@/db";
import * as s from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, Badge } from "@/components/Shell";

export const dynamic = "force-dynamic";

const READING_TIME_CAP_SEC = 60;

export default async function BriefingsPage() {
  const briefings = await db.select().from(s.briefings).orderBy(desc(s.briefings.createdAt));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 96</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Context-Aware Omnichannel Briefings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Mobile-first briefing cards with a hard reading-time cap ({READING_TIME_CAP_SEC}s) &mdash; over-budget
          briefings must trim their lowest-priority items before delivery.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {briefings.map((b) => {
          const overBudget = b.readingTimeSec > READING_TIME_CAP_SEC;
          const items = [...b.items].sort((a, c) => a.priority - c.priority);
          const shown = overBudget ? items.slice(0, Math.max(1, Math.floor(items.length * (READING_TIME_CAP_SEC / b.readingTimeSec)))) : items;
          return (
            <Card key={b.id} title={`${b.trigger} briefing for ${b.forUser}`}>
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <Badge tone="indigo">{b.channel}</Badge>
                <span>{b.readingTimeSec}s read{overBudget ? " (trimmed to fit cap)" : ""}</span>
              </div>
              <ol className="space-y-2 text-sm">
                {shown.map((item, i) => (
                  <li key={i} className="rounded-lg border border-slate-100 p-2">
                    <Badge tone="slate">{item.kind}</Badge>
                    <p className="mt-1">{item.content}</p>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
        {briefings.length === 0 && <p className="text-sm text-slate-500">No briefings generated yet.</p>}
      </div>
    </div>
  );
}
