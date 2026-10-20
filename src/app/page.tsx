import { CockpitDashboard } from "@/components/CockpitDashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <CockpitDashboard />
    </main>
  );
}
