import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, sessions, users } from "@/db/schema";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Privacy dashboard: "what's stored about me" (Part 19 Phase 2). Rendered
// server-side from the same queries /api/privacy/me exposes, so this page
// works even for users who disable JavaScript.
export default async function PrivacyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [profile] = await db
    .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, session.userId));

  const activeSessions = await db
    .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ip: sessions.ip, revokedAt: sessions.revokedAt })
    .from(sessions)
    .where(and(eq(sessions.userId, session.userId), isNull(sessions.revokedAt)));

  const relatedEvents = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.orgId, session.orgId), or(eq(auditLog.actorUserId, session.userId), eq(auditLog.resourceId, session.userId))))
    .limit(50);

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-950">Your data</h1>
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-medium text-slate-900">Profile</h2>
        <p className="mt-2 text-sm text-slate-600">
          {profile?.email} · role: {profile?.role} · member since {profile?.createdAt.toISOString().slice(0, 10)}
        </p>
      </section>
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-medium text-slate-900">Active sessions ({activeSessions.length})</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {activeSessions.map((s) => (
            <li key={s.id}>
              Session {s.id.slice(0, 8)} · started {s.createdAt.toISOString()} · last seen {s.lastSeenAt.toISOString()} · ip {s.ip ?? "unknown"}
              {s.id === session.sessionId ? " (this device)" : ""}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-medium text-slate-900">Audit events about you ({relatedEvents.length})</h2>
        <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto text-sm text-slate-600">
          {relatedEvents.map((e) => (
            <li key={e.id}>
              [{e.createdAt.toISOString()}] {e.action} on {e.resourceType}
              {e.resourceId ? `:${e.resourceId}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
