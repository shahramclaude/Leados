import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org-context";
import { listAudit, listFlags } from "@/lib/repo/featureFlags";
import { FlagsManager } from "@/components/FlagsManager";

export const dynamic = "force-dynamic";

export default async function FlagsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/");
  if (ctx.role !== "Admin") {
    return <p className="lx-muted text-sm text-slate-600">Admin access required.</p>;
  }

  const [flags, audit] = await Promise.all([listFlags(ctx.orgId), listAudit(ctx.orgId)]);

  return (
    <FlagsManager
      flags={flags.map((f) => ({ id: f.id, key: f.key, enabled: f.enabled, updatedAt: f.updatedAt.toISOString() }))}
      audit={audit.map((a) => ({ id: a.id, flagKey: a.flagKey, action: a.action, createdAt: a.createdAt.toISOString() }))}
    />
  );
}
