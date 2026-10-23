import { PageHeader } from "@/components/ui";
import { KnowledgeSearch } from "./KnowledgeSearch";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  return (
    <div>
      <PageHeader
        eyebrow="Knowledge"
        title="Citation-Locked Search"
        description="Every answer below is a direct quote with a document and locator — nothing is asserted without a source."
      />
      <KnowledgeSearch />
    </div>
  );
}
