import MemoryView from "@/components/leados/views/MemoryView";

export const dynamic = "force-dynamic";

export default function MemoryPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <MemoryView />
      </div>
    </main>
  );
}
