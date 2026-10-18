import PeopleView from "@/components/leados/views/PeopleView";

export const dynamic = "force-dynamic";

export default function PeoplePage() {
  return (
    <main className="min-h-screen bg-slate-100">
      <PeopleView />
    </main>
  );
}
