import { asUser, errorResponse, HttpError, igConfig, isUuid, loginUrl, signState } from "@/lib/instagram";

export const runtime = "nodejs";

/** Owner/admin asks to connect Instagram for a client: returns the Instagram login URL. */
export async function POST(req: Request) {
  try {
    const { secret } = igConfig();
    const { supabase, userId } = await asUser(req);
    const body = await req.json().catch(() => ({}));
    if (!isUuid(body.workspaceId)) throw new HttpError(400, "Invalid request.");
    const { data: ws } = await supabase.rpc("managed_workspace", { target_workspace: body.workspaceId });
    if (!ws) throw new HttpError(403, "Only the client's owner or an admin can connect Instagram.");
    const state = signState({ w: body.workspaceId, u: userId }, secret);
    const url = loginUrl(state);
    return Response.json({ url });
  } catch (e) { return errorResponse(e); }
}
