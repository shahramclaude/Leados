import { BADGE_CLASSES, STATUS_LABELS } from "@/lib/format";

export default function Badge({ value }: { value: string }) {
  const classes = BADGE_CLASSES[value] ?? "bg-slate-100 text-slate-700 ring-1 ring-slate-300";
  const label = STATUS_LABELS[value] ?? value;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}>
      {label}
    </span>
  );
}
