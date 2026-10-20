import { redirect } from "next/navigation";
import { requireSession, UnauthorizedError } from "@/lib/platform/session";
import { can } from "@/lib/domain/rbac";
import { getOrganizationById } from "@/lib/platform/db/orgsRepository";
import { listFlags } from "@/lib/platform/db/featureFlagsRepository";
import { Nav } from "@/components/Nav";
import { AccessDenied } from "@/components/AccessDenied";
import { SettingsClient } from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }

  const org = await getOrganizationById(session.orgId);
  if (!org) redirect("/login");

  if (!can(session.role, "settings:view")) {
    return (
      <div>
        <Nav role={session.role} orgName={org.name} />
        <AccessDenied role={session.role} />
      </div>
    );
  }

  const flags = await listFlags(session.orgId);

  return (
    <div className="pb-20 sm:pb-0">
      <Nav role={session.role} orgName={org.name} />
      <main id="main-content" className="mx-auto max-w-2xl px-4 py-6">
        <SettingsClient role={session.role} org={org} flags={flags} />
      </main>
    </div>
  );
}
