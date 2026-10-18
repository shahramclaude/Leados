import { seed } from "@/db/seed";
import { Shell } from "@/components/leados/Shell";

export const dynamic = "force-dynamic";

export default async function LeadOSPage() {
  try {
    await seed();
  } catch {
    // ignore — seed is best-effort on first visit
  }
  return <Shell />;
}
