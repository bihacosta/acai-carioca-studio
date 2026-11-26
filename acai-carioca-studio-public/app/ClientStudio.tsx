"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/media";
import { X, Upload, Plus, Trash2, Check, KeyRound } from "lucide-react";

export type ClientProfile = {
  workspace_id: string; tagline: string | null; brand_colors: string[]; brand_fonts: string | null; voice_notes: string | null;
  website: string | null; socials: Record<string, string>; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
};
type Account = { id?: string; platform: string; login: string; password_location: string; notes: string };
type ClientLite = { id: string; name: string; logo_url: string | null; role: string };

const SOCIALS: { key: string; label: string; hint: string }[] = [
  { key: "instagram", label: "Instagram", hint: "@handle" },
  { key: "tiktok", label: "TikTok", hint: "@handle" },
  { key: "facebook", label: "Facebook", hint: "facebook.com/…" },
  { key: "youtube", label: "YouTube", hint: "youtube.com/@…" },
  { key: "linkedin", label: "LinkedIn", hint: "linkedin.com/company/…" },
  { key: "google", label: "Google Business", hint: "Link to the listing" }
];
const PLATFORMS = ["Instagram", "TikTok", "Facebook", "Meta Business Suite", "Square", "Google Business", "Canva", "Website", "Email marketing", "Other"];
const DEFAULT_COLORS = ["#651321"];

export const emptyProfile = (id = ""): ClientProfile => ({
  workspace_id: id, tagline: null, brand_colors: [], brand_fonts: null, voice_notes: null, website: null, socials: {},
  contact_name: null, contact_email: null, contact_phone: null
});

const hexOk = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

export default function ClientStudio({ client, profile, userId, onClose, onSaved }: {
  client: ClientLite | null; profile: ClientProfile | null; userId: string;
  onClose: () => void; onSaved: (clientId: string, isNew: boolean) => void;
}) {
  const isNew = !client;
  const [name, setName] = useState(client?.name || "");
  const [logo, setLogo] = useState<string | null>(client?.logo_url || null);
  const [p, setP] = useState<ClientProfile>(profile ? { ...profile, socials: { ...(profile.socials || {}) } } : emptyProfile(client?.id));
  const [colors, setColors] = useState<string[]>(profile?.brand_colors?.length ? profile.brand_colors : DEFAULT_COLORS);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (isNew) nameRef.current?.focus(); }, [isNew]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  useEffect(() => {
    if (!supabase || !client) return;
    supabase.from("client_accounts").select("id,platform,login,password_location,notes").eq("workspace_id", client.id).order("sort_order")
      .then(({ data }: any) => setAccounts((data || []).map((a: any) => ({ id: a.id, platform: a.platform, login: a.login || "", password_location: a.password_location || "", notes: a.notes || "" }))));
  }, [client]);

  const set = (k: keyof ClientProfile, v: any) => setP(cur => ({ ...cur, [k]: v }));
  const setSocial = (k: string, v: string) => setP(cur => ({ ...cur, socials: { ...cur.socials, [k]: v } }));
  const setAccount = (i: number, k: keyof Account, v: string) => setAccounts(cur => cur.map((a, j) => j === i ? { ...a, [k]: v } : a));

  async function pickLogo(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file (PNG or JPG)."); return; }
    setUploading(true); setError("");
    try { setLogo(await uploadImage(file, userId)); } catch (e: any) { setError("Could not upload the logo: " + (e?.message || e)); }
    setUploading(false);
  }

  async function save() {
    if (!supabase) return;
    const clean = name.trim();
    if (!clean) { setError("Give the client a name."); nameRef.current?.focus(); return; }
    const badColor = colors.find(c => !hexOk(c));
    if (badColor) { setError(`“${badColor}” isn't a colour code. Use the format #651321.`); return; }
    setBusy(true); setError("");
    try {
      let id = client?.id;
      if (!id) {
        const { data, error } = await supabase.rpc("create_workspace", { client_name: clean });
        if (error) throw error;
        id = String(data);
      }
      if (isNew ? !!logo : (clean !== client!.name || logo !== client!.logo_url)) {
        const { error } = await supabase.from("workspaces").update({ name: clean, logo_url: logo }).eq("id", id);
        if (error) throw error;
      }
      const socials = Object.fromEntries(Object.entries(p.socials).map(([k, v]) => [k, (v || "").trim()]).filter(([, v]) => v));
      const t = (v: string | null) => (v || "").trim() || null;
      const { error: pe } = await supabase.from("client_profiles").upsert({
        workspace_id: id, tagline: t(p.tagline), brand_colors: colors, brand_fonts: t(p.brand_fonts), voice_notes: t(p.voice_notes),
        website: t(p.website), socials, contact_name: t(p.contact_name), contact_email: t(p.contact_email), contact_phone: t(p.contact_phone),
        updated_at: new Date().toISOString()
      });
      if (pe) throw pe;
      if (removed.length) {
        const { error } = await supabase.from("client_accounts").delete().in("id", removed).eq("workspace_id", id);
        if (error) throw error;
      }
      const rows = accounts.filter(a => a.platform.trim() || a.login.trim());
      for (let i = 0; i < rows.length; i++) {
        const a = rows[i];
        const fields = { workspace_id: id, platform: a.platform.trim() || "Other", login: t(a.login), password_location: t(a.password_location), notes: t(a.notes), sort_order: i };
        const { error } = a.id
          ? await supabase.from("client_accounts").update(fields).eq("id", a.id).eq("workspace_id", id)
          : await supabase.from("client_accounts").insert(fields);
        if (error) throw error;
      }
      onSaved(id!, isNew);
    } catch (e: any) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  }

  const lead = hexOk(colors[0] || "") ? colors[0] : "#651321";
  const socialList = SOCIALS.filter(s => (p.socials[s.key] || "").trim());

  return (
    <div className="studio" role="dialog" aria-modal="true" aria-label={isNew ? "New client" : `${client!.name} details`}>
      <header className="studioTop">
        <div className="brand"><img className="brandIcon" src="/brand/atelier-mark.png" alt="" /><div className="wordmark"><b>Content <i>Atelier</i></b><small>{isNew ? "New client" : "Client details"}</small></div></div>
        <div className="studioActions">
          <button className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy || uploading}><Check size={15} /> {busy ? "Saving…" : isNew ? "Create client" : "Save details"}</button>
        </div>
      </header>

      <div className="studioBody">
        {/* The client's card, as the team will see it */}
        <aside className="studioPreview" aria-label="Preview">
          <div className="brandCard">
            <div className="brandBand" style={{ background: lead }} />
            <label className={"brandLogo" + (uploading ? " busy" : "")} title={logo ? "Change logo" : "Add logo"}>
              {logo ? <img src={logo} alt="" /> : <span><Upload size={18} /><small>Logo</small></span>}
              <input type="file" accept="image/*" onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <div className="brandCardBody">
              <h2>{name.trim() || "Client name"}</h2>
              <p className="brandTagline">{p.tagline?.trim() || "A line about the brand."}</p>
              <div className="brandSwatches">{colors.filter(hexOk).map((c, i) => <span key={i} style={{ background: c }} title={c} />)}</div>
              {p.brand_fonts?.trim() && <p className="brandMeta"><b>Type</b> {p.brand_fonts}</p>}
              {socialList.length > 0 && <p className="brandMeta"><b>Online</b> {socialList.map(s => s.label).join(", ")}</p>}
              {p.contact_name?.trim() && <p className="brandMeta"><b>Contact</b> {p.contact_name}</p>}
            </div>
          </div>
          <p className="muted studioNote">{logo ? "Click the logo to replace it." : "Click the circle to add the logo."}</p>
        </aside>

        <div className="studioForm">
          <h1>{isNew ? <>A new client for <i>the atelier.</i></> : <>{client!.name}, <i>in detail.</i></>}</h1>
          {error && <p className="studioError" role="alert">{error}</p>}

          <section className="studioSection">
            <h3>Identity</h3>
            <label>Client name<input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Açaí Carioca" /></label>
            <label>Tagline<input value={p.tagline || ""} onChange={e => set("tagline", e.target.value)} placeholder="What the brand is, in one line" /></label>
          </section>

          <section className="studioSection">
            <h3>Branding</h3>
            <span className="fieldLabel">Brand colours</span>
            <div className="colorRow">
              {colors.map((c, i) => <div className="colorChip" key={i}>
                <input type="color" aria-label={`Colour ${i + 1}`} value={hexOk(c) ? c : "#000000"} onChange={e => setColors(cur => cur.map((x, j) => j === i ? e.target.value : x))} />
                <input className="hexInput" aria-label={`Colour ${i + 1} code`} value={c} onChange={e => setColors(cur => cur.map((x, j) => j === i ? e.target.value.trim() : x))} />
                {colors.length > 1 && <button className="chipRemove" aria-label={`Remove colour ${i + 1}`} onClick={() => setColors(cur => cur.filter((_, j) => j !== i))}><X size={13} /></button>}
              </div>)}
              {colors.length < 6 && <button className="addChip" onClick={() => setColors(cur => [...cur, "#f2e1d8"])}><Plus size={14} /> Add colour</button>}
            </div>
            <label>Fonts<input value={p.brand_fonts || ""} onChange={e => set("brand_fonts", e.target.value)} placeholder="e.g. Recoleta for titles, Inter for text" /></label>
            <label>Voice and rules<textarea rows={3} value={p.voice_notes || ""} onChange={e => set("voice_notes", e.target.value)} placeholder="How the brand talks, words to use or avoid" /></label>
          </section>

          <section className="studioSection">
            <h3>Online</h3>
            <label>Website<input value={p.website || ""} onChange={e => set("website", e.target.value)} placeholder="https://…" /></label>
            <div className="studioGrid">
              {SOCIALS.map(s => <label key={s.key}>{s.label}<input value={p.socials[s.key] || ""} onChange={e => setSocial(s.key, e.target.value)} placeholder={s.hint} /></label>)}
            </div>
          </section>

          <section className="studioSection">
            <h3>Contact at the client</h3>
            <div className="studioGrid">
              <label>Name<input value={p.contact_name || ""} onChange={e => set("contact_name", e.target.value)} /></label>
              <label>Email<input type="email" value={p.contact_email || ""} onChange={e => set("contact_email", e.target.value)} /></label>
              <label>Phone<input type="tel" value={p.contact_phone || ""} onChange={e => set("contact_phone", e.target.value)} /></label>
            </div>
          </section>

          <section className="studioSection">
            <h3>Account access</h3>
            <p className="studioHelp"><KeyRound size={15} /> Keep the login and where the password lives (for example “1Password, Açaí vault”). Don’t type passwords here. Only owners and admins see this.</p>
            {accounts.map((a, i) => <div className="accountRow" key={a.id || i}>
              <label>Platform<select value={PLATFORMS.includes(a.platform) ? a.platform : "Other"} onChange={e => setAccount(i, "platform", e.target.value)}>{PLATFORMS.map(x => <option key={x}>{x}</option>)}</select></label>
              <label>Login<input value={a.login} onChange={e => setAccount(i, "login", e.target.value)} placeholder="Username or email" autoComplete="off" /></label>
              <label>Password is in<input value={a.password_location} onChange={e => setAccount(i, "password_location", e.target.value)} placeholder="e.g. 1Password" autoComplete="off" /></label>
              <button className="taskDelete" aria-label="Remove this account" onClick={() => { if (a.id) setRemoved(r => [...r, a.id!]); setAccounts(cur => cur.filter((_, j) => j !== i)); }}><Trash2 size={15} /></button>
            </div>)}
            <button className="addChip" onClick={() => setAccounts(cur => [...cur, { platform: "Instagram", login: "", password_location: "", notes: "" }])}><Plus size={14} /> Add an account</button>
          </section>
        </div>
      </div>
    </div>
  );
}
