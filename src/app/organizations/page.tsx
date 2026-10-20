import { revalidatePath } from "next/cache";
import { createOrganization } from "@/lib/app/useCases/organizations/createOrganization";
import { listOrganizations } from "@/lib/app/useCases/organizations/listOrganizations";

export const dynamic = "force-dynamic";

async function createOrganizationAction(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "");
  await createOrganization({ name });
  revalidatePath("/organizations");
}

export default async function OrganizationsPage() {
  const organizations = await listOrganizations();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-semibold text-slate-950">Organizations</h1>
      <p className="mt-2 text-sm text-slate-600">
        Backed by <code>organizationRepository</code> and the <code>organizations</code> table.
      </p>

      <form action={createOrganizationAction} className="mt-8 flex max-w-md gap-3">
        <input
          name="name"
          required
          placeholder="Organization name"
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <button
          type="submit"
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Add organization
        </button>
      </form>

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {organizations.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No organizations yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {organizations.map((org) => (
              <li key={org.id} className="flex items-center justify-between px-6 py-4 text-sm">
                <span className="font-medium text-slate-900">{org.name}</span>
                <span className="text-slate-500">
                  {new Date(org.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
