import { seed } from "@/db/seed";
import { Shell } from "@/components/leados/Shell";

export const dynamic = "force-dynamic";

export default async function LeadOSPage() {
  // Auto-seed on first visit
  try {
    await seed();
  } catch {
    // ignore — the intelligence endpoint tolerates an unseeded DB
  }
  return <Shell />;
}
