// GET /api/employees — a bare directory (id/name/title/teamId only, nothing
// evaluative) used by UI pickers. No PeopleScope check needed: this is the
// org chart, not a performance surface.
import { listEmployees } from "@/lib/people/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const employees = await listEmployees();
    return Response.json({ employees });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
