import { getPolicyWithVersions, diffPolicyVersions } from "@/lib/policies";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const data = await getPolicyWithVersions(Number(id));
  if (!data) return Response.json({ error: "not found" }, { status: 404 });

  let diff = null;
  if (data.versions.length >= 2) {
    diff = diffPolicyVersions(data.versions[1].content, data.versions[0].content);
  }

  return Response.json({ ...data, diffFromPreviousVersion: diff });
}
