// GET  /api/capabilities — the full capability registry + any admin overrides.
// POST /api/capabilities — { key, enabled?, mode?, dailyBudget?, actor }
import { ensureBuiltinCapabilitiesRegistered } from "@/lib/kernel/capabilities";
import { listCapabilities } from "@/lib/kernel/registry";
import { listCapabilityOverrides, setCapabilityOverride } from "@/lib/kernel/killSwitch";
import { recordAudit } from "@/lib/kernel/audit";

export const dynamic = "force-dynamic";

ensureBuiltinCapabilitiesRegistered();

export async function GET() {
  const capabilities = listCapabilities().map((c) => ({
    key: c.key,
    description: c.description,
    domain: c.domain,
    riskClass: c.riskClass,
    defaultMode: c.defaultMode,
    permissionScope: c.permissionScope,
  }));
  const overrides = await listCapabilityOverrides();
  return Response.json({ ok: true, capabilities, overrides });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { key, enabled, mode, dailyBudget, actor } = body ?? {};
  if (!key) return Response.json({ ok: false, error: "key is required" }, { status: 400 });

  const row = await setCapabilityOverride(key, { enabled, mode, dailyBudget }, actor ?? "human:unknown");
  await recordAudit({
    actor: actor ?? "human:unknown",
    action: "capability.override_set",
    subjectType: "capability",
    subjectId: key,
    reason: `enabled=${enabled} mode=${mode} dailyBudget=${dailyBudget}`,
    riskClass: "medium",
  });
  return Response.json({ ok: true, override: row });
}
