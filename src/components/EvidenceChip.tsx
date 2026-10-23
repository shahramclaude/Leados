import { EVIDENCE_CLASS_COLOR, EVIDENCE_CLASS_LABEL, type EvidenceClass } from "@/lib/seams/part27-evidence";

export function EvidenceChip({
  evidenceClass,
  sourceRef,
}: {
  evidenceClass: EvidenceClass;
  sourceRef?: string | null;
}) {
  const label = EVIDENCE_CLASS_LABEL[evidenceClass];
  const color = EVIDENCE_CLASS_COLOR[evidenceClass];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
      title={sourceRef ? `Source: ${sourceRef}` : "No source reference provided"}
    >
      {label}
      {sourceRef ? <span className="opacity-70">· {sourceRef}</span> : null}
    </span>
  );
}
