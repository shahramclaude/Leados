import { createCollectionHandlers } from "@/lib/platform/http/entityRoutes";
import { budgetRepository } from "@/lib/platform/repositories";

export const dynamic = "force-dynamic";
export const { GET, POST } = createCollectionHandlers(budgetRepository);
