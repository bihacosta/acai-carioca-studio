import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ROLE_TEXT: Record<string, string> = {
  viewer: "see the content plan",
  approver: "review and approve the content",
  editor: "create and edit content",
  admin: "create content and manage the team"
};

/** Emails an invite. Only works for invites the signed-in person can see (owners/admins of that client). */
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

  let body: { inviteId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const inviteId = typeof body.inviteId === "string" && /^[0-9a-f-]{36}$/i.test(body.inviteId) ? body.inviteId : null;
  if (!inviteId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Act as the signed-in person: database rules decide whether they can see this invite.
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data: invite, error: inviteError } = await supabase
    .from("workspace_invites").select("email,role,workspace_id,workspaces(name)").eq("id", inviteId).maybeSingle();
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 403 });
  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  const inv = invite as unknown as { email: string; role: string; workspaces: { name: string } | null };
  const clientName = inv.workspaces?.name || "a client";
  const appUrl = process.env.APP_URL || "https://contentatelier.vercel.app";
  const sender = userData.user.email || "Your team";
  const what = ROLE_TEXT[inv.role] || "work on the content";

  const subject = `You're invited to ${clientName} on Content Atelier`;
  const html = `<div style="background:#f8ece3;padding:30px 12px;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:auto;background:#fef8f3;border:1px solid #e6dbd1;padding:30px">
<div style="font-size:10px;letter-spacing:2px;color:#967d79">${esc(clientName.toUpperCase())} · CONTENT ATELIER</div>
<h1 style="font-family:Georgia,serif;font-weight:400;color:#651321;font-size:26px;margin:12px 0">You're invited to ${esc(clientName)}</h1>
<p style="font-size:14px;color:#3a1c22;line-height:1.5">${esc(sender)} invited you to ${esc(what)} for <b>${esc(clientName)}</b>.</p>
<p style="font-size:14px;color:#3a1c22;line-height:1.5">Open the link and sign in with <b>${esc(inv.email)}</b>. You'll go straight to ${esc(clientName)}.</p>
<a href="${esc(appUrl)}" style="display:inline-block;background:#651321;color:#fffaf1;text-decoration:none;padding:12px 18px;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-top:8px">Open Content Atelier</a>
<p style="font-size:12px;color:#8a7570;line-height:1.5;margin-top:22px">Use this same email address to sign in, or the invite won't be found.</p>
</div></div>`;
  const text = `${sender} invited you to ${what} for ${clientName} on Content Atelier.\n\nOpen ${appUrl} and sign in with ${inv.email}. You'll go straight to ${clientName}.`;

  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    await transporter.sendMail({ from: `"Content Atelier" <${gmailUser}>`, to: inv.email, replyTo: userData.user.email || undefined, subject, text, html });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: "Could not send the email: " + message }, { status: 502 });
  }
  return NextResponse.json({ sent: true });
}
