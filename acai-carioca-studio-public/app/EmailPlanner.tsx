"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/media";
import { Mail, Plus, X, MessageSquare, ExternalLink, Copy, Trash2, Check, AlertTriangle, ImagePlus } from "lucide-react";

export type EmailCampaign = {
  id: string; title: string; series: string | null; series_number: number | null; subject: string | null; preview_text: string | null;
  send_date: string | null; audience: string; status: string; body: string | null; hero_image_url: string | null;
  cta_label: string | null; cta_url: string | null; square_url: string | null;
  recipients: number | null; opens: number | null; clicks: number | null; revenue: number | null; results_notes: string | null;
  approval_note: string | null; reviewed_at: string | null; updated_at?: string;
};

export const EMAIL_STATUSES = ["Idea", "Drafting", "Ready", "Awaiting approval", "Changes requested", "Approved", "Scheduled", "Sent"];
const REVIEW_ONLY = ["Approved", "Changes requested"];
const AUDIENCES = ["All customers", "Loyalty members", "New customers", "VIP customers"];

const day = (iso: string | null) => iso ? new Date(iso + "T12:00:00") : null;
const fmt = (iso: string | null, o: Intl.DateTimeFormatOptions) => iso ? day(iso)!.toLocaleDateString("en-US", o) : "";
const pct = (a: number | null, b: number | null) => a != null && b ? `${Math.round((a / b) * 1000) / 10}%` : "—";
export const seriesLabel = (e: Pick<EmailCampaign, "series" | "series_number">) =>
  e.series ? `${e.series}${e.series_number ? ` No. ${String(e.series_number).padStart(2, "0")}` : ""}` : null;

/* ---------- Brand voice check (rules are set per client) ---------- */
type Flag = { level: "warn" | "tip"; text: string };
const EMOJI = /\p{Extended_Pictographic}/u;
export const VOICE_RULES: Record<string, string> = {
  no_dashes: "No dashes (— or –)",
  no_hyphen_bullets: "No hyphen bullets",
  no_emoji: "No emojis",
  cups_not_bowls: "Açaí is served in cups, not bowls",
  no_handcrafted_in_house: "Never say “handcrafted in-house”",
  minimal_punctuation: "Minimal punctuation (no exclamation marks)"
};
export function voiceCheck(e: { subject?: string | null; preview_text?: string | null; body?: string | null; cta_label?: string | null }, rules: string[] = []): Flag[] {
  const flags: Flag[] = [];
  const has = (r: string) => rules.includes(r);
  const all = [e.subject, e.preview_text, e.body, e.cta_label].filter(Boolean).join("\n");
  const subject = e.subject || "", preview = e.preview_text || "";
  if (has("no_dashes") && /[—–]/.test(all)) flags.push({ level: "warn", text: "Dashes (— or –) found. This brand’s email voice uses no dashes; use a period or a line break." });
  if (has("no_hyphen_bullets") && (/(^|\n)\s*[-•*]\s/.test(all) || /\s-\s/.test(all))) flags.push({ level: "warn", text: "Hyphen bullets or “ - ” found. Write it as plain prose or separate lines." });
  if (has("no_emoji") && EMOJI.test(all)) flags.push({ level: "warn", text: "Emoji found. This brand’s emails stay emoji free." });
  if (has("cups_not_bowls") && /\bbowls?\b/i.test(all)) flags.push({ level: "warn", text: "“Bowl” found. Açaí is always served in cups." });
  if (has("no_handcrafted_in_house") && /hand-?crafted\s+in-?house/i.test(all)) flags.push({ level: "warn", text: "“Handcrafted in-house” can’t be used for this brand." });
  if (has("minimal_punctuation") && /!/.test(all)) flags.push({ level: "tip", text: "Exclamation marks found. The voice keeps punctuation minimal." });
  if (subject.length > 60) flags.push({ level: "tip", text: `Subject is ${subject.length} characters. Under 60 keeps it from being cut off on phones.` });
  if (preview && (preview.length < 35 || preview.length > 130)) flags.push({ level: "tip", text: `Preview text is ${preview.length} characters. Aim for 35 to 130.` });
  if (!subject) flags.push({ level: "tip", text: "Add a subject line." });
  if (!preview) flags.push({ level: "tip", text: "Add preview text. Otherwise inboxes show the first line of the email." });
  return flags;
}

/* ---------- Editor ---------- */
function EmailEditor({ email, preset, allEmails, readOnly, canDelete, workspaceId, userId, onClose, onSaved, onOpenApprovals, clientName, clientLogo, voiceRules }: {
  clientName: string; clientLogo: string | null; voiceRules: string[]; email: EmailCampaign | null; preset?: Partial<EmailCampaign>; allEmails: EmailCampaign[]; readOnly: boolean; canDelete: boolean;
  workspaceId: string; userId: string; onClose: () => void; onSaved: (msg: string) => void; onOpenApprovals: () => void;
}) {
  const base: Partial<EmailCampaign> = email || preset || {};
  const [f, setF] = useState({
    title: base.title || "", series: base.series || "", series_number: base.series_number ?? null as number | null,
    subject: base.subject || "", preview_text: base.preview_text || "", send_date: base.send_date || "",
    audience: base.audience || "All customers", status: base.status || "Idea", body: base.body || "",
    hero_image_url: base.hero_image_url || "", cta_label: base.cta_label || "", cta_url: base.cta_url || "", square_url: base.square_url || "",
    recipients: base.recipients ?? null as number | null, opens: base.opens ?? null as number | null, clicks: base.clicks ?? null as number | null,
    revenue: base.revenue ?? null as number | null, results_notes: base.results_notes || ""
  });
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }));
  const seriesNames = Array.from(new Set(allEmails.map(e => e.series).filter(Boolean))) as string[];
  const flags = voiceCheck(f, voiceRules);
  const statusOptions = readOnly ? EMAIL_STATUSES : EMAIL_STATUSES.filter(s => !REVIEW_ONLY.includes(s) || s === email?.status);
  const num = (v: string) => v === "" ? null : Number(v);
  const showResults = f.status === "Sent" || f.recipients != null;

  function pickSeries(name: string) {
    set("series", name);
    if (name && f.series_number == null) {
      const max = Math.max(0, ...allEmails.filter(e => e.series === name && e.id !== email?.id).map(e => e.series_number || 0));
      set("series_number", max + 1);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || readOnly) return;
    setBusy(true); setError("");
    try {
      let hero = f.hero_image_url;
      if (heroFile) hero = await uploadImage(heroFile, userId);
      const payload = {
        ...f, hero_image_url: hero || null, series: f.series.trim() || null, series_number: f.series.trim() ? f.series_number : null,
        subject: f.subject || null, preview_text: f.preview_text || null, send_date: f.send_date || null, body: f.body || null,
        cta_label: f.cta_label || null, cta_url: f.cta_url || null, square_url: f.square_url || null, results_notes: f.results_notes || null,
        workspace_id: workspaceId, updated_at: new Date().toISOString()
      };
      const r = email
        ? await supabase.from("email_campaigns").update(payload).eq("id", email.id).eq("workspace_id", workspaceId)
        : await supabase.from("email_campaigns").insert(payload);
      if (r.error) throw r.error;
      onSaved(email ? "Email saved." : "Email added to the plan.");
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Could not save this email.");
      setBusy(false);
    }
  }
  async function remove() {
    if (!supabase || !email || !confirm(`Delete “${email.title}”? This can’t be undone.`)) return;
    setBusy(true);
    const { error } = await supabase.from("email_campaigns").delete().eq("id", email.id);
    if (error) { setError(error.message); setBusy(false); } else onSaved("Email deleted.");
  }

  const heroPreview = heroFile ? URL.createObjectURL(heroFile) : f.hero_image_url;

  return (
    <div className="modalBackdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal emailEditor" onSubmit={save}>
        <div className="modalHead">
          <div><p className="eyebrow">{seriesLabel({ series: f.series || null, series_number: f.series_number }) || "Email campaign"}</p><h2>{readOnly ? "Email preview" : email ? "Edit email" : "Plan a new email"}</h2></div>
          <button type="button" className="iconButton" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>

        {email?.approval_note && <div className={"feedbackBox" + (email.status === "Changes requested" ? " changes" : "")}><MessageSquare size={15} /><div>
          <b>Approver feedback</b><p>{email.approval_note}</p>
          {!readOnly && email.status === "Changes requested" && <small>After updating, set the status back to “Awaiting approval”.</small>}</div></div>}

        {/* Inbox preview */}
        <div className="inboxPreview" aria-label="How it looks in the inbox">
          <div className="inboxRow">
            <span className="inboxAvatar">{clientLogo ? <img src={clientLogo} alt="" /> : <span className="monoLogo">{clientName[0]}</span>}</span>
            <div className="inboxText">
              <div className="inboxTop"><b>{clientName}</b><span>{f.send_date ? fmt(f.send_date, { month: "short", day: "numeric" }) : "Today"}</span></div>
              <div className="inboxSubject">{f.subject || <i>Your subject line</i>}</div>
              <div className="inboxPre">{f.preview_text || f.body.split("\n").find(Boolean) || <i>Preview text</i>}</div>
            </div>
          </div>
        </div>

        <fieldset className="plainFieldset" disabled={readOnly}>
          <div className="formGrid">
            <label>Internal name<input required value={f.title} onChange={e => set("title", e.target.value)} placeholder="e.g. December newsletter" /></label>
            <label>Send date<input type="date" value={f.send_date} onChange={e => set("send_date", e.target.value)} /></label>
            <label>Series<input list="emailSeries" value={f.series} onChange={e => pickSeries(e.target.value)} placeholder="None, or a series name" /><datalist id="emailSeries">{seriesNames.map(s => <option key={s} value={s} />)}</datalist></label>
            <label>Number in series<input type="number" min={1} value={f.series_number ?? ""} disabled={!f.series} onChange={e => set("series_number", num(e.target.value))} /></label>
            <label>Audience<input list="emailAudiences" value={f.audience} onChange={e => set("audience", e.target.value)} /><datalist id="emailAudiences">{AUDIENCES.map(a => <option key={a} value={a} />)}</datalist></label>
            <label>Status<select value={f.status} onChange={e => set("status", e.target.value)}>{statusOptions.map(s => <option key={s}>{s}</option>)}</select></label>
          </div>

          <label>Subject line<input value={f.subject} onChange={e => set("subject", e.target.value)} placeholder="A subject people want to open" /></label>
          <div className="captionBar"><span className={f.subject.length > 60 ? "over" : ""}>{f.subject.length} / 60</span></div>
          <label>Preview text<input value={f.preview_text} onChange={e => set("preview_text", e.target.value)} placeholder="The line people read next to the subject" /></label>
          <div className="captionBar"><span className={f.preview_text && (f.preview_text.length < 35 || f.preview_text.length > 130) ? "over" : ""}>{f.preview_text.length} / 130</span></div>

          <div className="heroRow">
            <div className="heroPreview">{heroPreview ? <img src={heroPreview} alt="" /> : <ImagePlus size={20} />}</div>
            <div><b>Main image</b><p className="muted">The hero image at the top of the email.</p>
              {!readOnly && <div className="coverActions"><label className="secondary fileButton">{heroPreview ? "Replace image" : "Choose image"}<input type="file" accept="image/*" onChange={e => setHeroFile(e.target.files?.[0] || null)} /></label>
                {heroPreview && <button type="button" className="textButton" onClick={() => { setHeroFile(null); set("hero_image_url", ""); }}>Remove</button>}</div>}
            </div>
          </div>

          <label>Email copy<textarea rows={9} value={f.body} onChange={e => set("body", e.target.value)} placeholder={"No. 03 · …\n\nWrite the email here."} /></label>
          <div className="formGrid">
            <label>Button text<input value={f.cta_label} onChange={e => set("cta_label", e.target.value)} placeholder="Find your cup" /></label>
            <label>Button link<input value={f.cta_url} onChange={e => set("cta_url", e.target.value)} placeholder="https://" /></label>
          </div>

          <div className={"voiceCheck" + (flags.some(x => x.level === "warn") ? " hasWarn" : "")}>
            <div className="blockHead">{flags.some(x => x.level === "warn") ? <AlertTriangle size={15} /> : <Check size={15} />}<b>{voiceRules.length ? "Brand voice check" : "Email check"}</b></div>
            {flags.length === 0 ? <p className="muted">Clean, elegant and on brand.</p> :
              <ul>{flags.map(x => <li key={x.text} className={x.level}>{x.text}</li>)}</ul>}
          </div>

          <div className="squareBlock">
            <label>Square Marketing campaign link<input value={f.square_url} onChange={e => set("square_url", e.target.value)} placeholder="Paste the campaign link from Square" /></label>
            <div className="coverActions">
              {/^https?:\/\//.test(f.square_url) && <a className="secondary" href={f.square_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open in Square</a>}
              {!readOnly && <button type="button" className="secondary" onClick={() => { navigator.clipboard?.writeText([f.subject, f.preview_text, "", f.body, "", f.cta_label && `${f.cta_label}: ${f.cta_url}`].filter(x => x !== undefined && x !== null).join("\n")); setError(""); }}><Copy size={14} /> Copy text for Square</button>}
            </div>
          </div>

          {showResults ? (
            <div className="resultsBlock">
              <div className="blockHead"><b>Results</b><span className="muted">from Square after sending</span></div>
              <div className="resultsGrid">
                <label>Sent to<input type="number" min={0} value={f.recipients ?? ""} onChange={e => set("recipients", num(e.target.value))} /></label>
                <label>Opens<input type="number" min={0} value={f.opens ?? ""} onChange={e => set("opens", num(e.target.value))} /></label>
                <label>Clicks<input type="number" min={0} value={f.clicks ?? ""} onChange={e => set("clicks", num(e.target.value))} /></label>
                <label>Sales ($)<input type="number" min={0} step="0.01" value={f.revenue ?? ""} onChange={e => set("revenue", num(e.target.value))} /></label>
              </div>
              <div className="rates"><span>Open rate <b>{pct(f.opens, f.recipients)}</b></span><span>Click rate <b>{pct(f.clicks, f.recipients)}</b></span><span>Clicks per open <b>{pct(f.clicks, f.opens)}</b></span></div>
              <label>Notes<textarea rows={2} value={f.results_notes} onChange={e => set("results_notes", e.target.value)} placeholder="What worked, what to try next time" /></label>
            </div>
          ) : !readOnly && <button type="button" className="textButton" onClick={() => set("recipients", 0)}>Add results</button>}
        </fieldset>

        {error && <p className="notice">{error}</p>}
        <div className="modalActions">
          {email && canDelete && !readOnly && <button type="button" className="textButton dangerText" onClick={remove}><Trash2 size={14} /> Delete</button>}
          <span style={{ flex: 1 }} />
          {readOnly ? <>
            <button type="button" className="secondary" onClick={onClose}>Close</button>
            {email?.status === "Awaiting approval" && <button type="button" className="primary" onClick={onOpenApprovals}>Review in Approvals</button>}
          </> : <>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button className="primary" disabled={busy}>{busy ? "Saving…" : email ? "Save changes" : "Add to plan"}</button>
          </>}
        </div>
      </form>
    </div>
  );
}

/* ---------- Planner ---------- */
export default function EmailPlanner({ emails, workspaceId, userId, canEdit, canDelete, onChanged, onOpenApprovals, clientName, clientLogo, voiceRules }: {
  clientName: string; clientLogo: string | null; voiceRules: string[]; emails: EmailCampaign[]; workspaceId: string; userId: string; canEdit: boolean; canDelete: boolean;
  onChanged: (msg: string) => void; onOpenApprovals: () => void;
}) {
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState<{ email: EmailCampaign | null; preset?: Partial<EmailCampaign> } | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const series = useMemo(() => Array.from(new Set(emails.map(e => e.series).filter(Boolean))) as string[], [emails]);
  const visible = emails.filter(e => filter === "All" || (filter === "No series" ? !e.series : e.series === filter));
  const upcoming = visible.filter(e => e.status !== "Sent" && (!e.send_date || e.send_date >= today)).sort((a, b) => (a.send_date || "9999").localeCompare(b.send_date || "9999"));
  const overdue = visible.filter(e => e.status !== "Sent" && e.send_date && e.send_date < today).sort((a, b) => (a.send_date || "").localeCompare(b.send_date || ""));
  const sent = visible.filter(e => e.status === "Sent").sort((a, b) => (b.send_date || "").localeCompare(a.send_date || ""));

  function nextInSeries(e: EmailCampaign) {
    const max = Math.max(0, ...emails.filter(x => x.series === e.series).map(x => x.series_number || 0));
    const next = (d: string | null) => { if (!d) return null; const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + 7); return x.toISOString().slice(0, 10); };
    setOpen({ email: null, preset: {
      title: `${e.series} No. ${String(max + 1).padStart(2, "0")}`, series: e.series, series_number: max + 1, audience: e.audience,
      subject: (e.subject || "").replace(/No\. ?\d+/, `No. ${String(max + 1).padStart(2, "0")}`), send_date: next(e.send_date), status: "Idea", cta_label: e.cta_label, cta_url: e.cta_url
    } });
  }

  const Card = ({ e }: { e: EmailCampaign }) => {
    const warn = voiceCheck(e, voiceRules).some(x => x.level === "warn");
    return (
      <article className={"emailCard" + (e.status === "Sent" ? " sent" : "")} onClick={() => setOpen({ email: e })} role="button" tabIndex={0}
        onKeyDown={k => { if (k.key === "Enter") setOpen({ email: e }); }}>
        <div className="emailDate">{e.send_date ? <><small>{fmt(e.send_date, { weekday: "short" })}</small><b>{fmt(e.send_date, { day: "numeric" })}</b><small>{fmt(e.send_date, { month: "short" })}</small></> : <small>No date</small>}</div>
        <div className="emailInfo">
          {seriesLabel(e) && <span className="seriesBadge">{seriesLabel(e)}</span>}
          <h3>{e.subject || e.title}</h3>
          <p>{e.preview_text || <i>No preview text yet</i>}</p>
          <div className="emailMeta"><span>{e.audience}</span>{e.subject && <span>{e.title}</span>}{warn && <span className="warnTag"><AlertTriangle size={11} /> Voice</span>}{e.square_url && <span>In Square</span>}</div>
        </div>
        <div className="emailSide">
          <span className={"statusPill" + (e.status === "Approved" || e.status === "Sent" ? " ok" : e.status === "Changes requested" ? " warn" : "")}>{e.status}</span>
          {e.status === "Sent" && e.recipients ? <div className="miniRates"><span>{pct(e.opens, e.recipients)} open</span><span>{pct(e.clicks, e.recipients)} click</span></div> : null}
          {canEdit && e.series && <button type="button" className="textButton" onClick={ev => { ev.stopPropagation(); nextInSeries(e); }}><Plus size={12} /> Next in series</button>}
        </div>
      </article>
    );
  };

  return (
    <>
      <div className="sectionHead"><div><p className="eyebrow">Sent with Square Marketing</p><h2>Email plan</h2></div>
        {canEdit && <button className="primary" onClick={() => setOpen({ email: null })}><Plus size={16} /> Plan an email</button>}</div>
      {(series.length > 0 || emails.some(e => !e.series)) && emails.length > 0 && (
        <div className="todoFilters emailFilters">{["All", ...series, ...(emails.some(e => !e.series) && series.length ? ["No series"] : [])].map(s =>
          <button key={s} className={filter === s ? "filterChip selected" : "filterChip"} onClick={() => setFilter(s)}>{s}</button>)}</div>
      )}
      {emails.length === 0 ? (
        <div className="empty"><Mail size={28} /><h3>No emails planned yet.</h3><p>Plan your next send and keep the copy on brand.</p>
          {canEdit && <button className="primary" onClick={() => setOpen({ email: null })}><Plus size={16} /> Plan an email</button>}</div>
      ) : <div className="emailGroups">
        {overdue.length > 0 && <section><h4 className="groupTitle late">Date passed, not marked as sent</h4>{overdue.map(e => <Card key={e.id} e={e} />)}</section>}
        {upcoming.length > 0 && <section><h4 className="groupTitle">Coming up</h4>{upcoming.map(e => <Card key={e.id} e={e} />)}</section>}
        {sent.length > 0 && <section><h4 className="groupTitle">Sent</h4>{sent.map(e => <Card key={e.id} e={e} />)}</section>}
      </div>}
      {open && <EmailEditor clientName={clientName} clientLogo={clientLogo} voiceRules={voiceRules} key={open.email?.id || "new"} email={open.email} preset={open.preset} allEmails={emails} readOnly={!canEdit}
        canDelete={canDelete} workspaceId={workspaceId} userId={userId} onClose={() => setOpen(null)}
        onSaved={msg => { setOpen(null); onChanged(msg); }} onOpenApprovals={() => { setOpen(null); onOpenApprovals(); }} />}
    </>
  );
}
