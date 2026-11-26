import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { inviteEmail } from "@/lib/inviteEmail";

export const runtime = "nodejs";

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
    .from("workspace_invites").select("email,role,workspace_id,workspaces(name,logo_url)").eq("id", inviteId).maybeSingle();
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 403 });
  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  const inv = invite as unknown as { email: string; role: string; workspace_id: string; workspaces: { name: string; logo_url: string | null } | null };
  const { data: prof } = await supabase.from("client_profiles").select("brand_colors").eq("workspace_id", inv.workspace_id).maybeSingle();
  const { subject, html, text } = inviteEmail({
    appUrl: process.env.APP_URL || "https://contentatelier.vercel.app",
    clientName: inv.workspaces?.name || "a client",
    clientLogo: inv.workspaces?.logo_url || null,
    clientColor: ((prof as { brand_colors?: string[] } | null)?.brand_colors || [])[0] || null,
    email: inv.email, role: inv.role, sender: userData.user.email || "Your team"
  });

  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    await transporter.sendMail({ from: `"Content Atelier" <${gmailUser}>`, to: inv.email, replyTo: userData.user.email || undefined, subject, text, html });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: "Could not send the email: " + message }, { status: 502 });
  }
  return NextResponse.json({ sent: true });
}
