import { createCollectionHandlers } from "@/lib/platform/http/entityRoutes";
import { skillRepository } from "@/lib/platform/repositories";

export const dynamic = "force-dynamic";
export const { GET, POST } = createCollectionHandlers(skillRepository);
