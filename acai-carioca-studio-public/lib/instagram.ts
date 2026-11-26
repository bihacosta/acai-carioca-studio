/**
 * Instagram helpers (Instagram API with Unified Login = Facebook Login for Business + a configuration). SERVER ONLY.
 * Needs in Vercel (never NEXT_PUBLIC_): INSTAGRAM_APP_ID (the Meta app ID), INSTAGRAM_APP_SECRET (the Meta app secret)
 * and INSTAGRAM_CONFIG_ID (the Facebook Login for Business configuration ID).
 */
import { createHmac, createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const GRAPH = "https://graph.facebook.com/v23.0";
export const APP_URL = process.env.APP_URL || "https://contentatelier.vercel.app";
export const REDIRECT_URI = `${APP_URL}/api/instagram/callback`;

export function igConfig() {
  const appId = process.env.INSTAGRAM_APP_ID, secret = process.env.INSTAGRAM_APP_SECRET, configId = process.env.INSTAGRAM_CONFIG_ID;
  if (!appId || !secret || !configId) throw new HttpError(503, "Instagram isn't set up yet (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET / INSTAGRAM_CONFIG_ID missing in Vercel).");
  return { appId, secret, configId };
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

/* ---------- Who is calling (acts as the signed-in person, so database rules apply) ---------- */
export async function asUser(req: Request): Promise<{ supabase: SupabaseClient; userId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpError(500, "Supabase is not configured.");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in again.");
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Please sign in again.");
  return { supabase, userId: data.user.id };
}
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/* ---------- Signed "state" so the Instagram round trip can't be forged ---------- */
const b64u = (b: Buffer) => b.toString("base64url");
export function signState(payload: { w: string; u: string }, secret: string) {
  const body = b64u(Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 15 * 60 * 1000, n: b64u(randomBytes(8)) })));
  const sig = b64u(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}
export function readState(state: string, secret: string): { w: string; u: string } {
  const [body, sig] = (state || "").split(".");
  if (!body || !sig) throw new HttpError(400, "Invalid Instagram response. Try connecting again.");
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(400, "Invalid Instagram response. Try connecting again.");
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  if (!data.exp || data.exp < Date.now()) throw new HttpError(400, "The connection took too long. Try again.");
  return { w: data.w, u: data.u };
}

/* ---------- The Instagram key is stored encrypted (AES-256-GCM) ---------- */
const encKey = (secret: string) => createHash("sha256").update("atelier-instagram-token:" + secret).digest();
export function encrypt(text: string, secret: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(secret), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ["v1", b64u(iv), b64u(c.getAuthTag()), b64u(data)].join(".");
}
export function decrypt(blob: string, secret: string) {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1") throw new HttpError(500, "Unknown token format.");
  const d = createDecipheriv("aes-256-gcm", encKey(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/* ---------- Instagram calls ---------- */
async function igJson(res: Response) {
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.error || out.error_message) {
    const msg = out.error?.message || out.error_message || `Instagram error (${res.status})`;
    throw new HttpError(502, "Instagram: " + msg);
  }
  return out;
}

export function loginUrl(state: string) {
  const { appId, configId } = igConfig();
  const q = new URLSearchParams({ client_id: appId, redirect_uri: REDIRECT_URI, state, config_id: configId, response_type: "code", override_default_response_type: "true" });
  return `https://www.facebook.com/v23.0/dialog/oauth?${q}`;
}

/** Code -> business (system-user) access key. With our configuration it never expires. */
export async function exchangeCode(code: string) {
  const { appId, secret } = igConfig();
  const q = new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: REDIRECT_URI, code: code.replace(/#_$/, "") });
  const out = await igJson(await fetch(`${GRAPH}/oauth/access_token?${q}`));
  if (!out.access_token) throw new HttpError(502, "Meta didn't return an access key.");
  return { token: out.access_token as string, expiresAt: out.expires_in ? new Date(Date.now() + Number(out.expires_in) * 1000) : null };
}

type IgAccount = { id: string; username?: string; profile_picture_url?: string };

/** Find the Instagram professional account the person shared with the app. */
export async function getProfile(token: string): Promise<{ id: string; username: string; profile_picture_url?: string; account_type?: string }> {
  const t = encodeURIComponent(token);
  const tries: (() => Promise<IgAccount[]>)[] = [
    async () => (await igJson(await fetch(`${GRAPH}/me/assigned_instagram_accounts?fields=id,username,profile_picture_url&access_token=${t}`))).data || [],
    async () => (await igJson(await fetch(`${GRAPH}/me/instagram_accounts?fields=id,username,profile_picture_url&access_token=${t}`))).data || [],
    async () => ((await igJson(await fetch(`${GRAPH}/me/accounts?fields=instagram_business_account{id,username,profile_picture_url}&access_token=${t}`))).data || [])
      .map((p: { instagram_business_account?: IgAccount }) => p.instagram_business_account).filter(Boolean),
  ];
  let lastError = "";
  for (const attempt of tries) {
    try {
      const list = await attempt();
      if (list.length) {
        const acc = list[0];
        if (acc.username) return { id: acc.id, username: acc.username, profile_picture_url: acc.profile_picture_url };
        const full = await igJson(await fetch(`${GRAPH}/${acc.id}?fields=id,username,profile_picture_url&access_token=${t}`));
        return { id: full.id || acc.id, username: full.username || "instagram", profile_picture_url: full.profile_picture_url };
      }
    } catch (e) { lastError = e instanceof Error ? e.message : String(e); }
  }
  throw new HttpError(400, "No Instagram account was shared. Connect again and pick the Instagram account in the Meta window." + (lastError ? ` (${lastError})` : ""));
}

type IgMedia = { id: string; caption?: string; media_type: string; media_product_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number };

async function insightsFor(m: IgMedia, token: string) {
  const tries = ["reach,views,saved,shares", "reach,saved,shares", "reach"];
  for (const metric of tries) {
    try {
      const out = await igJson(await fetch(`${GRAPH}/${m.id}/insights?metric=${metric}&access_token=${encodeURIComponent(token)}`));
      const v: Record<string, number> = {};
      for (const row of out.data || []) v[row.name] = Number(row.values?.[0]?.value ?? row.total_value?.value ?? 0);
      return v;
    } catch { /* metric not available for this post type: try a smaller set */ }
  }
  return {};
}

/** Latest published posts with their numbers (runs a few requests at a time). */
export async function fetchMedia(igUserId: string, token: string, limit = 30) {
  const fields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  const out = await igJson(await fetch(`${GRAPH}/${igUserId}/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(token)}`));
  const media: IgMedia[] = out.data || [];
  const results: (IgMedia & { insights: Record<string, number> })[] = [];
  for (let i = 0; i < media.length; i += 6) {
    const batch = media.slice(i, i + 6);
    const ins = await Promise.all(batch.map(m => insightsFor(m, token)));
    batch.forEach((m, j) => results.push({ ...m, insights: ins[j] }));
  }
  return results;
}

/** Pull the latest posts into instagram_media and stamp the sync time. Uses the caller's permissions. */
export async function syncWorkspace(supabase: SupabaseClient, workspaceId: string) {
  const { secret } = igConfig();
  const { data: enc, error } = await supabase.rpc("instagram_token", { target_workspace: workspaceId });
  if (error) throw new HttpError(403, error.message);
  if (!enc) throw new HttpError(404, "Instagram isn't connected for this client, or you can't sync it.");
  const token = decrypt(String(enc), secret);
  try {
    const { data: conn } = await supabase.from("instagram_connections").select("ig_user_id,token_expires_at").eq("workspace_id", workspaceId).maybeSingle();
    if (!conn?.ig_user_id) throw new HttpError(404, "Instagram isn't connected for this client.");
    if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now())
      throw new HttpError(401, "The Instagram connection expired. Ask the owner to connect it again.");
    const media = await fetchMedia(conn.ig_user_id, token);
    const now = new Date().toISOString();
    const rows = media.map(m => ({
      workspace_id: workspaceId, ig_id: m.id, caption: m.caption || null, media_type: m.media_type, product_type: m.media_product_type || null,
      media_url: m.media_url || null, thumbnail_url: m.thumbnail_url || null, permalink: m.permalink || null, posted_at: m.timestamp || null,
      like_count: m.like_count ?? null, comments_count: m.comments_count ?? null,
      reach: m.insights.reach ?? null, views: m.insights.views ?? null, saves: m.insights.saved ?? null, shares: m.insights.shares ?? null, synced_at: now
    }));
    if (rows.length) {
      const { error: upErr } = await supabase.from("instagram_media").upsert(rows, { onConflict: "workspace_id,ig_id" });
      if (upErr) throw new HttpError(403, upErr.message);
    }
    await supabase.from("instagram_connections").update({ last_synced_at: now, last_error: null }).eq("workspace_id", workspaceId);
    return rows.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("instagram_connections").update({ last_error: msg.slice(0, 300) }).eq("workspace_id", workspaceId);
    throw e;
  }
}

export function errorResponse(e: unknown) {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : "Something went wrong.";
  return Response.json({ error: message }, { status });
}
