import { asUser, errorResponse, HttpError, igConfig, isUuid, REDIRECT_URI, SCOPES, signState } from "@/lib/instagram";

export const runtime = "nodejs";

/** Owner/admin asks to connect Instagram for a client: returns the Instagram login URL. */
export async function POST(req: Request) {
  try {
    const { appId, secret } = igConfig();
    const { supabase, userId } = await asUser(req);
    const body = await req.json().catch(() => ({}));
    if (!isUuid(body.workspaceId)) throw new HttpError(400, "Invalid request.");
    const { data: ws } = await supabase.rpc("managed_workspace", { target_workspace: body.workspaceId });
    if (!ws) throw new HttpError(403, "Only the client's owner or an admin can connect Instagram.");
    const state = signState({ w: body.workspaceId, u: userId }, secret);
    const url = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=${encodeURIComponent(state)}`;
    return Response.json({ url });
  } catch (e) { return errorResponse(e); }
}
