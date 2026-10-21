import { db } from "@/db";
import { leads } from "@/db/schema";
import { desc } from "drizzle-orm";
import LeadBoard from "@/components/LeadBoard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await db.select().from(leads).orderBy(desc(leads.score));
  return (
    <main className="min-h-screen">
      <LeadBoard initialLeads={rows} />
    </main>
  );
}
