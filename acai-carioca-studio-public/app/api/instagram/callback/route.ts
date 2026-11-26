import { APP_URL } from "@/lib/instagram";

export const runtime = "nodejs";

/**
 * Instagram sends the person back here. We don't do anything sensitive here (there is no app session on
 * this request): we hand the one-time code back to the signed-in app, which finishes the connection.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const state = q.get("state") || "";
  let client = "";
  try { client = JSON.parse(Buffer.from(state.split(".")[0] || "", "base64url").toString()).w || ""; } catch { /* ignore */ }
  const back = new URL(APP_URL);
  if (/^[0-9a-f-]{36}$/i.test(client)) back.searchParams.set("client", client);
  back.searchParams.set("view", "instagram");
  const code = q.get("code");
  if (code) { back.searchParams.set("ig_code", code.replace(/#_$/, "")); back.searchParams.set("ig_state", state); }
  else back.searchParams.set("ig_error", q.get("error_description") || q.get("error_reason") || q.get("error") || "Instagram didn't connect.");
  return Response.redirect(back.toString(), 302);
}
