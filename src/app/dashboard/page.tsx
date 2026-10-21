import { requireSession } from "@/lib/pageAuth";
import { NavBar } from "@/components/NavBar";

export default async function DashboardPage() {
  const session = await requireSession("/dashboard");

  return (
    <div>
      <NavBar email={session.email || session.userId} role={session.role} />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Your session</h2>
            <dl className="mt-2 space-y-1 text-sm text-slate-600">
              <div>
                <dt className="inline font-medium">Role: </dt>
                <dd className="inline">{session.role}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Org: </dt>
                <dd className="inline font-mono text-xs">{session.orgId}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Security posture</h2>
            <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
              <li>Idle timeout 30 min, absolute timeout 12 h</li>
              <li>Every mutation requires a CSRF token</li>
              <li>Every read/write of people data is audit-logged</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
