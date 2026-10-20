import { OrgProfileWizard } from "@/components/OrgProfileWizard";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <OrgProfileWizard />
    </main>
  );
}
