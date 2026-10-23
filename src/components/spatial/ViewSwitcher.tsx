export type ViewMode = "3d" | "2d" | "table" | "description";

const TABS: { id: ViewMode; label: string }[] = [
  { id: "3d", label: "3D scene" },
  { id: "2d", label: "2D chart" },
  { id: "table", label: "Table" },
  { id: "description", label: "Description" },
];

export function ViewSwitcher({
  value,
  onChange,
  threeDPrimary,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  threeDPrimary: boolean;
}) {
  return (
    <div role="tablist" aria-label="Scene view mode" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
            value === tab.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {tab.label}
          {tab.id === "3d" && !threeDPrimary ? <span className="ml-1 text-[10px] opacity-75">(secondary)</span> : null}
          {tab.id === "2d" && threeDPrimary ? <span className="ml-1 text-[10px] opacity-75">(fallback)</span> : null}
          {tab.id === "2d" && !threeDPrimary ? <span className="ml-1 text-[10px] opacity-75">(primary)</span> : null}
        </button>
      ))}
    </div>
  );
}
