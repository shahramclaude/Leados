import { NextResponse } from "next/server";
import { requireContext } from "@/lib/api-helpers";
import { updateOrgSettings } from "@/lib/repo/orgs";
import { isSupportedLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireContext("GET", "/api/settings");
  if ("error" in result) return result.error;
  return NextResponse.json({ org: result.ctx.org, role: result.ctx.role, scopes: result.ctx.scopes });
}

export async function PATCH(request: Request) {
  const result = await requireContext("PATCH", "/api/settings");
  if ("error" in result) return result.error;
  const { ctx } = result;

  const body = (await request.json()) as Partial<{
    name: string;
    locale: string;
    accentColor: string;
    logoEmoji: string;
    terminology: Record<string, string>;
    highContrastDefault: boolean;
    plainLanguageDefault: boolean;
  }>;

  if (body.locale && !isSupportedLocale(body.locale)) {
    return NextResponse.json({ error: "unsupported-locale" }, { status: 400 });
  }

  const updated = await updateOrgSettings(ctx.orgId, {
    ...body,
    locale: body.locale && isSupportedLocale(body.locale) ? body.locale : undefined,
  });

  return NextResponse.json({ org: updated });
}
