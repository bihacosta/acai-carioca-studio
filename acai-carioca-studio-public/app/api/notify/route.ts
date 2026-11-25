import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

type Post = {
  id: string; title: string; publish_date: string | null; format: string;
  status: string; approval_note: string | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

  let body: { kind?: string; postIds?: string[]; periodStart?: string; periodEnd?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const kind = body.kind;
  const ids = Array.isArray(body.postIds) ? body.postIds.filter(i => typeof i === "string").slice(0, 100) : [];
  if ((kind !== "submitted" && kind !== "reviewed") || ids.length === 0)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Act as the signed-in person: database rules decide what they can see and who gets the email.
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data: recipients, error: recError } = await supabase.rpc("notification_recipients", { kind });
  if (recError) return NextResponse.json({ error: recError.message }, { status: 403 });
  const to = ((recipients || []) as { email: string }[]).map(r => r.email).filter(Boolean);
  if (to.length === 0)
    return NextResponse.json({ error: kind === "submitted" ? "There is no approver on the team yet. Add one in the Team tab." : "No one to notify." }, { status: 400 });

  const { data: postsData, error: postsError } = await supabase
    .from("posts").select("id,title,publish_date,format,status,approval_note").in("id", ids)
    .order("publish_date", { ascending: true });
  if (postsError) return NextResponse.json({ error: postsError.message }, { status: 400 });
  const posts = (postsData || []) as Post[];
  if (posts.length === 0) return NextResponse.json({ error: "Posts not found." }, { status: 404 });

  const appUrl = new URL(req.url).origin;
  const sender = userData.user.email || "Açaí Carioca Studio";
  const rows = posts.map(p => {
    const note = p.approval_note ? `<div style="color:#8d5148;font-size:13px;margin-top:4px">“${esc(p.approval_note)}”</div>` : "";
    const status = kind === "reviewed"
      ? `<td style="padding:10px 0;border-bottom:1px solid #e6dbd1;font-size:12px;color:${p.status === "Approved" ? "#62813b" : "#8d5148"};white-space:nowrap;text-align:right">${esc(p.status)}</td>` : "";
    return `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid #e6dbd1;font-size:12px;color:#887b76;white-space:nowrap">${esc(day(p.publish_date))}</td><td style="padding:10px 0;border-bottom:1px solid #e6dbd1;font-size:14px;color:#35242b"><b>${esc(p.title)}</b> <span style="color:#887b76">· ${esc(p.format)}</span>${note}</td>${status}</tr>`;
  }).join("");

  let subject: string, intro: string, button: string;
  if (kind === "submitted") {
    const period = body.periodStart && body.periodEnd ? `${day(body.periodStart)} – ${day(body.periodEnd)}` : "the next two weeks";
    subject = `${posts.length} post${posts.length === 1 ? "" : "s"} ready for your approval (${period})`;
    intro = `${esc(sender)} sent <b>${posts.length} post${posts.length === 1 ? "" : "s"}</b> for ${esc(period)} for your approval.`;
    button = "Review in the studio";
  } else {
    const approved = posts.filter(p => p.status === "Approved").length;
    const changes = posts.filter(p => p.status === "Changes requested").length;
    const parts = [approved ? `${approved} approved` : "", changes ? `${changes} with changes requested` : ""].filter(Boolean).join(", ");
    subject = `Content review: ${parts || "update"}`;
    intro = `${esc(sender)} reviewed your content: <b>${esc(parts || "update")}</b>.`;
    button = "Open the studio";
  }

  const html = `<div style="background:#f7f1e6;padding:30px 12px;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:auto;background:#fcfaf6;border:1px solid #e6dbd1;padding:30px">
<div style="font-size:10px;letter-spacing:2px;color:#967d79">AÇAÍ CARIOCA · CONTENT ATELIER</div>
<h1 style="font-family:Georgia,serif;font-weight:400;color:#4c1e2f;font-size:26px;margin:12px 0">${esc(subject)}</h1>
<p style="font-size:14px;color:#35242b;line-height:1.5">${intro}</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
<a href="${esc(appUrl)}" style="display:inline-block;background:#4c1e2f;color:#fffaf1;text-decoration:none;padding:12px 18px;font-size:12px;letter-spacing:1px;text-transform:uppercase">${button}</a>
</div></div>`;
  const text = `${subject}\n\n${posts.map(p => `- ${day(p.publish_date)}: ${p.title}${kind === "reviewed" ? ` — ${p.status}` : ""}${p.approval_note ? ` ("${p.approval_note}")` : ""}`).join("\n")}\n\n${appUrl}`;

  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    await transporter.sendMail({ from: `"Açaí Carioca Studio" <${gmailUser}>`, to, replyTo: userData.user.email || undefined, subject, text, html });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: "Could not send the email: " + message }, { status: 502 });
  }
  return NextResponse.json({ sent: to.length });
}
