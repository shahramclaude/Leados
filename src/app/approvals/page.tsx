import { PageHeader } from "@/components/ui";
import { ApprovalsBoard } from "./ApprovalsBoard";

export const dynamic = "force-dynamic";

export default function ApprovalsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Operate"
        title="Approval Queue"
        description="Routing follows a declarative decision table, not scattered code — every row shows why."
      />
      <ApprovalsBoard />
    </div>
  );
}
