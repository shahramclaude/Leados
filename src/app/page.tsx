import Link from "next/link";
import { listPeople } from "@/lib/people";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const people = await listPeople();
  const members = people.filter((p) => p.role === "member");
  const managers = people.filter((p) => p.role === "manager");
  const admins = people.filter((p) => p.role === "admin");

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-500">Part 43</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">My Growth, 1:1s, Feedback &amp; Coaching</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Everything here is <strong>developmental, never evaluative</strong>. No coaching transcript, journal
            entry, or raw feedback response ever feeds a performance system. Every surface below states exactly
            who can see what.
          </p>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-3">
          <PersonColumn title="Members — My Growth view" people={members} roleHint="person" />
          <PersonColumn title="Managers — 1:1 &amp; nudges" people={managers} roleHint="manager" />
          <PersonColumn title="Admin — org fairness only" people={admins} roleHint="admin" />
        </section>

        <section className="mt-8 rounded-2xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">
          <h2 className="text-base font-semibold text-slate-900">How to explore</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Open <strong>Group A Member 1</strong> for the fullest walkthrough: growth goals, evidence,
              recommendations, a completed GROW coaching session, and 360 feedback.
            </li>
            <li>
              Open <strong>Morgan Rivera</strong>&apos;s manager view for Group A Member 1 to see the symmetry rule in
              action — only what that person chose to share.
            </li>
            <li>
              Open the <Link className="underline" href="/admin/fairness">fairness report</Link> as the admin to see
              coaching-access and feedback-distribution audits with sample sizes.
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}

function PersonColumn({
  title,
  people,
  roleHint,
}: {
  title: string;
  people: Awaited<ReturnType<typeof listPeople>>;
  roleHint: "person" | "manager" | "admin";
}) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <ul className="mt-3 space-y-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-700">{p.name}</span>
            {roleHint === "admin" ? (
              <Link href="/admin/fairness" className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                Fairness report
              </Link>
            ) : roleHint === "manager" ? (
              <ManagerLinks managerId={p.id} />
            ) : (
              <Link
                href={`/dashboard/${p.id}`}
                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
              >
                My Growth
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function ManagerLinksData(managerId: string) {
  const people = await listPeople();
  return people.filter((p) => p.managerId === managerId);
}

async function ManagerLinks({ managerId }: { managerId: string }) {
  const reports = await ManagerLinksData(managerId);
  const first = reports[0];
  if (!first) return <span className="text-xs text-slate-400">No reports</span>;
  return (
    <Link href={`/manager/${managerId}/${first.id}`} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
      View 1:1 for {first.name.split(" ")[0]}
    </Link>
  );
}
