import DeclareForm from "./DeclareForm";

export default function DeclarePage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm uppercase tracking-[0.08em] text-slate-600">Declaration flow</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Declare a crisis</h1>
        <p className="mt-2 text-sm text-slate-700">
          Calm, clear, two-step confirmation. Classes marked for dual declaration require at least two authorized
          declarers before the state machine will accept the transition.
        </p>
        <div className="mt-6">
          <DeclareForm />
        </div>
      </div>
    </main>
  );
}
