import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org-context";
import { SettingsForm } from "@/components/SettingsForm";
import { AccessibilityControls } from "@/components/AccessibilityControls";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-950">{t(ctx.locale, "settings.title")}</h1>
      <SettingsForm name={ctx.org.name} orgLocale={ctx.locale} accentColor={ctx.org.accentColor} terminology={ctx.org.terminology} />
      <AccessibilityControls />
    </div>
  );
}
