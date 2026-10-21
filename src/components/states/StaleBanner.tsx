export function StaleBanner({ onRefresh, updatedAt }: { onRefresh: () => void; updatedAt?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span>
        Showing cached data{updatedAt ? ` from ${new Date(updatedAt).toLocaleTimeString()}` : ""}. It may be out of
        date.
      </span>
      <button
        onClick={onRefresh}
        className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        Refresh
      </button>
    </div>
  );
}
