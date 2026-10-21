import { createCollectionHandlers } from "@/lib/platform/http/entityRoutes";
import { policyRepository } from "@/lib/platform/repositories";

export const dynamic = "force-dynamic";
export const { GET, POST } = createCollectionHandlers(policyRepository);
