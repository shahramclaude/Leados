import { resolveViewer } from "@/lib/platform/auth";
import { peopleRepository } from "@/lib/platform/db/peopleRepository";
import { redact } from "@/lib/domain/people/privacy";
import { eventsRepository } from "@/lib/platform/db/eventsRepository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = resolveViewer(request);
  const people = await peopleRepository.list();

  const redacted = people.map((p) => {
    const { value } = redact(viewer, p.id, p as unknown as Record<string, unknown>, {
      compaRatio: "compaRatio",
      skills: "skillsAndGoals",
      goals: "skillsAndGoals",
    });
    return value;
  });

  return Response.json({ people: redacted });
}

export async function POST(request: Request) {
  const viewer = resolveViewer(request);
  if (viewer.role !== "hr") {
    return Response.json({ error: "Only HR may create a person record." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Request body must be JSON." }, { status: 400 });

  const { displayName, email, title, teamId, managerId, hireDate, location, compaRatio, skills, goals } = body;
  if (!displayName || !email || !title || !hireDate || !location) {
    return Response.json({ error: "displayName, email, title, hireDate, location are required." }, { status: 400 });
  }

  const person = await peopleRepository.create({
    displayName,
    email,
    title,
    teamId: teamId ?? null,
    managerId: managerId ?? null,
    hireDate,
    location,
    compaRatio: compaRatio ?? null,
    skills: skills ?? [],
    goals: goals ?? [],
  });

  await eventsRepository.record({
    type: "person.hired",
    version: 1,
    subjectId: person.id,
    actorId: viewer.id,
    payload: { personId: person.id, title: person.title, teamId: person.teamId, managerId: person.managerId, hireDate: person.hireDate },
  });

  return Response.json({ person }, { status: 201 });
}
