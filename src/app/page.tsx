import Link from "next/link";
import { db } from "@/db";
import { evidenceDocuments, meetings } from "@/db/schema";
import { sql } from "drizzle-orm";
import AskFollowUpButton from "@/components/AskFollowUpButton";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);
  const evidenceCount = (await db.select().from(evidenceDocuments)).length;
  const meetingRows = await db.select().from(meetings);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 42</p>
      <h1 className="mt-2 text-[clamp(2rem,5vw,3rem)] font-semibold leading-[1.05] text-slate-950">
        Conversational layer &amp; Meeting Copilot
      </h1>
      <p className="mt-4 max-w-2xl text-base text-slate-700">
        Ask LEADOS anything from anywhere (press <kbd className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">⌘K</kbd>).
        Every answer is grounded in evidence or explicitly refuses. Meeting Copilot drafts summaries, decisions, and
        actions from transcripts — nothing commits until a human confirms it.
      </p>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Q2 Revenue</p>
              <p className="mt-1 text-3xl font-semibold text-slate-950">$12.4M</p>
              <p className="mt-1 text-xs text-slate-500">Grounded in {evidenceCount} evidence documents</p>
            </div>
            <AskFollowUpButton prompt="What is our Q2 revenue and what is it based on?" />
          </div>
          <div className="mt-4 flex justify-end">
            <AskFollowUpButton prompt="And for Q3?" label="And for Q3?" />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Meetings</p>
              <p className="mt-1 text-3xl font-semibold text-slate-950">{meetingRows.length}</p>
              <p className="mt-1 text-xs text-slate-500">Pre / live / post copilot lifecycle</p>
            </div>
          </div>
          <Link
            href="/meetings"
            className="mt-4 inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white"
          >
            Open Meeting Room →
          </Link>
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white/50 p-6">
        <h2 className="text-sm font-semibold text-slate-900">Conversational touchpoints today</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Ask-LEADOS command palette (global, every page) — multi-turn, context-carrying, cite-or-refuse.</li>
          <li>Inline &quot;ask a follow-up&quot; chips on data surfaces (e.g. the revenue card above).</li>
          <li>Meeting Room: pre-meeting brief, live transcript capture seam, post-meeting confirmation workflow.</li>
        </ul>
      </section>
    </main>
  );
}
