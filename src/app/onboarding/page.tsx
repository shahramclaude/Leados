import { completeOnboarding, getOnboardingStatus } from "@/lib/app/onboarding";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function completeAction(formData: FormData) {
  "use server";
  const orgName = String(formData.get("orgName") ?? "");
  await completeOnboarding(orgName);
  revalidatePath("/onboarding");
}

export default async function OnboardingPage() {
  const status = await getOnboardingStatus();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Onboarding</h1>

      {status.completed ? (
        <p data-testid="onboarding-complete" className="ld-surface rounded-xl border p-4">
          ✅ Onboarding complete for <strong>{status.orgName}</strong>.
        </p>
      ) : (
        <form action={completeAction} className="ld-surface space-y-4 rounded-xl border p-6">
          <label className="block text-sm font-medium" htmlFor="orgName">
            Organization name
          </label>
          <input
            id="orgName"
            name="orgName"
            required
            data-testid="org-name-input"
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Acme, Inc."
          />
          <button
            type="submit"
            data-testid="complete-onboarding"
            className="rounded-lg px-4 py-2 font-medium text-white"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Complete onboarding
          </button>
        </form>
      )}
    </div>
  );
}
