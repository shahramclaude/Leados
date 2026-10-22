import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org-context";
import { OrgProfileWizard } from "@/components/OrgProfileWizard";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/");

  return (
    <div>
      <h1 className="mb-6 text-center text-2xl font-bold text-slate-950">{t(ctx.locale, "onboarding.title")}</h1>
      <OrgProfileWizard
        initialName={ctx.org.name}
        initialLocale={ctx.locale}
        initialAccent={ctx.org.accentColor}
        initialEmoji={ctx.org.logoEmoji}
      />
    </div>
  );
}
