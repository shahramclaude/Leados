import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org-context";
import { listRecords } from "@/lib/repo/engineRecords";
import { canAccessDomain } from "@/lib/rbac";
import { t } from "@/lib/i18n";
import { EngineRecordCard } from "@/components/EngineRecordCard";
import { AddDemoRecordButton } from "@/components/AddDemoRecordButton";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/");

  const actor = { role: ctx.role, scopes: ctx.scopes };
  const canRead = canAccessDomain(actor, "finance", "read");
  const canWrite = canAccessDomain(actor, "finance", "write");
  const label = ctx.org.terminology.finance || t(ctx.locale, "domain.finance");

  if (!canRead) {
    return <p className="lx-muted text-sm text-slate-600">You do not have access to {label}.</p>;
  }

  const records = await listRecords(ctx.orgId, { domain: "finance" });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-950">{label}</h1>
        {canWrite && <AddDemoRecordButton orgId={ctx.orgId} domain="finance" />}
      </div>
      <ul className="grid gap-3">
        {records.map((record) => (
          <EngineRecordCard key={record.id} record={record} canWrite={canWrite} />
        ))}
        {records.length === 0 && <li className="lx-muted text-sm text-slate-500">{t(ctx.locale, "common.noResults")}</li>}
      </ul>
    </div>
  );
}
