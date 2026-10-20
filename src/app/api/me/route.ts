import { requireSession } from "@/lib/platform/session";
import { errorToResponse } from "@/lib/platform/authz";
import { getOrganizationById } from "@/lib/platform/db/orgsRepository";
import { getUserById } from "@/lib/platform/db/usersRepository";
import { permissionsFor } from "@/lib/domain/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const [org, user] = await Promise.all([
      getOrganizationById(session.orgId),
      getUserById(session.userId),
    ]);
    return Response.json({
      session,
      org,
      user,
      permissions: permissionsFor(session.role),
    });
  } catch (err) {
    return errorToResponse(err);
  }
}
