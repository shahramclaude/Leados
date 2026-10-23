import {
  SEED_STATUS_BADGE,
  SEED_STATUS_LABELS,
  VERIFIED_STATUS_BADGE,
  VERIFIED_STATUS_LABELS,
  type SeedStatus,
  type VerifiedStatus,
} from "@/lib/coverageTypes";

export function SeedStatusBadge({ status }: { status: SeedStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${SEED_STATUS_BADGE[status]}`}
    >
      {SEED_STATUS_LABELS[status]}
    </span>
  );
}

export function VerifiedStatusBadge({ status }: { status: VerifiedStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${VERIFIED_STATUS_BADGE[status]}`}
    >
      {VERIFIED_STATUS_LABELS[status]}
    </span>
  );
}
