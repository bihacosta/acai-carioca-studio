/** Branded invite email (Content Atelier look, with the client's logo and lead colour). */

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ROLE_TEXT: Record<string, string> = {
  viewer: "follow the content plan",
  approver: "review and approve the content",
  editor: "create and edit content",
  admin: "create content and manage the team"
};
const ROLE_LABEL: Record<string, string> = { viewer: "Viewer", approver: "Approver", editor: "Editor", admin: "Admin" };

export function inviteEmail(o: {
  appUrl: string; clientName: string; clientLogo: string | null; clientColor: string | null;
  email: string; role: string; sender: string;
}) {
  const wine = "#651321", ink = "#3a1c22", muted = "#8a7570", cream = "#f8ece3", paper = "#fef8f3", line = "#ecdfd6";
  const lead = o.clientColor && /^#[0-9a-f]{6}$/i.test(o.clientColor) ? o.clientColor : wine;
  const serif = "'Newsreader',Georgia,'Times New Roman',serif";
  const sans = "'Hanken Grotesk',-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif";
  const what = ROLE_TEXT[o.role] || "work on the content";
  const roleLabel = ROLE_LABEL[o.role] || o.role;
  const name = esc(o.clientName);
  const logoUrl = o.clientLogo ? (o.clientLogo.startsWith("/") ? o.appUrl + o.clientLogo : o.clientLogo) : null;
  const logo = logoUrl && /^https:\/\//.test(logoUrl)
    ? `<img src="${esc(logoUrl)}" width="64" height="64" alt="${name}" style="display:block;width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid #ffffff;background:#ffffff">`
    : `<div style="width:64px;height:64px;border-radius:50%;background:${lead};color:#fffaf1;border:3px solid #ffffff;font:600 24px/64px ${sans};text-align:center">${esc(o.clientName[0] || "?")}</div>`;

  const subject = `You're invited to ${o.clientName} on Content Atelier`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&display=swap" rel="stylesheet">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${cream}">
<div style="display:none;max-height:0;overflow:hidden">${esc(o.sender)} invited you to ${esc(what)} for ${name}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cream}"><tr><td align="center" style="padding:36px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
  <tr><td style="padding:0 4px 22px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;padding-right:10px"><img src="${esc(o.appUrl)}/brand/atelier-mark.png" width="34" height="34" alt="" style="display:block"></td>
      <td style="vertical-align:middle;font:400 20px ${serif};color:${wine}">Content <i>Atelier</i></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 2px 10px rgba(58,28,34,.06)">
    <div style="height:84px;background:${lead};border-radius:22px 22px 0 0"></div>
    <div style="padding:0 32px;margin-top:-34px">${logo}</div>
    <div style="padding:18px 32px 34px">
      <div style="font:600 11px ${sans};letter-spacing:.08em;text-transform:uppercase;color:${muted}">Invitation · ${esc(roleLabel)}</div>
      <h1 style="margin:10px 0 14px;font:400 34px/1.1 ${serif};color:${wine};letter-spacing:-.5px">You're invited to <i>${name}.</i></h1>
      <p style="margin:0 0 22px;font:400 15px/1.6 ${sans};color:${ink}"><b>${esc(o.sender)}</b> invited you to ${esc(what)} for ${name} in Content Atelier, where the team plans every post, email and approval.</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:${wine}">
        <a href="${esc(o.appUrl)}" style="display:inline-block;padding:14px 26px;font:600 15px ${sans};color:#fffaf1;text-decoration:none;border-radius:999px">Open ${name} →</a>
      </td></tr></table>
      <div style="margin-top:26px;padding:16px 18px;background:${paper};border:1px solid ${line};border-radius:14px;font:400 13px/1.6 ${sans};color:${ink}">
        <b style="color:${wine}">How to get in</b><br>
        1. Click the button above.<br>
        2. Sign in with <b>${esc(o.email)}</b> (Google or email).<br>
        3. You'll land straight in ${name}.
      </div>
    </div>
  </td></tr>
  <tr><td style="padding:20px 6px 0;font:400 12px/1.6 ${sans};color:${muted};text-align:center">
    Sent from <i style="font-family:${serif};color:${wine}">Content Atelier</i> on behalf of ${esc(o.sender)}. Reply to this email to reach them.<br>
    Not expecting this? You can ignore it.
  </td></tr>
</table></td></tr></table></body></html>`;
  const text = `${o.sender} invited you to ${what} for ${o.clientName} on Content Atelier.\n\nOpen ${o.appUrl} and sign in with ${o.email}. You'll land straight in ${o.clientName}.`;
  return { subject, html, text };
}
