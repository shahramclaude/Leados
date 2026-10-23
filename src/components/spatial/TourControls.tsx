import type { useTour } from "@/lib/spatial/tourEngine";

export function TourControls({ tour }: { tour: ReturnType<typeof useTour> }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">
            Guided tour · step {tour.stepIndex + 1} of {tour.total}
          </p>
          <h4 className="text-sm font-semibold text-indigo-900">{tour.step.title}</h4>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={tour.prev}
            disabled={tour.stepIndex === 0}
            className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={tour.next}
            disabled={tour.atEnd}
            className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Next →
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-indigo-800">{tour.step.narration}</p>
    </div>
  );
}
