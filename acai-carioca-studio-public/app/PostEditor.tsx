"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/media";
import { X, Upload, MessageSquare, Hash, FileText, Trash2, ChevronLeft, ChevronRight, Plus, Move, Send } from "lucide-react";

export type EditorPost = {
  id: string; title: string; image_url: string; publish_date: string | null; format: string; location: string;
  pillar: string; status: string; caption: string | null; sort_order: number;
  approval_note?: string | null; reviewed_at?: string | null;
  crop_x?: number; crop_y?: number; extra_images?: string[]; cover_url?: string | null; on_grid?: boolean;
};
export type Snippet = { id: string; kind: "caption" | "hashtags"; name: string; body: string };
type Comment = { id: string; author_id: string; author_email: string | null; body: string; created_at: string };

const CAPTION_LIMIT = 2200, HASHTAG_LIMIT = 30;
const formats = ["Post", "Reel", "Carousel", "Story", "Flyer"];
const locations = ["Both", "Pacific Beach", "Point Loma"];
const pillars = ["Product", "Lifestyle", "Promotion", "Brand Awareness", "Community"];

/* ---------- Framing: drag the photo inside the 3:4 grid frame ---------- */
function CropEditor({ src, x, y, onChange, disabled }: { src: string; x: number; y: number; onChange: (x: number, y: number) => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  return (
    <div className="cropBlock">
      <div ref={ref} className={"cropFrame" + (disabled ? "" : " canMove")}
        onPointerDown={e => { if (disabled) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { px: e.clientX, py: e.clientY, x, y }; }}
        onPointerMove={e => {
          if (!start.current || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          // Dragging the photo right reveals more of its left side, so the focus point moves left.
          onChange(clamp(start.current.x - (e.clientX - start.current.px) / r.width * 160), clamp(start.current.y - (e.clientY - start.current.py) / r.height * 160));
        }}
        onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}>
        <img src={src} alt="" draggable={false} style={{ objectPosition: `${x}% ${y}%` }} />
        {!disabled && <span className="cropHint"><Move size={13} /> Drag to frame</span>}
      </div>
      <div className="cropSide">
        <b>Grid framing</b>
        <p>This is exactly what shows in your Instagram grid (3:4). Drag the photo to keep logos and text inside.</p>
        {!disabled && (x !== 50 || y !== 50) && <button type="button" className="textButton" onClick={() => onChange(50, 50)}>Center again</button>}
      </div>
    </div>
  );
}

/* ---------- Comments ---------- */
function Comments({ postId, workspaceId, userId }: { postId: string; workspaceId: string; userId: string }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) return;
    supabase.from("post_comments").select("id,author_id,author_email,body,created_at").eq("post_id", postId).order("created_at")
      .then(({ data, error }) => { if (error) setError(error.message); else setItems((data || []) as Comment[]); });
  }, [postId]);
  async function add() {
    if (!supabase || !text.trim()) return;
    setBusy(true); setError("");
    const { data, error } = await supabase.from("post_comments").insert({ post_id: postId, workspace_id: workspaceId, body: text.trim() })
      .select("id,author_id,author_email,body,created_at").single();
    if (error) setError(error.message); else { setItems(c => [...c, data as Comment]); setText(""); }
    setBusy(false);
  }
  async function remove(c: Comment) {
    if (!supabase || !confirm("Delete this comment?")) return;
    const { error } = await supabase.from("post_comments").delete().eq("id", c.id);
    if (error) setError(error.message); else setItems(list => list.filter(x => x.id !== c.id));
  }
  return (
    <section className="commentsBlock">
      <div className="blockHead"><MessageSquare size={15} /><b>Comments</b><span>{items.length}</span></div>
      {items.length === 0 && <p className="muted">No comments yet. Ask a question or leave a note for the team.</p>}
      <ul className="commentList">
        {items.map(c => <li key={c.id} className={c.author_id === userId ? "mine" : ""}>
          <span className="avatar small">{c.author_email?.[0]?.toUpperCase() || "?"}</span>
          <div><small>{c.author_id === userId ? "You" : c.author_email} · {new Date(c.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small><p>{c.body}</p></div>
          {c.author_id === userId && <button type="button" className="taskDelete" aria-label="Delete comment" onClick={() => remove(c)}><Trash2 size={13} /></button>}
        </li>)}
      </ul>
      <div className="commentInput">
        <textarea rows={1} value={text} maxLength={2000} placeholder="Write a comment…" onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } }} />
        <button type="button" className="primary roundIcon" aria-label="Send comment" disabled={busy || !text.trim()} onClick={add}><Send size={15} /></button>
      </div>
      {error && <p className="notice">{error}</p>}
    </section>
  );
}

/* ---------- Editor ---------- */
export default function PostEditor({ post, preset, isApprover, workspaceId, userId, snippets, statusOptions, onClose, onSaved, onSnippetsChanged, onOpenApprovals }: {
  post: EditorPost | null; preset?: { format?: string; date?: string }; isApprover: boolean; workspaceId: string; userId: string; snippets: Snippet[];
  statusOptions: (current: string) => string[]; onClose: () => void; onSaved: (message: string) => void;
  onSnippetsChanged: () => void; onOpenApprovals: () => void;
}) {
  const [form, setForm] = useState({
    title: post?.title || "", date: post ? (post.publish_date || "") : (preset?.date || new Date().toISOString().slice(0, 10)),
    format: post?.format || preset?.format || "Post", location: post?.location || "Both", pillar: post?.pillar || "Product",
    status: post?.status || "Idea", caption: post?.caption || ""
  });
  const [onGrid, setOnGrid] = useState(post ? post.on_grid !== false : true);
  const [crop, setCrop] = useState({ x: post?.crop_x ?? 50, y: post?.crop_y ?? 50 });
  const [images, setImages] = useState<{ url: string; file?: File }[]>(() =>
    post ? [post.image_url, ...(post.extra_images || [])].filter(Boolean).map(url => ({ url })) : []);
  const [cover, setCover] = useState<{ url: string; file?: File } | null>(post?.cover_url ? { url: post.cover_url } : null);
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snippetMenu, setSnippetMenu] = useState<"caption" | "hashtags" | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const readOnly = isApprover;

  useEffect(() => () => { images.forEach(i => i.file && URL.revokeObjectURL(i.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hashtagCount = (form.caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
  const isStory = form.format === "Story";
  const frameSrc = isStory ? "" : ((form.format === "Reel" && cover?.url) || images[0]?.url || "");

  function addImages(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files).filter(f => f.type.startsWith("image/")).map(file => ({ url: URL.createObjectURL(file), file }));
    setImages(list => [...list, ...added].slice(0, 10));
    if (added.length + images.length > 1 && form.format === "Post") setForm(f => ({ ...f, format: "Carousel" }));
  }
  function moveImage(i: number, dir: -1 | 1) {
    setImages(list => { const c = [...list]; const j = i + dir; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c; });
    setSlide(i + dir);
  }
  function insertText(text: string) {
    const el = captionRef.current;
    const cur = form.caption;
    const pos = el ? el.selectionEnd : cur.length;
    const sep = cur && !cur.slice(0, pos).endsWith("\n") && pos > 0 ? (text.startsWith("#") ? "\n\n" : "\n") : "";
    const next = cur.slice(0, pos) + sep + text + cur.slice(pos);
    setForm(f => ({ ...f, caption: next }));
    setSnippetMenu(null);
    requestAnimationFrame(() => { el?.focus(); const p = pos + sep.length + text.length; el?.setSelectionRange(p, p); });
  }
  async function saveSnippet(kind: "caption" | "hashtags") {
    if (!supabase) return;
    const body = kind === "hashtags" ? (form.caption.match(/#[\p{L}\p{N}_]+/gu) || []).join(" ") : form.caption.trim();
    if (!body) { setError(kind === "hashtags" ? "Add some #hashtags to the caption first." : "Write a caption first."); return; }
    const name = prompt(kind === "hashtags" ? "Name this hashtag group (e.g. “Summer”)" : "Name this caption template (e.g. “Promo”)");
    if (!name?.trim()) return;
    const { error } = await supabase.from("post_snippets").insert({ workspace_id: workspaceId, kind, name: name.trim(), body });
    if (error) setError(error.message); else { onSnippetsChanged(); setSnippetMenu(kind); }
  }
  async function deleteSnippet(s: Snippet) {
    if (!supabase || !confirm(`Delete “${s.name}”?`)) return;
    const { error } = await supabase.from("post_snippets").delete().eq("id", s.id);
    if (error) setError(error.message); else onSnippetsChanged();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || readOnly) return;
    if ((onGrid || isStory) && images.length === 0) { setError("Add at least one image, or switch to “Save as draft”."); return; }
    if (form.caption.length > CAPTION_LIMIT) { setError(`Instagram captions can have up to ${CAPTION_LIMIT} characters.`); return; }
    setBusy(true); setError("");
    try {
      const urls: string[] = [];
      for (const img of images) urls.push(img.file ? await uploadImage(img.file, userId) : img.url);
      let cover_url: string | null = null;
      if (form.format === "Reel" && cover) cover_url = cover.file ? await uploadImage(cover.file, userId) : cover.url;
      const { date, ...fields } = form;
      const payload = {
        ...fields, caption: form.caption || null, publish_date: date || null,
        image_url: urls[0] || "", extra_images: urls.slice(1), cover_url,
        crop_x: crop.x, crop_y: crop.y, on_grid: isStory ? true : onGrid, workspace_id: workspaceId
      };
      const result = post
        ? await supabase.from("posts").update(payload).eq("id", post.id).eq("workspace_id", workspaceId)
        : await supabase.from("posts").insert({ ...payload, sort_order: onGrid ? -1 : 0, created_by: userId });
      if (result.error) throw result.error;
      onSaved(onGrid ? "Content saved." : "Saved to drafts.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message || "Could not save this content.");
      setBusy(false);
    }
  }

  const list = snippetMenu ? snippets.filter(s => s.kind === snippetMenu) : [];

  return (
    <div className="modalBackdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal postEditor" onSubmit={save}>
        <div className="modalHead">
          <div><p className="eyebrow">{onGrid ? "Creative asset" : "Draft"}</p><h2>{readOnly ? "Content preview" : post ? "Edit content" : "Add new content"}</h2></div>
          <button type="button" className="iconButton" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>

        {post?.approval_note && <div className={"feedbackBox" + (post.status === "Changes requested" ? " changes" : "")}><MessageSquare size={15} /><div>
          <b>Approver feedback{post.reviewed_at ? " · " + new Date(post.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</b>
          <p>{post.approval_note}</p>{!readOnly && post.status === "Changes requested" && <small>After updating, set the status back to “Awaiting approval”.</small>}
        </div></div>}

        {/* Images */}
        {images.length > 0 && (
          <div className="mediaBlock">
            <div className={"carousel" + (isStory ? " story" : "")}>
              <img src={images[Math.min(slide, images.length - 1)]?.url} alt="" />
              {images.length > 1 && <>
                <button type="button" className="carNav left" aria-label="Previous image" onClick={() => setSlide(s => Math.max(0, s - 1))}><ChevronLeft size={16} /></button>
                <button type="button" className="carNav right" aria-label="Next image" onClick={() => setSlide(s => Math.min(images.length - 1, s + 1))}><ChevronRight size={16} /></button>
                <div className="carDots">{images.map((_, i) => <span key={i} className={i === Math.min(slide, images.length - 1) ? "on" : ""} />)}</div>
              </>}
            </div>
            {!readOnly && <div className="thumbRow">
              {images.map((img, i) => <div key={img.url} className={"thumb" + (i === slide ? " on" : "")}>
                <img src={img.url} alt="" onClick={() => setSlide(i)} />
                <div className="thumbTools">
                  {i > 0 && <button type="button" aria-label="Move left" onClick={() => moveImage(i, -1)}><ChevronLeft size={12} /></button>}
                  <button type="button" aria-label="Remove image" onClick={() => { setImages(l => l.filter((_, j) => j !== i)); setSlide(0); }}><X size={12} /></button>
                  {i < images.length - 1 && <button type="button" aria-label="Move right" onClick={() => moveImage(i, 1)}><ChevronRight size={12} /></button>}
                </div>
                {i === 0 && <small>Cover</small>}
              </div>)}
              {images.length < 10 && <label className="thumb addThumb"><Plus size={18} /><input type="file" accept="image/*" multiple onChange={e => addImages(e.target.files)} /></label>}
            </div>}
          </div>
        )}
        {!readOnly && images.length === 0 && (
          <label className="uploadBox"><Upload size={22} /><b>Choose images</b><small>One for a post, up to 10 for a carousel · JPG, PNG or WebP</small>
            <input type="file" accept="image/*" multiple onChange={e => addImages(e.target.files)} /></label>
        )}

        {frameSrc && <CropEditor src={frameSrc} x={crop.x} y={crop.y} disabled={readOnly} onChange={(x, y) => setCrop({ x, y })} />}

        <fieldset className="plainFieldset" disabled={readOnly}>
          <div className="formGrid">
            <label>Content title<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Summer in a cup" /></label>
            <label>Publication date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
            <label>Format<select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}>{formats.map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Location<select value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}>{locations.map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Content pillar<select value={form.pillar} onChange={e => setForm({ ...form, pillar: e.target.value })}>{pillars.map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{statusOptions(post?.status || "").map(x => <option key={x}>{x}</option>)}</select></label>
          </div>

          {form.format === "Reel" && (
            <div className="coverRow">
              <div className="coverPreview">{cover ? <img src={cover.url} alt="" /> : <span>No cover</span>}</div>
              <div><b>Reel cover</b><p className="muted">The image your Reel shows in the grid. Without one, the first image is used.</p>
                {!readOnly && <div className="coverActions">
                  <label className="secondary fileButton">{cover ? "Replace cover" : "Choose cover"}<input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setCover({ url: URL.createObjectURL(f), file: f }); }} /></label>
                  {cover && <button type="button" className="textButton" onClick={() => setCover(null)}>Remove</button>}
                </div>}
              </div>
            </div>
          )}

          <label className="captionLabel">Caption / creative notes
            <textarea ref={captionRef} rows={5} value={form.caption} onChange={e => setForm({ ...form, caption: e.target.value })} placeholder="Caption, CTA or notes for the team…" />
          </label>
          <div className="captionBar">
            <span className={form.caption.length > CAPTION_LIMIT ? "over" : ""}>{form.caption.length.toLocaleString()} / {CAPTION_LIMIT.toLocaleString()}</span>
            <span className={hashtagCount > HASHTAG_LIMIT ? "over" : ""}>{hashtagCount} / {HASHTAG_LIMIT} hashtags</span>
            {!readOnly && <div className="captionTools">
              <button type="button" className={"chipButton" + (snippetMenu === "caption" ? " on" : "")} onClick={() => setSnippetMenu(m => m === "caption" ? null : "caption")}><FileText size={13} /> Templates</button>
              <button type="button" className={"chipButton" + (snippetMenu === "hashtags" ? " on" : "")} onClick={() => setSnippetMenu(m => m === "hashtags" ? null : "hashtags")}><Hash size={13} /> Hashtag groups</button>
            </div>}
          </div>
          {snippetMenu && !readOnly && (
            <div className="snippetMenu">
              {list.length === 0 && <p className="muted">{snippetMenu === "caption" ? "No templates yet. Write a caption you reuse often, then save it here." : "No hashtag groups yet. Type your hashtags in the caption, then save them as a group."}</p>}
              {list.map(s => <div key={s.id} className="snippetItem">
                <button type="button" onClick={() => insertText(s.body)}><b>{s.name}</b><span>{s.body}</span></button>
                <button type="button" className="taskDelete" aria-label={`Delete ${s.name}`} onClick={() => deleteSnippet(s)}><Trash2 size={13} /></button>
              </div>)}
              <button type="button" className="textButton" onClick={() => saveSnippet(snippetMenu)}>
                <Plus size={13} /> {snippetMenu === "caption" ? "Save current caption as a template" : "Save the caption’s hashtags as a group"}
              </button>
            </div>
          )}

          {!isStory && <div className="gridToggle" role="radiogroup" aria-label="Where this post goes">
            <button type="button" role="radio" aria-checked={onGrid} className={onGrid ? "on" : ""} onClick={() => setOnGrid(true)}>On the grid</button>
            <button type="button" role="radio" aria-checked={!onGrid} className={!onGrid ? "on" : ""} onClick={() => setOnGrid(false)}>Save as draft</button>
          </div>}
        </fieldset>

        {post && <Comments postId={post.id} workspaceId={workspaceId} userId={userId} />}

        {error && <p className="notice">{error}</p>}
        <div className="modalActions">
          {readOnly ? <>
            <button type="button" className="secondary" onClick={onClose}>Close</button>
            {post?.status === "Awaiting approval" && <button type="button" className="primary" onClick={onOpenApprovals}>Review in Approvals</button>}
          </> : <>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button className="primary" disabled={busy}>{busy ? "Saving…" : post ? "Save changes" : onGrid ? "Add to studio" : "Save draft"}</button>
          </>}
        </div>
      </form>
    </div>
  );
}
