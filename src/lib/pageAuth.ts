// Server-component auth guards for pages (separate from secureRoute, which
// guards API routes). Both ultimately call the same `getSession()` so there
// is one source of truth for "who is logged in."
import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/session";
import { roleHasPermission, type Permission } from "@/lib/authz/permissions";

export async function requireSession(nextPath: string): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}

export async function requirePagePermission(nextPath: string, permission: Permission): Promise<SessionUser> {
  const session = await requireSession(nextPath);
  if (!roleHasPermission(session.role, permission)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}
