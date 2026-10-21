import { createItemHandlers } from "@/lib/platform/http/entityRoutes";
import { roleRepository } from "@/lib/platform/repositories";

export const dynamic = "force-dynamic";
export const { GET, PATCH, DELETE } = createItemHandlers(roleRepository);
