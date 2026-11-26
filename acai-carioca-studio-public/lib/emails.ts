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

/** Shared Content Atelier email frame: brand header, card with the client's colour band and logo, button, footer. */
export function emailLayout(o: {
  appUrl: string; clientName: string; clientLogo: string | null; clientColor: string | null;
  preheader: string; eyebrow: string; titleHtml: string; introHtml: string; bodyHtml?: string;
  buttonLabel: string; buttonUrl: string; footerHtml: string; docTitle: string;
}) {
  const wine = "#651321", cream = "#f8ece3", muted = "#8a7570", ink = "#3a1c22";
  const lead = o.clientColor && /^#[0-9a-f]{6}$/i.test(o.clientColor) ? o.clientColor : wine;
  const logoUrl = o.clientLogo ? (o.clientLogo.startsWith("/") ? o.appUrl + o.clientLogo : o.clientLogo) : null;
  const logo = logoUrl && /^https:\/\//.test(logoUrl)
    ? `<img src="${esc(logoUrl)}" width="64" height="64" alt="${esc(o.clientName)}" style="display:block;width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid #ffffff;background:#ffffff">`
    : `<div style="width:64px;height:64px;border-radius:50%;background:${lead};color:#fffaf1;border:3px solid #ffffff;font:600 24px/64px ${SANS};text-align:center">${esc(o.clientName[0] || "?")}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&display=swap" rel="stylesheet">
<title>${esc(o.docTitle)}</title></head>
<body style="margin:0;padding:0;background:${cream}">
<div style="display:none;max-height:0;overflow:hidden">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cream}"><tr><td align="center" style="padding:36px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="padding:0 4px 22px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;padding-right:10px"><img src="${esc(o.appUrl)}/brand/atelier-mark.png" width="34" height="34" alt="" style="display:block"></td>
      <td style="vertical-align:middle;font:400 20px ${SERIF};color:${wine}">Content <i>Atelier</i></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 2px 10px rgba(58,28,34,.06)">
    <div style="height:84px;background:${lead};border-radius:22px 22px 0 0"></div>
    <div style="padding:0 32px;margin-top:-34px">${logo}</div>
    <div style="padding:18px 32px 34px">
      <div style="font:600 11px ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${muted}">${esc(o.eyebrow)}</div>
      <h1 style="margin:10px 0 14px;font:400 32px/1.12 ${SERIF};color:${wine};letter-spacing:-.5px">${o.titleHtml}</h1>
      <p style="margin:0 0 22px;font:400 15px/1.6 ${SANS};color:${ink}">${o.introHtml}</p>
      ${o.bodyHtml || ""}
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:${wine}">
        <a href="${esc(o.buttonUrl)}" style="display:inline-block;padding:14px 26px;font:600 15px ${SANS};color:#fffaf1;text-decoration:none;border-radius:999px">${esc(o.buttonLabel)} →</a>
      </td></tr></table>
    </div>
  </td></tr>
  <tr><td style="padding:20px 6px 0;font:400 12px/1.6 ${SANS};color:${muted};text-align:center">${o.footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

export const SERIF = "'Newsreader',Georgia,'Times New Roman',serif";
export const SANS = "'Hanken Grotesk',-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif";
const sentFrom = (sender: string) =>
  `Sent from <i style="font-family:${SERIF};color:#651321">Content Atelier</i> on behalf of ${esc(sender)}. Reply to this email to reach them.`;

export function inviteEmail(o: {
  appUrl: string; clientName: string; clientLogo: string | null; clientColor: string | null;
  email: string; role: string; sender: string;
}) {
  const what = ROLE_TEXT[o.role] || "work on the content";
  const name = esc(o.clientName);
  const subject = `You're invited to ${o.clientName} on Content Atelier`;
  const html = emailLayout({
    ...o, docTitle: subject, preheader: `${o.sender} invited you to ${what} for ${o.clientName}.`,
    eyebrow: `Invitation · ${ROLE_LABEL[o.role] || o.role}`,
    titleHtml: `You're invited to <i>${name}.</i>`,
    introHtml: `<b>${esc(o.sender)}</b> invited you to ${esc(what)} for ${name} in Content Atelier, where the team plans every post, email and approval.`,
    bodyHtml: `<div style="margin:0 0 24px;padding:16px 18px;background:#fef8f3;border:1px solid #ecdfd6;border-radius:14px;font:400 13px/1.6 ${SANS};color:#3a1c22"><b style="color:#651321">How to get in</b><br>1. Click the button below.<br>2. Sign in with <b>${esc(o.email)}</b> (Google or email).<br>3. You'll land straight in ${name}.</div>`,
    buttonLabel: `Open ${o.clientName}`, buttonUrl: o.appUrl,
    footerHtml: `${sentFrom(o.sender)}<br>Not expecting this? You can ignore it.`
  });
  const text = `${o.sender} invited you to ${what} for ${o.clientName} on Content Atelier.\n\nOpen ${o.appUrl} and sign in with ${o.email}. You'll land straight in ${o.clientName}.`;
  return { subject, html, text };
}

export type ReviewItem = { title: string; date: string; format: string; status: string; note: string | null; image?: string | null; link?: string | null };

/** "Ready for your approval" (submitted) and "content review" (reviewed) emails. */
export function reviewEmail(o: {
  appUrl: string; link: string; clientName: string; clientLogo: string | null; clientColor: string | null;
  kind: "submitted" | "reviewed"; subject: string; introHtml: string; sender: string; items: ReviewItem[];
}) {
  const rows = o.items.map(p => {
    const ok = p.status === "Approved";
    const pill = o.kind === "reviewed"
      ? `<td style="padding:12px 0;border-bottom:1px solid #f1e7df;text-align:right;white-space:nowrap"><span style="display:inline-block;padding:4px 10px;border-radius:999px;font:600 11px ${SANS};background:${ok ? "#e9efdf" : "#f6e6df"};color:${ok ? "#4d6a2c" : "#8d4138"}">${esc(p.status)}</span></td>` : "";
    const changes = p.status === "Changes requested";
    const note = p.note ? (changes
      ? `<div style="margin-top:8px;padding:10px 12px;background:#f7ece6;border-left:3px solid #8d4138;border-radius:6px;font:400 13px/1.5 ${SANS};color:#3a1c22"><b style="color:#8d4138;font-size:11px;letter-spacing:.5px;text-transform:uppercase">What to change</b><br>${esc(p.note)}</div>`
      : `<div style="font:italic 400 13px/1.5 ${SERIF};color:#8d4138;margin-top:4px">“${esc(p.note)}”</div>`) : "";
    const open = p.link ? `<div style="margin-top:8px"><a href="${esc(p.link)}" style="font:600 12px ${SANS};color:#651321;text-decoration:underline">${changes ? "Open this post to edit →" : "Open this post →"}</a></div>` : "";
    const thumb = p.image ? `<td style="padding:12px 12px 12px 0;border-bottom:1px solid #f1e7df;vertical-align:top;width:64px"><img src="${esc(p.image)}" width="64" height="80" alt="" style="display:block;width:64px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #ecdfd6"></td>` : `<td style="padding:0;border-bottom:1px solid #f1e7df;width:0"></td>`;
    return `<tr>${thumb}<td style="padding:12px 0;border-bottom:1px solid #f1e7df;font:400 14px/1.45 ${SANS};color:#3a1c22;vertical-align:top"><div style="font:600 12px ${SANS};color:#8a7570;margin-bottom:2px">${esc(p.date)} · ${esc(p.format)}</div><b>${esc(p.title)}</b>${note}${open}</td>${pill}</tr>`;
  }).join("");
  const html = emailLayout({
    appUrl: o.appUrl, clientName: o.clientName, clientLogo: o.clientLogo, clientColor: o.clientColor, docTitle: o.subject,
    preheader: o.subject,
    eyebrow: o.kind === "submitted" ? "Ready for approval" : "Content review",
    titleHtml: o.kind === "submitted"
      ? `${o.items.length} item${o.items.length === 1 ? "" : "s"} <i>waiting for you.</i>`
      : `Your content, <i>reviewed.</i>`,
    introHtml: o.introHtml,
    bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 26px;border-top:1px solid #f1e7df">${rows}</table>`,
    buttonLabel: o.kind === "submitted" ? "Review in the studio" : "Open the studio", buttonUrl: o.link,
    footerHtml: sentFrom(o.sender)
  });
  return html;
}
