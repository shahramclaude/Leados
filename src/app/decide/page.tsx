import { PageHeader } from "@/components/ui";
import { DecisionBoard } from "./DecisionBoard";

export const dynamic = "force-dynamic";

export default function DecidePage() {
  return (
    <div>
      <PageHeader
        eyebrow="Decide"
        title="Decision Cockpit"
        description="Expected utility, EVPI, and a recommendation you can interrogate — never a bare number."
      />
      <DecisionBoard />
    </div>
  );
}
