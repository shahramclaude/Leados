import { resolveViewer } from "@/lib/platform/auth";
import { peopleRepository } from "@/lib/platform/db/peopleRepository";
import { accessAuditRepository } from "@/lib/platform/db/accessAuditRepository";
import { canView } from "@/lib/domain/people/privacy";
import { computeFlightRisk } from "@/lib/domain/people/flightRisk";
import { buildFlightRiskInputs } from "@/lib/app/people/signals";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const allowed = canView(viewer, personId, "flightRiskScore");

  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "person.flightRisk",
    fieldsRedacted: allowed ? [] : ["flightRisk"],
    allowed,
    reason: allowed
      ? "Manager/HR/exec may view flight-risk estimates."
      : "Flight-risk estimates are manager/HR/exec-facing only; see the transparency endpoint for what the subject is entitled to know.",
  });

  if (!allowed) return Response.json({ error: "forbidden" }, { status: 403 });

  const person = await peopleRepository.getById(personId);
  if (!person) return Response.json({ error: "not_found" }, { status: 404 });

  const inputs = await buildFlightRiskInputs(person);
  const score = computeFlightRisk(inputs);
  return Response.json({ score });
}
