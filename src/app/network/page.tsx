import type { Metadata } from "next";
import { NetworkDashboard } from "./components/NetworkDashboard";

export const metadata: Metadata = {
  title: "Ecosystem Intelligence — LEADOS",
};

export default function NetworkPage() {
  return (
    <main className="min-h-screen bg-slate-100">
      <NetworkDashboard />
    </main>
  );
}
