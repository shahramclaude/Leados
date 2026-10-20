import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { listOrganizations } from "@/lib/app/useCases/organizations/listOrganizations";
import { registerLeader } from "@/lib/app/useCases/leaders/registerLeader";

export const dynamic = "force-dynamic";

async function registerLeaderAction(formData: FormData) {
  "use server";

  await registerLeader({
    organizationId: String(formData.get("organizationId") ?? ""),
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? ""),
    email: String(formData.get("email") ?? ""),
    readinessInputs: {
      decisionLatencyDays: Number(formData.get("decisionLatencyDays") ?? 0),
      teamEngagementScore: Number(formData.get("teamEngagementScore") ?? 0),
      feedbackFrequencyPerMonth: Number(formData.get("feedbackFrequencyPerMonth") ?? 0),
    },
  });

  redirect("/leaders");
}

export default async function NewLeaderPage() {
  const organizations = await listOrganizations();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold text-slate-950">Register a leader</h1>
      <p className="mt-2 text-sm text-slate-600">
        Submits to <code>registerLeader()</code>, which calls the pure{" "}
        <code>computeReadiness()</code> domain engine before persisting.
      </p>

      {organizations.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Create an organization first on the{" "}
          <a href="/organizations" className="underline">
            Organizations
          </a>{" "}
          page.
        </p>
      ) : (
        <form action={registerLeaderAction} className="mt-8 space-y-5">
          <Field label="Organization">
            <select
              name="organizationId"
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Full name">
            <input name="name" required className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm" />
          </Field>

          <Field label="Role">
            <input name="role" required className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm" />
          </Field>

          <Field label="Email">
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm"
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Decision latency (days)">
              <input
                name="decisionLatencyDays"
                type="number"
                min={0}
                step="0.1"
                defaultValue={2}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm"
              />
            </Field>
            <Field label="Team engagement (0-100)">
              <input
                name="teamEngagementScore"
                type="number"
                min={0}
                max={100}
                defaultValue={70}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm"
              />
            </Field>
            <Field label="Feedback touchpoints / month">
              <input
                name="feedbackFrequencyPerMonth"
                type="number"
                min={0}
                step="0.1"
                defaultValue={2}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm"
              />
            </Field>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Register leader
          </button>
        </form>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
