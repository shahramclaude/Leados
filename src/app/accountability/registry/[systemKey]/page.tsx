import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { algoSystems } from "@/db/schema";
import { getModelCardsForSystem } from "@/lib/accountability/modelCards";
import { getLatestChecksForSystem } from "@/lib/accountability/monitoring";
import { getFairnessReportsForSystem } from "@/lib/accountability/fairness";
import { getChain, verifyChain } from "@/lib/accountability/auditChain";
import { getLatestAssessment } from "@/lib/accountability/assessments";
import { checkTierConsistency } from "@/lib/accountability/riskTiers";
import type { ActionTier, DecisionRole, RegulatoryTier } from "@/lib/accountability/types";
import {
  ActionTierBadge,
  AssessmentStatusBadge,
  DecisionRoleBadge,
  RegulatoryTierBadge,
  StatusBadge,
} from "@/components/accountability/badges";

export const dynamic = "force-dynamic";

export default async function RegistryDetailPage({ params }: { params: Promise<{ systemKey: string }> }) {
  const { systemKey } = await params;
  const [system] = await db.select().from(algoSystems).where(eq(algoSystems.systemKey, systemKey));
  if (!system) notFound();

  const [cards, checks, fairness, chain, verification, assessment] = await Promise.all([
    getModelCardsForSystem(systemKey),
    getLatestChecksForSystem(systemKey),
    getFairnessReportsForSystem(systemKey),
    getChain(systemKey),
    verifyChain(systemKey),
    getLatestAssessment(systemKey),
  ]);

  const tierIssues = checkTierConsistency({
    systemId: system.systemKey,
    actionTier: system.actionTier as ActionTier,
    regulatoryTier: system.regulatoryTier as RegulatoryTier,
    decisionRole: system.decisionRole as DecisionRole,
    requiresHumanReview: system.requiresHumanReview,
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/accountability" className="text-sm text-slate-500 hover:underline">
        ← Accountability Console
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{system.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{system.systemKey}</p>
        </div>
        <div className="flex gap-2">
          <DecisionRoleBadge role={system.decisionRole} />
          <ActionTierBadge tier={system.actionTier} />
          <RegulatoryTierBadge tier={system.regulatoryTier} />
        </div>
      </div>

      <Section title="Purpose & scope">
        <p className="text-sm text-slate-700">{system.purpose}</p>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
          <Field label="Affects">{system.affectedParties}</Field>
          <Field label="Owner">{system.owner}</Field>
          <Field label="Source module">
            <code className="text-xs">{system.sourceModule}</code>
          </Field>
          <Field label="Inputs">{(system.inputs as string[]).join(", ")}</Field>
          <Field label="Outputs">{(system.outputs as string[]).join(", ")}</Field>
          <Field label="Opt-out">
            {system.optOutAllowed ? "Allowed" : "Not permitted"} — {system.optOutLimits}
          </Field>
        </dl>
      </Section>

      <Section title="Human oversight">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
          <Field label="Owner">{system.oversightOwner}</Field>
          <Field label="Method">{system.oversightMethod}</Field>
          <Field label="Training notes">{system.oversightTrainingNotes}</Field>
        </dl>
        {system.requiresHumanReview ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            This is a T4 automated action — every decision requires mandatory human sign-off (see Oversight Queue).
          </p>
        ) : null}
      </Section>

      <Section title="Risk-tier consistency">
        {tierIssues.length === 0 ? (
          <p className="text-sm text-emerald-700">
            Consistent: actionTier {system.actionTier} correctly maps to regulatoryTier &ldquo;{system.regulatoryTier}&rdquo;,
            and decisionRole/automation rules are satisfied.
          </p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-rose-700">
            {tierIssues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Model cards">
        {cards.length === 0 ? (
          <p className="text-sm text-slate-500">No model cards on file.</p>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div key={card.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">
                    {card.name} <span className="text-slate-400">v{card.version}</span>
                  </span>
                </div>
                <p className="mt-1 text-slate-700">{card.summary}</p>
                <p className="mt-1 text-xs text-slate-500">Training data: {card.trainingData}</p>
                <p className="mt-1 text-xs text-amber-700">Known limitations: {card.limitations}</p>
                <p className="mt-1 text-xs text-slate-500">Metrics: {JSON.stringify(card.metrics)}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Monitoring health (Part 38)">
        {checks.length === 0 ? (
          <p className="text-sm text-slate-500">No monitoring checks on file.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {checks.map((check) => (
              <li key={check.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div>
                  <span className="font-mono text-xs text-slate-500">{check.checkId}</span>
                  <span className="ml-2 text-slate-700">{check.checkType}</span>
                </div>
                <StatusBadge status={check.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Fairness reports (Part 09)">
        {fairness.length === 0 ? (
          <p className="text-sm text-slate-500">No fairness reports on file for this system.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {fairness.map((report) => (
              <li key={report.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{report.metric}</span>
                  <span className={report.passed ? "text-emerald-700" : "text-rose-700"}>
                    {report.passed ? "PASS" : "FAIL"} — ratio {report.disparityRatio} (threshold {report.threshold})
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {report.groupA}: {report.valueA} vs {report.groupB}: {report.valueB}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Impact assessment (Part 56)">
        {assessment ? (
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <AssessmentStatusBadge status={assessment.status} />
              <span className="text-slate-500">v{assessment.version}, triggered by {assessment.triggeredBy}</span>
            </div>
            <Link
              href={`/accountability/assessments/${system.systemKey}`}
              className="mt-2 inline-block text-indigo-700 hover:underline"
            >
              Open in Impact Assessment Studio →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-rose-700">No impact assessment on file — this is a gap.</p>
        )}
      </Section>

      <Section title="Audit chain (Part 19)">
        <p className="text-sm text-slate-700">
          {chain.length} entries. Integrity check:{" "}
          <span className={verification.valid ? "text-emerald-700" : "text-rose-700"}>
            {verification.valid ? "VALID" : `BROKEN at seq ${verification.brokenAtSeq}`}
          </span>
        </p>
        <ol className="mt-3 space-y-1 text-xs text-slate-600">
          {chain.slice(-8).map((entry) => (
            <li key={entry.id} className="flex justify-between gap-4 border-b border-dashed border-slate-200 py-1">
              <span>
                #{entry.seq} {entry.action} <span className="text-slate-400">by {entry.actorId}</span>
              </span>
              <span className="font-mono">{entry.createdAt.toISOString()}</span>
            </li>
          ))}
        </ol>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-slate-800">{children}</dd>
    </div>
  );
}
