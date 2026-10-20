import { redirect } from "next/navigation";
import { requireSession, UnauthorizedError } from "@/lib/platform/session";
import { can } from "@/lib/domain/rbac";
import { getOrganizationById } from "@/lib/platform/db/orgsRepository";
import { Nav } from "@/components/Nav";
import { AccessDenied } from "@/components/AccessDenied";
import { PermissionsMatrix } from "@/components/PermissionsMatrix";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }

  const org = await getOrganizationById(session.orgId);
  if (!org) redirect("/login");

  if (!can(session.role, "permissions:view")) {
    return (
      <div>
        <Nav role={session.role} orgName={org.name} />
        <AccessDenied role={session.role} />
      </div>
    );
  }

  return (
    <div className="pb-20 sm:pb-0">
      <Nav role={session.role} orgName={org.name} />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Permissions</h1>
        <div className="mt-4">
          <PermissionsMatrix />
        </div>
      </main>
    </div>
  );
}
