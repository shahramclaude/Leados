import { Card, SectionHeader, EvidenceTag } from "../components/ui";
import { ledgerClaims } from "../data/mockData";

export function EvidenceLedgerView() {
  const counts = {
    verified: ledgerClaims.filter((c) => c.status === "verified").length,
    simulated: ledgerClaims.filter((c) => c.status === "simulated").length,
    planned: ledgerClaims.filter((c) => c.status === "planned").length,
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Evidence Ledger" subtitle="Every claim this product (or this build process) makes about itself, with proof or an honest downgrade. Mirrors docs/EVIDENCE-LEDGER.md." />

      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center"><p className="text-2xl font-semibold text-emerald-600">{counts.verified}</p><p className="text-xs text-slate-500">Verified</p></Card>
        <Card className="text-center"><p className="text-2xl font-semibold text-amber-600">{counts.simulated}</p><p className="text-xs text-slate-500">Simulated</p></Card>
        <Card className="text-center"><p className="text-2xl font-semibold text-slate-500">{counts.planned}</p><p className="text-xs text-slate-500">Planned / not built</p></Card>
      </div>

      <div className="space-y-3">
        {ledgerClaims.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-slate-800">{c.id}. {c.claim}</p>
                <p className="mt-1 text-sm text-slate-500">{c.proof}</p>
              </div>
              <EvidenceTag level={c.status} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
