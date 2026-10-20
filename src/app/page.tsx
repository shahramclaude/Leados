import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/platform/session";
import { needsFirstRunOnboarding } from "@/lib/app/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getOptionalSession();
  if (session) redirect("/dashboard");

  const needsOnboarding = await needsFirstRunOnboarding();
  redirect(needsOnboarding ? "/onboarding" : "/login");
}
