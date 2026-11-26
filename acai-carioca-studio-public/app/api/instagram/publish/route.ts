import { asUser, errorResponse, HttpError, isUuid } from "@/lib/instagram";
import { publishPost } from "@/lib/instagram-publish";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Publish an approved post to the client's Instagram (owners, admins and editors). */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await asUser(req);
    const body = await req.json().catch(() => ({}));
    if (!isUuid(body.workspaceId) || !isUuid(body.postId)) throw new HttpError(400, "Invalid request.");
    if (body.containerId != null && !(typeof body.containerId === "string" && /^\d{1,40}$/.test(body.containerId))) throw new HttpError(400, "Invalid request.");
    const result = await publishPost(supabase, userId, body.workspaceId, body.postId, body.containerId || undefined);
    return Response.json(result);
  } catch (e) { return errorResponse(e); }
}
