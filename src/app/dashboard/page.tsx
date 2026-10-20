import { redirect } from "next/navigation";
import { requireSession, UnauthorizedError } from "@/lib/platform/session";
import { listFindingsForSession } from "@/lib/app/findings";
import { getOrganizationById } from "@/lib/platform/db/orgsRepository";
import { getUserById } from "@/lib/platform/db/usersRepository";
import { Nav } from "@/components/Nav";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }

  const [findings, org, user] = await Promise.all([
    listFindingsForSession(session),
    getOrganizationById(session.orgId),
    getUserById(session.userId),
  ]);

  if (!org || !user) redirect("/login");

  return (
    <div className="pb-20 sm:pb-0">
      <Nav role={session.role} orgName={org.name} />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-6">
        <DashboardClient
          role={session.role}
          org={{ id: org.id, name: org.name, terminology: org.terminology, accentColor: org.accentColor }}
          user={{ name: user.name }}
          initialFindings={findings}
        />
      </main>
    </div>
  );
}
