import { createCollectionHandlers } from "@/lib/platform/http/entityRoutes";
import { initiativeRepository } from "@/lib/platform/repositories";

export const dynamic = "force-dynamic";
export const { GET, POST } = createCollectionHandlers(initiativeRepository);
