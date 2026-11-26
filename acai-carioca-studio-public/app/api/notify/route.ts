import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { esc, reviewEmail } from "@/lib/emails";

export const runtime = "nodejs";

type Post = {
  id: string; title: string; publish_date: string | null; format: string;
  status: string; approval_note: string | null;
};

const day = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "No date";

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!url || !key) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  if (!gmailUser || !gmailPass)
    return NextResponse.json({ error: "Email is not set up yet (GMAIL_USER / GMAIL_APP_PASSWORD missing in Vercel)." }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let body: { kind?: string; postIds?: string[]; emailIds?: string[]; workspaceId?: string; periodStart?: string; periodEnd?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const kind = body.kind;
  const ids = Array.isArray(body.postIds) ? body.postIds.filter(i => typeof i === "string").slice(0, 100) : [];
  const emailIds = Array.isArray(body.emailIds) ? body.emailIds.filter(i => typeof i === "string").slice(0, 100) : [];
  if ((kind !== "submitted" && kind !== "reviewed") || (ids.length === 0 && emailIds.length === 0))
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Act as the signed-in person: database rules decide what they can see and who gets the email.
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
  const { data: recipients, error: recError } = await supabase.rpc("notification_recipients", { kind, target_workspace: workspaceId });
  let clientName = "", clientLogo: string | null = null, clientColor: string | null = null;
  if (workspaceId) {
    const { data: ws } = await supabase.from("workspaces").select("name,logo_url").eq("id", workspaceId).maybeSingle();
    clientName = (ws as { name?: string } | null)?.name || "";
    clientLogo = (ws as { logo_url?: string | null } | null)?.logo_url || null;
    const { data: prof } = await supabase.from("client_profiles").select("brand_colors").eq("workspace_id", workspaceId).maybeSingle();
    clientColor = ((prof as { brand_colors?: string[] } | null)?.brand_colors || [])[0] || null;
  }
  if (recError) return NextResponse.json({ error: recError.message }, { status: 403 });
  const to = ((recipients || []) as { email: string }[]).map(r => r.email).filter(Boolean);
  if (to.length === 0)
    return NextResponse.json({ error: kind === "submitted" ? "There is no approver on the team yet. Add one in the Team tab." : "No one to notify." }, { status: 400 });

  let posts: Post[] = [];
  if (ids.length) {
    const { data: postsData, error: postsError } = await supabase
      .from("posts").select("id,title,publish_date,format,status,approval_note").in("id", ids)
      .order("publish_date", { ascending: true });
    if (postsError) return NextResponse.json({ error: postsError.message }, { status: 400 });
    posts = (postsData || []) as Post[];
  }
  if (emailIds.length) {
    const { data: emailData, error: emailError } = await supabase
      .from("email_campaigns").select("id,title,subject,send_date,status,approval_note").in("id", emailIds);
    if (emailError) return NextResponse.json({ error: emailError.message }, { status: 400 });
    posts = posts.concat(((emailData || []) as { id: string; title: string; subject: string | null; send_date: string | null; status: string; approval_note: string | null }[])
      .map(e => ({ id: e.id, title: e.subject || e.title, publish_date: e.send_date, format: "Email", status: e.status, approval_note: e.approval_note })));
    posts.sort((a, b) => (a.publish_date || "").localeCompare(b.publish_date || ""));
  }
  if (posts.length === 0) return NextResponse.json({ error: "Posts not found." }, { status: 404 });

  // Always link to the official site (preview links are protected by Vercel login).
  const appUrl = process.env.APP_URL || "https://contentatelier.vercel.app";
  // Deep link: open this client straight on the approval queue (or the client, for updates to the team).
  const link = workspaceId && /^[0-9a-f-]{36}$/i.test(workspaceId)
    ? `${appUrl}/?client=${workspaceId}${kind === "submitted" ? "&view=approvals" : ""}` : appUrl;
  const sender = userData.user.email || "Content Atelier";
  let subject: string, intro: string;
  if (kind === "submitted") {
    const period = body.periodStart && body.periodEnd ? `${day(body.periodStart)} – ${day(body.periodEnd)}` : "the next two weeks";
    subject = `${clientName ? clientName + ": " : ""}${posts.length} item${posts.length === 1 ? "" : "s"} ready for your approval (${period})`;
    intro = `${esc(sender)} sent <b>${posts.length} item${posts.length === 1 ? "" : "s"}</b> for ${esc(period)} for your approval.`;
  } else {
    const approved = posts.filter(p => p.status === "Approved").length;
    const changes = posts.filter(p => p.status === "Changes requested").length;
    const parts = [approved ? `${approved} approved` : "", changes ? `${changes} with changes requested` : ""].filter(Boolean).join(", ");
    subject = `${clientName ? clientName + ": " : ""}content review, ${parts || "update"}`;
    intro = `${esc(sender)} reviewed your content: <b>${esc(parts || "update")}</b>.`;
  }

  const html = reviewEmail({
    appUrl, link, clientName: clientName || "Your client", clientLogo, clientColor, kind, subject, introHtml: intro, sender,
    items: posts.map(p => ({ title: p.title, date: day(p.publish_date), format: p.format, status: p.status, note: p.approval_note }))
  });
  const text = `${subject}\n\n${posts.map(p => `- ${day(p.publish_date)}: ${p.title}${kind === "reviewed" ? ` — ${p.status}` : ""}${p.approval_note ? ` ("${p.approval_note}")` : ""}`).join("\n")}\n\n${link}`;

  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    await transporter.sendMail({ from: `"Content Atelier" <${gmailUser}>`, to, replyTo: userData.user.email || undefined, subject, text, html });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: "Could not send the email: " + message }, { status: 502 });
  }
  return NextResponse.json({ sent: to.length });
}
