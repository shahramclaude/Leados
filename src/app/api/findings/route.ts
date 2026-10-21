import { createCollectionHandlers } from "@/lib/platform/http/entityRoutes";
import { findingRepository } from "@/lib/platform/repositories";

export const dynamic = "force-dynamic";
export const { GET, POST } = createCollectionHandlers(findingRepository);
