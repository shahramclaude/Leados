import "dotenv/config";

// Fail fast and loud if secrets aren't configured, same as production code.
import { getEnv } from "@/lib/env";
getEnv();
