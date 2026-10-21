import { createItemHandlers } from "@/lib/platform/http/entityRoutes";
import { orgUnitRepository } from "@/lib/platform/repositories";

export const dynamic = "force-dynamic";
export const { GET, PATCH, DELETE } = createItemHandlers(orgUnitRepository);
