import { db } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const FINDINGS: Array<{ area: string; risk: string; mitigation: string }> = [
  {
    area: "Decision governance (Part 23 records)",
    risk: "Major decisions could proceed without anyone checking stakeholder impact, reversibility, or fairness — concentrating judgment in whoever proposed it.",
    mitigation: "Ethical lens engine runs on every decision: stakeholders, harm/benefit, reversibility, fairness scan, red flags — always explained, never a silent block.",
  },
  {
    area: "Bulk visibility of individuals",
    risk: "Access grants or exports scoped as \"bulk\" let one role see many people's data at once with no distinct detector.",
    mitigation: "BULK_VISIBILITY_GRANT red flag + routing bulk exports through the T4 dual-control catalogue.",
  },
  {
    area: "People data without subject visibility",
    risk: "Data about people can be processed without those people ever knowing.",
    mitigation: "PEOPLE_DATA_NO_VISIBILITY red flag mandates a visibility/notice step or a documented, reviewed exception.",
  },
  {
    area: "Unilateral high-power actions",
    risk: "A single admin/CEO could export all people data or rewrite evaluation policy alone.",
    mitigation: "Dual-control (two-person rule) engine: self-approval is structurally blocked, not just discouraged.",
  },
  {
    area: "Suppressed dissent",
    risk: "Dissent on a decision could be hidden from the record to manufacture false consensus.",
    mitigation: "SUPPRESSED_DISSENT red flag + dissent fields are structurally visible; no UI path to hide them.",
  },
  {
    area: "No safe reporting channel",
    risk: "No way to raise concerns about power holders outside the management chain, with real confidentiality.",
    mitigation: "Ombudsman-grade safe channel: encryption at rest, access restricted to named roles only, every access logged + unauthorized attempts alerted.",
  },
  {
    area: "Retaliation after reporting",
    risk: "Reporters could face quiet retaliation with no systemic signal.",
    mitigation: "Aggregate-only anti-retaliation signal monitor — flags, never concludes.",
  },
  {
    area: "Conflicts of interest",
    risk: "Decision-makers close to a decision's outcome (e.g. a manager's own report) with no declared interest or recusal.",
    mitigation: "Conflict-of-interest registry with automated proximity warnings on the stakeholder graph.",
  },
  {
    area: "Anonymous dissent capture without protection",
    risk: "An anonymous suggestion channel that any manager can quietly delete defeats its own purpose.",
    mitigation: "Suppression attempts are structurally blocked for every single role; the only path to archive is two-person, non-destructive.",
  },
];

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.08)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Part 46 of 58</p>
        <h1 className="mt-3 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-slate-950">
          Ethics, Safe Channels &amp; Power Checks
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-700">
          This module finds and counters the places LEADOS could concentrate or amplify power without checks:
          unilateral high-power actions, bulk visibility of individuals, suppressed dissent, and missing safe
          reporting channels. It adds a structured ethical-lens review (decision support, never a moral verdict),
          an ombudsman-grade safe channel with confidentiality by construction, dual-control power checks, a
          conflict-of-interest registry with proximity warnings, and a dissent-preservation channel that no single
          role can suppress.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/ethics" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Ethics Review
          </Link>
          <Link href="/safe-channel" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Safe Channel
          </Link>
          <Link href="/power" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Power Dashboard
          </Link>
          <Link href="/dissent" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Suggestion / Whisper
          </Link>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-8 shadow-[0_24px_60px_rgba(16,24,40,0.08)]">
        <h2 className="text-xl font-semibold text-slate-950">Phase 0 — Discovery findings</h2>
        <p className="mt-2 text-sm text-slate-600">Every place power concentrates without a check, and this module&apos;s mitigation.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-4 font-medium">Area</th>
                <th className="py-2 pr-4 font-medium">Risk</th>
                <th className="py-2 font-medium">Mitigation in this module</th>
              </tr>
            </thead>
            <tbody>
              {FINDINGS.map((f) => (
                <tr key={f.area} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-4 font-medium text-slate-900">{f.area}</td>
                  <td className="py-3 pr-4 text-slate-700">{f.risk}</td>
                  <td className="py-3 text-slate-700">{f.mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-8 shadow-[0_24px_60px_rgba(16,24,40,0.08)]">
        <h2 className="text-xl font-semibold text-slate-950">Honesty rules this module enforces</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Ethical lenses are decision support — every review ships an explicit note that it is not a moral verdict.</li>
          <li>Safe-channel confidentiality is absolute: unauthorized access is always denied and always alerted, never silently allowed or silently dropped.</li>
          <li>Red flags never block silently — every mandatory review step comes with a plain-language reason.</li>
          <li>Anti-retaliation signals are flagged, never concluded.</li>
        </ul>
      </section>
    </div>
  );
}
