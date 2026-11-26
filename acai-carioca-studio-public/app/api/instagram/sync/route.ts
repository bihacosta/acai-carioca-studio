import { asUser, errorResponse, HttpError, isUuid, syncWorkspace } from "@/lib/instagram";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Refresh the client's Instagram posts and numbers (owners, admins and editors). */
export async function POST(req: Request) {
  try {
    const { supabase } = await asUser(req);
    const body = await req.json().catch(() => ({}));
    if (!isUuid(body.workspaceId)) throw new HttpError(400, "Invalid request.");
    const synced = await syncWorkspace(supabase, body.workspaceId);
    return Response.json({ synced });
  } catch (e) { return errorResponse(e); }
}
