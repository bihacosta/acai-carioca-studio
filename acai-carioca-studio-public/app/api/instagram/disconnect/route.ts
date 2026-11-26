import { asUser, errorResponse, HttpError, isUuid } from "@/lib/instagram";

export const runtime = "nodejs";

/** Owner/admin disconnects Instagram: removes the saved key and the synced posts. */
export async function POST(req: Request) {
  try {
    const { supabase } = await asUser(req);
    const body = await req.json().catch(() => ({}));
    if (!isUuid(body.workspaceId)) throw new HttpError(400, "Invalid request.");
    const { data: ws } = await supabase.rpc("managed_workspace", { target_workspace: body.workspaceId });
    if (!ws) throw new HttpError(403, "Only the client's owner or an admin can disconnect Instagram.");
    const { error } = await supabase.from("instagram_connections").delete().eq("workspace_id", body.workspaceId);
    if (error) throw new HttpError(403, error.message);
    await supabase.from("instagram_media").delete().eq("workspace_id", body.workspaceId);
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
