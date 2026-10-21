import { RosterView } from "@/components/RosterView";

export default function PeoplePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">People</h1>
      <p className="mt-1 text-sm text-slate-600">
        The roster below is scoped server-side to what the current actor is allowed to see (Part 09-G). Switch
        actors in the top bar to see the same endpoint return different results for the same request shape.
      </p>
      <div className="mt-6">
        <RosterView />
      </div>
    </main>
  );
}
