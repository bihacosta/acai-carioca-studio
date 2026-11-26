"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ClientProfile } from "./ClientStudio";
import { Upload, Download, Trash2, FileText, Type, Image as ImageIcon, Shapes, Folder, Palette, Copy, Check, Globe, User, Pencil } from "lucide-react";

type Category = "logo" | "font" | "guideline" | "photo" | "other";
export type BrandFile = {
  id: string; workspace_id: string; category: Category; name: string; file_path: string;
  mime_type: string | null; size_bytes: number | null; created_by: string | null; created_at: string;
};

const CATEGORIES: { key: Category; label: string; plural: string; icon: typeof Shapes }[] = [
  { key: "logo", label: "Logo", plural: "Logos", icon: Shapes },
  { key: "font", label: "Font", plural: "Fonts", icon: Type },
  { key: "guideline", label: "Guideline", plural: "Guidelines", icon: FileText },
  { key: "photo", label: "Photo", plural: "Photos", icon: ImageIcon },
  { key: "other", label: "Other", plural: "Other", icon: Folder }
];
const MAX_MB = 50;
const BUCKET = "creative-assets";

const ext = (name: string) => (name.split(".").pop() || "").toLowerCase();
const isImage = (f: Pick<BrandFile, "mime_type" | "name">) =>
  (f.mime_type || "").startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext(f.name));
const size = (b: number | null) => b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const publicUrl = (path: string, download?: string) =>
  supabase ? supabase.storage.from(BUCKET).getPublicUrl(path, download ? { download } : undefined).data.publicUrl : "";

/** Best guess for where a new file belongs, from its name and type. */
function guessCategory(file: File): Category {
  const e = ext(file.name), n = file.name.toLowerCase();
  if (["ttf", "otf", "woff", "woff2"].includes(e)) return "font";
  if (["pdf", "doc", "docx", "ppt", "pptx", "key", "pages"].includes(e)) return "guideline";
  if (e === "svg" || e === "ai" || e === "eps" || /logo|mark|icon/.test(n)) return "logo";
  if (file.type.startsWith("image/")) return "photo";
  return "other";
}

export default function BrandKit({ workspaceId, userId, clientName, profile, canAdd, canManage, onEditDetails, onNotice }: {
  workspaceId: string; userId: string; clientName: string; profile: ClientProfile | null;
  canAdd: boolean; canManage: boolean; onEditDetails?: () => void; onNotice: (msg: string) => void;
}) {
  const [files, setFiles] = useState<BrandFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [uploading, setUploading] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from("brand_files").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) onNotice("Could not load the brand files: " + error.message);
    setFiles((data || []) as BrandFile[]);
    setLoading(false);
  }
  useEffect(() => { setLoading(true); setFiles([]); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId]);

  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map(c => [c.key, files.filter(f => f.category === c.key).length])) as Record<Category, number>, [files]);
  const shown = filter === "all" ? files : files.filter(f => f.category === filter);

  async function addFiles(list: FileList | File[] | null) {
    if (!supabase || !list || !canAdd) return;
    const picked = Array.from(list);
    const tooBig = picked.filter(f => f.size > MAX_MB * 1024 * 1024);
    const ok = picked.filter(f => f.size <= MAX_MB * 1024 * 1024);
    let added = 0;
    for (const file of ok) {
      setUploading(file.name);
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
      const path = `${userId}/brand/${workspaceId}/${crypto.randomUUID()}-${safe}`;
      const { error: up } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (up) { onNotice(`Could not upload ${file.name}: ${up.message}`); continue; }
      const { error } = await supabase.from("brand_files").insert({
        workspace_id: workspaceId, category: filter === "all" ? guessCategory(file) : filter, name: file.name,
        file_path: path, mime_type: file.type || null, size_bytes: file.size, created_by: userId
      });
      if (error) { await supabase.storage.from(BUCKET).remove([path]); onNotice(`Could not save ${file.name}: ${error.message}`); continue; }
      added++;
    }
    setUploading("");
    if (tooBig.length) onNotice(`${tooBig.map(f => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over ${MAX_MB} MB and wasn't added.`);
    else if (added) onNotice(added === 1 ? "File added to the brand kit." : `${added} files added to the brand kit.`);
    load();
  }

  async function update(f: BrandFile, fields: Partial<Pick<BrandFile, "name" | "category">>) {
    if (!supabase) return;
    setFiles(cur => cur.map(x => x.id === f.id ? { ...x, ...fields } : x));
    const { error } = await supabase.from("brand_files").update(fields).eq("id", f.id);
    if (error) { onNotice("Could not save the change: " + error.message); load(); }
  }

  async function remove(f: BrandFile) {
    if (!supabase || !confirmRemove(f)) return;
    const { error } = await supabase.from("brand_files").delete().eq("id", f.id);
    if (error) { onNotice("Could not remove the file: " + error.message); return; }
    if (f.created_by === userId) await supabase.storage.from(BUCKET).remove([f.file_path]);
    setFiles(cur => cur.filter(x => x.id !== f.id));
    onNotice("File removed from the brand kit.");
  }
  // A plain browser confirm would block the page; a second click on the same button confirms instead.
  const [armed, setArmed] = useState<string | null>(null);
  function confirmRemove(f: BrandFile) {
    if (armed === f.id) { setArmed(null); return true; }
    setArmed(f.id); setTimeout(() => setArmed(a => a === f.id ? null : a), 3000);
    return false;
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(c => c === text ? "" : c), 1500); });
  }

  const colors = profile?.brand_colors || [];
  const socials = Object.entries(profile?.socials || {}).filter(([, v]) => v);
  const hasBasics = colors.length || profile?.brand_fonts || profile?.voice_notes || profile?.website || socials.length || profile?.contact_name;

  return (
    <div className="brandKit">
      <section className="kitBasics">
        <div className="sectionHead"><div><h2>At a glance</h2></div>
          {canManage && onEditDetails && <button className="secondary" onClick={onEditDetails}><Pencil size={14} /> Edit details</button>}</div>
        {!hasBasics ? <p className="muted kitHint">{canManage ? "Add colours, fonts and the brand voice in “Edit details”." : "No colours or fonts saved yet. An owner or admin can add them."}</p> :
          <div className="kitCards">
            {colors.length > 0 && <div className="kitCard"><span className="kitLabel"><Palette size={14} /> Colours</span>
              <div className="kitSwatches">{colors.map(c => <button key={c} className="kitSwatch" onClick={() => copy(c)} title="Copy colour code">
                <span style={{ background: c }} /><small>{copied === c ? <><Check size={11} /> Copied</> : <>{c}<Copy size={11} /></>}</small></button>)}</div></div>}
            {profile?.brand_fonts && <div className="kitCard"><span className="kitLabel"><Type size={14} /> Fonts</span><p>{profile.brand_fonts}</p></div>}
            {profile?.voice_notes && <div className="kitCard wide"><span className="kitLabel"><FileText size={14} /> Voice and rules</span><p className="kitVoice">{profile.voice_notes}</p></div>}
            {(profile?.website || socials.length > 0) && <div className="kitCard"><span className="kitLabel"><Globe size={14} /> Online</span>
              {profile?.website && <p><a href={/^https?:\/\//.test(profile.website) ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer">{profile.website}</a></p>}
              {socials.map(([k, v]) => <p key={k}><b>{k[0].toUpperCase() + k.slice(1)}</b> {v}</p>)}</div>}
            {profile?.contact_name && <div className="kitCard"><span className="kitLabel"><User size={14} /> Contact</span>
              <p>{profile.contact_name}</p>{profile.contact_email && <p><a href={`mailto:${profile.contact_email}`}>{profile.contact_email}</a></p>}{profile.contact_phone && <p>{profile.contact_phone}</p>}</div>}
          </div>}
      </section>

      <section>
        <div className="sectionHead kitFilesHead"><div><h2>Files</h2></div>
          <div className="kitTools">
            <div className="segmented kitFilter" role="tablist" aria-label="File type">
              <button role="tab" aria-selected={filter === "all"} className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All <small>{files.length}</small></button>
              {CATEGORIES.map(c => <button key={c.key} role="tab" aria-selected={filter === c.key} className={filter === c.key ? "on" : ""} onClick={() => setFilter(c.key)}>{c.plural} <small>{counts[c.key]}</small></button>)}
            </div>
            {canAdd && <button className="primary compact" disabled={!!uploading} onClick={() => inputRef.current?.click()}><Upload size={15} /> {uploading ? "Uploading…" : "Upload files"}</button>}
            <input ref={inputRef} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
        </div>

        {canAdd && <div className={"kitDrop" + (dragging ? " over" : "")}
          onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => !uploading && inputRef.current?.click()} role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}>
          <Upload size={18} />
          <span>{uploading ? `Uploading ${uploading}…` : <>Drop files here or <u>choose files</u></>}</span>
          <small>{filter === "all" ? "Logos, fonts, PDFs, photos… We'll sort them for you; you can change the folder after." : `They'll go in ${CATEGORIES.find(c => c.key === filter)!.plural}.`} Up to {MAX_MB} MB each.</small>
        </div>}

        {loading ? <p className="muted">Loading files…</p> : shown.length === 0 ?
          <div className="empty kitEmpty"><Folder size={28} /><h3>{files.length ? "Nothing in this folder yet." : `${clientName}'s brand kit is empty.`}</h3>
            <p>{canAdd ? "Upload the logos, fonts and brand guidelines the team needs to work with this client." : "Files the team adds will show up here."}</p></div> :
          <div className="kitGrid">
            {shown.map(f => {
              const Icon = CATEGORIES.find(c => c.key === f.category)?.icon || Folder;
              const canRemove = f.created_by === userId || canManage;
              return <article className="kitFile" key={f.id}>
                <a className="kitThumb" href={publicUrl(f.file_path)} target="_blank" rel="noreferrer" title="Open">
                  {isImage(f) ? <img src={publicUrl(f.file_path)} alt="" loading="lazy" /> : <span><Icon size={26} /><b>{ext(f.name).toUpperCase() || "FILE"}</b></span>}
                </a>
                <div className="kitFileBody">
                  {renaming === f.id ?
                    <input className="kitRename" autoFocus value={draftName} onChange={e => setDraftName(e.target.value)}
                      onBlur={() => { const n = draftName.trim(); if (n && n !== f.name) update(f, { name: n }); setRenaming(null); }}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} /> :
                    <b title={f.name} onDoubleClick={() => { if (canAdd) { setRenaming(f.id); setDraftName(f.name); } }}>{f.name}</b>}
                  <small>{[size(f.size_bytes), new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })].filter(Boolean).join(" · ")}</small>
                  <div className="kitFileActions">
                    {canAdd ? <select aria-label="Folder" value={f.category} onChange={e => update(f, { category: e.target.value as Category })}>
                      {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                      : <span className="statusPill">{CATEGORIES.find(c => c.key === f.category)?.label}</span>}
                    <a className="iconButton" href={publicUrl(f.file_path, f.name)} aria-label={`Download ${f.name}`} title="Download"><Download size={14} /></a>
                    {canAdd && <button className="iconButton" aria-label={`Rename ${f.name}`} title="Rename" onClick={() => { setRenaming(f.id); setDraftName(f.name); }}><Pencil size={14} /></button>}
                    {canRemove && <button className={"iconButton" + (armed === f.id ? " kitDanger" : "")} aria-label={`Remove ${f.name}`} title="Remove" onClick={() => remove(f)}>
                      {armed === f.id ? "Remove?" : <Trash2 size={14} />}</button>}
                  </div>
                </div>
              </article>;
            })}
          </div>}
      </section>
    </div>
  );
}
