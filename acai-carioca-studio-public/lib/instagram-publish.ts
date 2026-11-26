/**
 * Publishing an approved post to Instagram (Instagram API with Facebook Login, content publishing). SERVER ONLY.
 * Needs the "instagram_content_publish" permission in the Facebook Login for Business configuration
 * (and the account connected again after adding it).
 *
 * How Instagram publishing works: 1) create a "container" (Instagram downloads the photo/video from a public link),
 * 2) wait until Instagram finishes processing it, 3) publish the container.
 */
import { randomUUID } from "crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, HttpError, igConfig, syncWorkspace } from "@/lib/instagram";

const GRAPH = "https://graph.facebook.com/v23.0";
export const PUBLISHABLE_STATUSES = ["Approved", "Scheduled"];
const CAPTION_LIMIT = 2200, HASHTAG_LIMIT = 30, CAROUSEL_LIMIT = 10;

type Post = {
  id: string; title: string; status: string; format: string; caption: string | null; image_url: string; extra_images: string[] | null;
  cover_url: string | null; video_url: string | null; crop_x: number | null; crop_y: number | null; on_grid: boolean | null;
};

/* ---------- Instagram calls ---------- */
async function graph(path: string, token: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET") {
  const q = new URLSearchParams({ ...params, access_token: token });
  const res = method === "GET" ? await fetch(`${GRAPH}/${path}?${q}`) : await fetch(`${GRAPH}/${path}`, { method: "POST", body: q });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.error) {
    const err = out.error || {};
    const msg: string = err.error_user_msg || err.message || `Instagram error (${res.status})`;
    if (err.code === 10 || err.code === 200 || /permission/i.test(msg))
      throw new HttpError(403, "Content Atelier doesn't have permission to post on this Instagram yet. Add “instagram_content_publish” to the Facebook Login configuration in Meta, then disconnect and connect Instagram again. (Meta said: " + msg + ")");
    if (err.code === 9 || /limit/i.test(msg)) throw new HttpError(429, "Instagram's daily posting limit was reached. Try again tomorrow. (Meta said: " + msg + ")");
    throw new HttpError(502, "Instagram: " + msg);
  }
  return out;
}

/* ---------- Media Instagram can use ---------- */

/**
 * Instagram only takes JPEG photos, and feed photos must be between 4:5 (tall) and 1.91:1 (wide).
 * If the photo already fits, its link is used as is. Otherwise a JPEG copy is made (cropped around the
 * framing chosen in the editor) and saved in the uploader's folder of the creative-assets bucket.
 */
async function instagramReadyImage(url: string, opts: { feed: boolean; cropX: number; cropY: number }, supabase: SupabaseClient, userId: string) {
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(400, "Couldn't open one of the images of this post. Try uploading it again.");
  const original = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(original).metadata().catch(() => null);
  if (!meta?.width || !meta.height) throw new HttpError(400, "One of the images of this post can't be read. Try uploading it again as JPG or PNG.");

  const rotated = (meta.orientation || 1) > 4; // EXIF says the photo is turned sideways
  const w = rotated ? meta.height : meta.width, h = rotated ? meta.width : meta.height;
  const ratio = w / h;
  const needsCrop = opts.feed && (ratio < 0.8 || ratio > 1.91);
  const isPlainJpeg = meta.format === "jpeg" && (meta.orientation || 1) === 1;
  if (!needsCrop && isPlainJpeg && original.length < 8 * 1024 * 1024 && w <= 1440 * 2) return url;

  let img = sharp(original).rotate();
  if (needsCrop) {
    if (ratio < 0.8) { // too tall: keep 4:5
      const ch = Math.floor(w / 0.8), top = Math.round((h - ch) * (opts.cropY / 100));
      img = sharp(await img.toBuffer()).extract({ left: 0, top, width: w, height: ch });
    } else { // too wide: keep 1.91:1
      const cw = Math.floor(h * 1.91), left = Math.round((w - cw) * (opts.cropX / 100));
      img = sharp(await img.toBuffer()).extract({ left, top: 0, width: cw, height: h });
    }
  }
  const jpeg = await img.resize({ width: 1440, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  const path = `${userId}/instagram/${randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("creative-assets").upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (error) throw new HttpError(403, "Couldn't prepare the image for Instagram: " + error.message);
  return supabase.storage.from("creative-assets").getPublicUrl(path).data.publicUrl;
}

/** Instagram downloads the video itself, so it needs a direct link to the file. */
function directVideoUrl(link: string | null) {
  if (!link) throw new HttpError(400, "This Reel has no video yet. Add the video link in the editor.");
  let u: URL;
  try { u = new URL(link); } catch { throw new HttpError(400, "The video link of this Reel doesn't look right."); }
  const host = u.hostname.replace(/^www\./, "");
  if (/(^|\.)dropbox\.com$/.test(host)) { u.searchParams.delete("dl"); u.searchParams.set("raw", "1"); return u.toString(); }
  if (/(^|\.)(drive|docs)\.google\.com$|(^|\.)youtube\.com$|^youtu\.be$|(^|\.)frame\.io$|(^|\.)f\.io$|(^|\.)vimeo\.com$|(^|\.)canva\.com$/.test(host))
    throw new HttpError(400, "Instagram needs a direct link to the video file to publish a Reel. Google Drive, YouTube, Vimeo, Canva and Frame.io links don't work for this; a Dropbox link does.");
  return u.toString();
}

function checkCaption(caption: string) {
  if (caption.length > CAPTION_LIMIT) throw new HttpError(400, `The caption is too long for Instagram (max ${CAPTION_LIMIT} characters).`);
  const tags = (caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
  if (tags > HASHTAG_LIMIT) throw new HttpError(400, `Instagram allows up to ${HASHTAG_LIMIT} hashtags; this caption has ${tags}.`);
}

/** Step 1: create the Instagram container(s) for the post. Returns the container to publish. */
async function createContainer(post: Post, igUserId: string, token: string, supabase: SupabaseClient, userId: string) {
  const caption = post.caption || "";
  checkCaption(caption);
  const crop = { cropX: post.crop_x ?? 50, cropY: post.crop_y ?? 50 };
  const images = [post.image_url, ...(post.extra_images || [])].filter(Boolean);

  if (post.format === "Flyer") throw new HttpError(400, "Flyers aren't published to Instagram. Change the format to Post if this should go on Instagram.");

  if (post.format === "Story") {
    if (!images.length) throw new HttpError(400, "This story has no image.");
    const image_url = await instagramReadyImage(images[0], { feed: false, ...crop }, supabase, userId);
    return (await graph(`${igUserId}/media`, token, { media_type: "STORIES", image_url }, "POST")).id as string;
  }

  if (post.format === "Reel") {
    const params: Record<string, string> = { media_type: "REELS", video_url: directVideoUrl(post.video_url), caption, share_to_feed: String(post.on_grid !== false) };
    if (post.cover_url) params.cover_url = await instagramReadyImage(post.cover_url, { feed: false, ...crop }, supabase, userId);
    return (await graph(`${igUserId}/media`, token, params, "POST")).id as string;
  }

  // Post or Carousel
  if (!images.length) throw new HttpError(400, "This post has no image.");
  if (images.length > CAROUSEL_LIMIT) throw new HttpError(400, `Instagram carousels can have up to ${CAROUSEL_LIMIT} images; this one has ${images.length}.`);
  const ready: string[] = [];
  for (const url of images) ready.push(await instagramReadyImage(url, { feed: true, ...crop }, supabase, userId));
  if (ready.length === 1) return (await graph(`${igUserId}/media`, token, { image_url: ready[0], caption }, "POST")).id as string;
  const children: string[] = [];
  for (const image_url of ready) children.push((await graph(`${igUserId}/media`, token, { image_url, is_carousel_item: "true" }, "POST")).id);
  return (await graph(`${igUserId}/media`, token, { media_type: "CAROUSEL", children: children.join(","), caption }, "POST")).id as string;
}

/** Step 2: wait for Instagram to finish processing, until the deadline. */
async function waitUntilReady(containerId: string, token: string, deadline: number) {
  while (true) {
    const out = await graph(containerId, token, { fields: "status_code,status" });
    if (out.status_code === "FINISHED" || out.status_code === "PUBLISHED") return true;
    if (out.status_code === "ERROR" || out.status_code === "EXPIRED")
      throw new HttpError(400, "Instagram couldn't process this media" + (out.status ? ` (${out.status})` : "") + ". Check the image/video format and try again.");
    if (Date.now() + 3000 > deadline) return false;
    await new Promise(r => setTimeout(r, 2500));
  }
}

export type PublishResult = { status: "published"; permalink: string | null } | { status: "processing"; containerId: string };

/**
 * Publish one approved post of the client. Acts as the signed-in person: only owners, admins and editors
 * can read the Instagram key, and the post is read and updated with their own permissions.
 * Videos can take longer than one request: then "processing" comes back with the container to continue.
 */
export async function publishPost(supabase: SupabaseClient, userId: string, workspaceId: string, postId: string, containerId?: string): Promise<PublishResult> {
  const deadline = Date.now() + 45_000;
  const { secret } = igConfig();
  const { data: enc, error } = await supabase.rpc("instagram_token", { target_workspace: workspaceId });
  if (error) throw new HttpError(403, error.message);
  if (!enc) throw new HttpError(404, "Instagram isn't connected for this client, or you can't publish for it.");
  const token = decrypt(String(enc), secret);
  const { data: conn } = await supabase.from("instagram_connections").select("ig_user_id,token_expires_at").eq("workspace_id", workspaceId).maybeSingle();
  if (!conn?.ig_user_id) throw new HttpError(404, "Instagram isn't connected for this client.");
  if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now()) throw new HttpError(401, "The Instagram connection expired. Ask the owner to connect it again.");

  const { data: post, error: postErr } = await supabase.from("posts")
    .select("id,title,status,format,caption,image_url,extra_images,cover_url,video_url,crop_x,crop_y,on_grid")
    .eq("id", postId).eq("workspace_id", workspaceId).maybeSingle();
  if (postErr) throw new HttpError(403, postErr.message);
  if (!post) throw new HttpError(404, "Post not found.");
  if (post.status === "Published") throw new HttpError(409, "This post is already marked as Published.");
  if (!PUBLISHABLE_STATUSES.includes(post.status)) throw new HttpError(400, "Only approved posts can be published. This one is “" + post.status + "”.");

  const id = containerId || await createContainer(post as Post, conn.ig_user_id, token, supabase, userId);
  if (!(await waitUntilReady(id, token, deadline))) return { status: "processing", containerId: id };

  const published = await graph(`${conn.ig_user_id}/media_publish`, token, { creation_id: id }, "POST");
  let permalink: string | null = null;
  try { permalink = (await graph(published.id, token, { fields: "permalink" })).permalink || null; } catch { /* the post is live; the link is a nice-to-have */ }

  const { error: upErr } = await supabase.from("posts").update({ status: "Published" }).eq("id", postId).eq("workspace_id", workspaceId);
  if (upErr) throw new HttpError(500, "The post went live on Instagram, but its status couldn't be updated here: " + upErr.message);
  try { await syncWorkspace(supabase, workspaceId); } catch { /* the numbers refresh on the next sync */ }
  return { status: "published", permalink };
}
