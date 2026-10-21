import { createItemHandlers } from "@/lib/platform/http/entityRoutes";
import { transactionRepository } from "@/lib/platform/repositories";

export const dynamic = "force-dynamic";
export const { GET, PATCH, DELETE } = createItemHandlers(transactionRepository);
