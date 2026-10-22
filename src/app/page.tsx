import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org-context";
import { aggregateByDomain, listRecords } from "@/lib/repo/engineRecords";
import { t } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { weekStartsOn } from "@/lib/time";
import { GetStartedButton } from "@/components/GetStartedButton";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { EngineRecordCard } from "@/components/EngineRecordCard";
import { canAccessDomain } from "@/lib/rbac";
import type { DomainScope } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function NowPage() {
  const ctx = await getOrgContext();

  if (!ctx) {
    return (
      <main className="grid min-h-[70vh] place-items-center px-6 py-12 text-center">
        <section className="lx-surface max-w-xl rounded-3xl border border-slate-200 bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
          <p className="text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-950">Now. People. Finance. Strategy.</h1>
          <p className="mt-3 text-slate-600">
            Spin up a demo workspace with two isolated organizations (English + Danish) to explore tenancy, RBAC
            and offline sync.
          </p>
          <div className="mt-6 flex justify-center">
            <GetStartedButton />
          </div>
        </section>
      </main>
    );
  }

  if (!ctx.org.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const [aggregate, records] = await Promise.all([
    aggregateByDomain(ctx.orgId),
    listRecords(ctx.orgId, { type: "briefing" }),
  ]);

  const seededTotal = aggregate.reduce((sum, a) => sum + a.seeded, 0);
  const locale = ctx.locale;
  const todayLabel = formatDate(locale, new Date());
  const weekStart = weekStartsOn(locale) === 1 ? "Monday" : "Sunday";

  const domainLabel = (domain: DomainScope) =>
    domain === "people"
      ? ctx.org.terminology.people || t(locale, "domain.people")
      : domain === "finance"
        ? ctx.org.terminology.finance || t(locale, "domain.finance")
        : domain === "strategy"
          ? ctx.org.terminology.strategy || t(locale, "domain.strategy")
          : t(locale, "domain.operations");

  return (
    <div>
      <OnboardingBanner seededCount={seededTotal} />

      <header className="mb-6">
        <p className="text-sm font-medium text-slate-500">{todayLabel}</p>
        <h1 className="text-2xl font-bold text-slate-950">{t(locale, "nav.now")}</h1>
        <p className="lx-muted mt-1 text-sm text-slate-600">
          Week starts {weekStart} in this locale — layouts and date math follow suit automatically.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {aggregate.map((a) => (
          <div key={a.domain} className="lx-surface rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-500">{domainLabel(a.domain)}</p>
            <p className="mt-1 text-3xl font-bold text-slate-950">{a.total}</p>
            {a.seeded > 0 && <p className="lx-muted text-xs text-indigo-700">{a.seeded} sample</p>}
          </div>
        ))}
        {aggregate.length === 0 && <p className="lx-muted text-sm text-slate-500">{t(locale, "common.noResults")}</p>}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Briefings</h2>
        <ul className="mt-3 grid gap-3">
          {records.map((record) => (
            <EngineRecordCard key={record.id} record={record} canWrite={canAccessDomain({ role: ctx.role, scopes: ctx.scopes }, record.domain, "write")} />
          ))}
          {records.length === 0 && <li className="lx-muted text-sm text-slate-500">{t(locale, "common.noResults")}</li>}
        </ul>
      </section>
    </div>
  );
}
