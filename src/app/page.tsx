import { db } from "@/db";
import { ensureSeedData } from "@/db/seed";
import Dashboard from "@/components/leados/Dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSeedData(db);

  return (
    <main className="min-h-screen bg-slate-100">
      <Dashboard />
    </main>
  );
}
