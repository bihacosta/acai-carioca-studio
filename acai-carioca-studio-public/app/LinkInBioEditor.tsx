"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/media";
import { Plus, Trash2, ChevronUp, ChevronDown, Copy, ExternalLink, Check } from "lucide-react";

type Page = { workspace_id: string; slug: string; title: string; subtitle: string | null; avatar_url: string | null; published: boolean; instagram_handle: string | null; website: string | null; highlights: string[] };
type Link = { id: string; label: string; url: string; sort_order: number };

const OFFICIAL = "https://acai-carioca-studio-public.vercel.app";

export default function LinkInBioEditor({ workspaceId, userId, onNotice, onProfileChange }: {
  workspaceId: string; userId: string; onNotice: (m: string) => void; onProfileChange: () => void;
}) {
  const [page, setPage] = useState<Page | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ label: "", url: "" });
  const [copied, setCopied] = useState(false);

  async function load() {
    if (!supabase) return;
    const [{ data: p }, { data: l }] = await Promise.all([
      supabase.from("bio_pages").select("*").eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("bio_links").select("id,label,url,sort_order").eq("workspace_id", workspaceId).order("sort_order")
    ]);
    setPage((p as Page) || { workspace_id: workspaceId, slug: "acaicarioca", title: "Açaí Carioca", subtitle: "Brazilian açaí · Pacific Beach & Point Loma", avatar_url: null, published: false, instagram_handle: null, website: null, highlights: [] });
    setLinks((l || []) as Link[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePage(next: Page, message = "Link in bio saved.") {
    if (!supabase) return;
    if (!/^[a-z0-9-]{3,40}$/.test(next.slug)) { onNotice("The page address can use 3–40 lowercase letters, numbers and dashes."); return; }
    setBusy(true);
    const { error } = await supabase.from("bio_pages").upsert({ ...next, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) onNotice(error.message.includes("duplicate") ? "That page address is taken. Try another one." : error.message);
    else { setPage(next); onNotice(message); onProfileChange(); }
  }
  function normalizeUrl(u: string) {
    const t = u.trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return t;
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) return "mailto:" + t;
    return "https://" + t.replace(/^\/+/, "");
  }
  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !page || !draft.label.trim() || !draft.url.trim()) return;
    if (!links.length) { const { error } = await supabase.from("bio_pages").upsert({ ...page }); if (error) { onNotice(error.message); return; } }
    setBusy(true);
    const { data, error } = await supabase.from("bio_links").insert({ workspace_id: workspaceId, label: draft.label.trim(), url: normalizeUrl(draft.url), sort_order: links.length })
      .select("id,label,url,sort_order").single();
    setBusy(false);
    if (error) onNotice(error.message); else { setLinks(l => [...l, data as Link]); setDraft({ label: "", url: "" }); }
  }
  async function updateLink(link: Link, changes: Partial<Link>) {
    if (!supabase) return;
    const next = { ...link, ...changes, url: changes.url !== undefined ? normalizeUrl(changes.url) : link.url };
    setLinks(l => l.map(x => x.id === link.id ? next : x));
    const { error } = await supabase.from("bio_links").update({ label: next.label, url: next.url }).eq("id", link.id);
    if (error) onNotice(error.message);
  }
  async function move(i: number, dir: -1 | 1) {
    if (!supabase) return;
    const j = i + dir; if (j < 0 || j >= links.length) return;
    const c = [...links]; [c[i], c[j]] = [c[j], c[i]];
    const ordered = c.map((l, k) => ({ ...l, sort_order: k }));
    setLinks(ordered);
    await Promise.all([ordered[i], ordered[j]].map(l => supabase!.from("bio_links").update({ sort_order: l.sort_order }).eq("id", l.id)));
  }
  async function remove(link: Link) {
    if (!supabase || !confirm(`Remove “${link.label}”?`)) return;
    const { error } = await supabase.from("bio_links").delete().eq("id", link.id);
    if (error) onNotice(error.message); else setLinks(l => l.filter(x => x.id !== link.id));
  }
  async function uploadAvatar(file?: File) {
    if (!file || !page) return;
    setBusy(true);
    try { const url = await uploadImage(file, userId); await savePage({ ...page, avatar_url: url }, "Profile photo updated."); }
    catch (err: unknown) { onNotice(err instanceof Error ? err.message : "Could not upload the photo."); }
    setBusy(false);
  }

  if (loading || !page) return <p className="muted">Loading…</p>;
  const publicUrl = `${OFFICIAL}/l/${page.slug}`;

  return (
    <div className="bioLayout">
      <div className="bioEditor">
        <section className="bioCard">
          <div className="bioAvatarRow">
            <label className="bioAvatar">{page.avatar_url ? <img src={page.avatar_url} alt="" /> : <img src="/brand/logo.png" alt="" />}<input type="file" accept="image/*" onChange={e => uploadAvatar(e.target.files?.[0])} /></label>
            <div className="bioFields">
              <label>Name<input value={page.title} maxLength={60} onChange={e => setPage({ ...page, title: e.target.value })} onBlur={() => savePage(page)} /></label>
              <label>Bio<textarea rows={5} value={page.subtitle || ""} maxLength={300} onChange={e => setPage({ ...page, subtitle: e.target.value })} onBlur={() => savePage(page)} /></label>
            </div>
          </div>
          <div className="bioTwo">
            <label>Instagram username<div className="slugInput"><span>@</span><input value={page.instagram_handle || ""} maxLength={30} placeholder="acaicarioca.usa"
              onChange={e => setPage({ ...page, instagram_handle: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "") || null })} onBlur={() => savePage(page)} /></div></label>
            <label>Website<input value={page.website || ""} maxLength={100} placeholder="www.acaicarioca.com" onChange={e => setPage({ ...page, website: e.target.value || null })} onBlur={() => savePage(page)} /></label>
          </div>
          <label>Story highlights <small className="muted">(separate with commas, shown in the phone preview)</small>
            <input value={(page.highlights || []).join(", ")} onChange={e => setPage({ ...page, highlights: e.target.value.split(",").map(x => x.trim()).filter(Boolean).slice(0, 10) })} onBlur={() => savePage(page)} /></label>
          <label className="bioSlug">Page address
            <div className="slugInput"><span>{OFFICIAL.replace("https://", "")}/l/</span>
              <input value={page.slug} maxLength={40} onChange={e => setPage({ ...page, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} onBlur={() => savePage(page)} /></div>
          </label>
        </section>

        <section className="bioCard">
          <div className="blockHead"><b>Links</b><span>{links.length}</span></div>
          {links.length === 0 && <p className="muted">Add your menu, online ordering, each location on Maps, and anything you’re promoting.</p>}
          <ul className="bioLinks">
            {links.map((l, i) => <li key={l.id}>
              <div className="bioLinkFields">
                <input aria-label="Button text" value={l.label} maxLength={80} onChange={e => setLinks(x => x.map(y => y.id === l.id ? { ...y, label: e.target.value } : y))} onBlur={e => updateLink(l, { label: e.target.value })} />
                <input aria-label="Link address" value={l.url} onChange={e => setLinks(x => x.map(y => y.id === l.id ? { ...y, url: e.target.value } : y))} onBlur={e => updateLink(l, { url: e.target.value })} />
              </div>
              <div className="bioLinkTools">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={14} /></button>
                <button type="button" aria-label="Move down" disabled={i === links.length - 1} onClick={() => move(i, 1)}><ChevronDown size={14} /></button>
                <button type="button" aria-label="Remove link" onClick={() => remove(l)}><Trash2 size={14} /></button>
              </div>
            </li>)}
          </ul>
          <form className="bioAdd" onSubmit={addLink}>
            <input placeholder="Button text, e.g. Order online" value={draft.label} maxLength={80} onChange={e => setDraft({ ...draft, label: e.target.value })} />
            <input placeholder="Link, e.g. acaicarioca.com/menu" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} />
            <button className="primary" disabled={busy || !draft.label.trim() || !draft.url.trim()}><Plus size={15} /> Add link</button>
          </form>
        </section>

        <section className={"bioCard publishCard" + (page.published ? " live" : "")}>
          <div>
            <b>{page.published ? "Your page is live" : "Your page is private"}</b>
            <p className="muted">{page.published ? "Anyone with the address can see your name, photo and links. Never your posts." : "Only your team can see it. Publish when you’re ready to put it in your Instagram bio."}</p>
          </div>
          <div className="publishActions">
            {page.published && <>
              <button type="button" className="secondary" onClick={() => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy address</>}</button>
              <a className="secondary" href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open</a>
            </>}
            <button type="button" className={page.published ? "secondary" : "primary"} disabled={busy}
              onClick={() => savePage({ ...page, published: !page.published }, page.published ? "Your link page is private again." : "Your link page is live.")}>
              {page.published ? "Make private" : "Publish page"}</button>
          </div>
        </section>
      </div>

      <div className="bioPreviewWrap" aria-label="Preview">
        <div className="phoneFrame small">
          <div className="phoneNotch" />
          <div className="phoneScreen bioPreview">
            <div className="bioPreviewAvatar">{page.avatar_url ? <img src={page.avatar_url} alt="" /> : <img src="/brand/logo.png" alt="" />}</div>
            <h3>{page.title}</h3>
            {page.instagram_handle && <span className="bioHandle">@{page.instagram_handle}</span>}
            {page.subtitle && <p>{page.subtitle}</p>}
            <div className="bioPreviewLinks">{links.map(l => <span key={l.id}>{l.label}</span>)}{links.length === 0 && <span className="ghost">Your links appear here</span>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
