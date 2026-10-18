import MetricsView from "@/components/leados/views/MetricsView";

export const metadata = {
  title: "Metrics — Leados",
  description: "Real-time business intelligence surface for Leados metrics.",
};

export default function MetricsPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <MetricsView />
    </main>
  );
}
