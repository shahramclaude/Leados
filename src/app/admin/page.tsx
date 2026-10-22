import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { getSession } from "@/lib/session";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") {
    return (
      <main className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">Not available</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your role (<strong>{session.role}</strong>) can&apos;t access admin settings — only <strong>admin</strong> can.
          Ask an admin in your organization if you need a setting changed.
        </p>
      </main>
    );
  }

  const orgUsers = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.orgId, session.orgId));

  const events = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, session.orgId))
    .orderBy(desc(auditLog.seq))
    .limit(100);

  return <AdminPanel users={orgUsers} initialEvents={events} currentUserId={session.userId} />;
}
