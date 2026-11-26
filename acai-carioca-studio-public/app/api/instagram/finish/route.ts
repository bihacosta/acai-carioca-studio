import { asUser, encrypt, errorResponse, exchangeCode, getProfile, HttpError, igConfig, readState, syncWorkspace } from "@/lib/instagram";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The signed-in owner/admin finishes connecting: swap the code for a key, save it encrypted, first sync. */
export async function POST(req: Request) {
  try {
    const { secret } = igConfig();
    const { supabase, userId } = await asUser(req);
    const body = await req.json().catch(() => ({}));
    if (typeof body.code !== "string" || typeof body.state !== "string") throw new HttpError(400, "Invalid request.");
    const st = readState(body.state, secret);
    if (st.u !== userId) throw new HttpError(403, "Please finish connecting with the same account that started it.");
    const { data: ws } = await supabase.rpc("managed_workspace", { target_workspace: st.w });
    if (!ws) throw new HttpError(403, "Only the client's owner or an admin can connect Instagram.");

    const { token, expiresAt } = await exchangeCode(body.code);
    const me = await getProfile(token);
    const fields = {
      ig_user_id: String(me.user_id || me.id), username: me.username || null, account_type: me.account_type || null,
      profile_picture_url: me.profile_picture_url || null, token_enc: encrypt(token, secret), token_expires_at: expiresAt.toISOString(), last_error: null
    };
    const { data: updated, error: upErr } = await supabase.from("instagram_connections").update(fields).eq("workspace_id", st.w).select("workspace_id");
    if (upErr) throw new HttpError(403, upErr.message);
    if (!updated?.length) {
      const { error } = await supabase.from("instagram_connections").insert({ workspace_id: st.w, connected_by: userId, ...fields });
      if (error) throw new HttpError(403, error.message);
    }
    let synced = 0, syncError = "";
    try { synced = await syncWorkspace(supabase, st.w); } catch (e) { syncError = e instanceof Error ? e.message : String(e); }
    return Response.json({ workspaceId: st.w, username: me.username, synced, syncError });
  } catch (e) { return errorResponse(e); }
}
