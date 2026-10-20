import { requireSession } from "@/lib/platform/session";
import { errorToResponse } from "@/lib/platform/authz";
import { getOrgSettings, setFeatureFlag, updateOrgSettings, type SettingsPatch } from "@/lib/app/settings";
import type { FeatureFlagKey } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const view = await getOrgSettings(session);
    return Response.json(view);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const body = (await request.json()) as SettingsPatch & { flags?: Partial<Record<FeatureFlagKey, boolean>> };
    const { flags, ...patch } = body;
    const org = await updateOrgSettings(session, patch);
    if (flags) {
      for (const [key, value] of Object.entries(flags)) {
        if (typeof value === "boolean") {
          await setFeatureFlag(session, key as FeatureFlagKey, value);
        }
      }
    }
    return Response.json({ org });
  } catch (err) {
    return errorToResponse(err);
  }
}
