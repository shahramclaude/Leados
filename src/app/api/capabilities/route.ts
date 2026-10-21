// Lists registered capabilities. There is deliberately no POST handler here
// (or anywhere else) that can register or invoke a capability by raw string
// at runtime — the registry is populated only by `bootstrap.ts` at import
// time. This route is read-only by construction.
import "@/lib/kernel/bootstrap";
import { listCapabilities } from "@/lib/kernel/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const caps = listCapabilities().map((c) => ({
    name: c.name,
    riskClass: c.riskClass,
    requiredScope: c.requiredScope,
    hasCompensation: Boolean(c.compensate),
    hasVerify: Boolean(c.verify),
  }));
  return Response.json({ capabilities: caps });
}
