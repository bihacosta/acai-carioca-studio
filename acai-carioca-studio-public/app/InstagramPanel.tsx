"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Instagram, RefreshCw, Heart, MessageCircle, Eye, Bookmark, Send, ExternalLink, Unplug, Play, Images } from "lucide-react";

type Connection = { username: string | null; profile_picture_url: string | null; account_type: string | null; connected_at: string; last_synced_at: string | null; last_error: string | null };
type Media = {
  ig_id: string; caption: string | null; media_type: string | null; product_type: string | null; media_url: string | null; thumbnail_url: string | null;
  permalink: string | null; posted_at: string | null; like_count: number | null; comments_count: number | null; reach: number | null; views: number | null; saves: number | null; shares: number | null;
};

const fmt = (n: number | null | undefined) => n == null ? "–" : n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString("en-US");
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

async function call(path: string, body: object) {
  const { data: { session } } = await supabase!.auth.getSession();
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Something went wrong.");
  return out;
}

export default function InstagramPanel({ workspaceId, clientName, canConnect, canSync, pending, onPendingDone, onNotice }: {
  workspaceId: string; clientName: string; canConnect: boolean; canSync: boolean;
  pending: { code?: string | null; state?: string | null; error?: string | null } | null; onPendingDone: () => void; onNotice: (msg: string) => void;
}) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "connect" | "sync" | "disconnect" | "finish">("");
  const [confirmOff, setConfirmOff] = useState(false);
  const autoSynced = useRef<string | null>(null);

  async function load() {
    if (!supabase) return;
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from("instagram_connections").select("username,profile_picture_url,account_type,connected_at,last_synced_at,last_error").eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("instagram_media").select("ig_id,caption,media_type,product_type,media_url,thumbnail_url,permalink,posted_at,like_count,comments_count,reach,views,saves,shares").eq("workspace_id", workspaceId).order("posted_at", { ascending: false })
    ]);
    setConn((c as Connection) || null);
    setMedia((m || []) as Media[]);
    setLoading(false);
    return c as Connection | null;
  }

  async function sync(quiet = false) {
    setBusy("sync");
    try { const r = await call("/api/instagram/sync", { workspaceId }); if (!quiet) onNotice(`Instagram synced: ${r.synced} posts updated.`); }
    catch (e: any) { if (!quiet) onNotice("Couldn't sync Instagram: " + e.message); }
    setBusy(""); await load();
  }

  useEffect(() => {
    setLoading(true); setConn(null); setMedia([]);
    load().then(c => {
      // Refresh on open when the last sync is over an hour old.
      if (c && canSync && autoSynced.current !== workspaceId && (!c.last_synced_at || Date.now() - new Date(c.last_synced_at).getTime() > 3600 * 1000)) {
        autoSynced.current = workspaceId; sync(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Back from Instagram: finish connecting.
  useEffect(() => {
    if (!pending) return;
    if (pending.error) { onNotice("Instagram wasn't connected: " + pending.error); onPendingDone(); return; }
    if (!pending.code || !pending.state) { onPendingDone(); return; }
    setBusy("finish");
    call("/api/instagram/finish", { code: pending.code, state: pending.state })
      .then(r => onNotice(`Connected @${r.username}.` + (r.syncError ? ` First sync failed: ${r.syncError}` : ` ${r.synced} posts synced.`)))
      .catch(e => onNotice("Instagram wasn't connected: " + e.message))
      .finally(() => { setBusy(""); onPendingDone(); load(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  async function connect() {
    setBusy("connect");
    try { const r = await call("/api/instagram/start", { workspaceId }); window.location.href = r.url; }
    catch (e: any) { onNotice(e.message); setBusy(""); }
  }
  async function disconnect() {
    if (!confirmOff) { setConfirmOff(true); setTimeout(() => setConfirmOff(false), 3500); return; }
    setBusy("disconnect");
    try { await call("/api/instagram/disconnect", { workspaceId }); onNotice("Instagram disconnected."); }
    catch (e: any) { onNotice(e.message); }
    setBusy(""); setConfirmOff(false); load();
  }

  const last30 = useMemo(() => media.filter(m => m.posted_at && Date.now() - new Date(m.posted_at).getTime() < 30 * 86400 * 1000), [media]);
  const totals = useMemo(() => {
    const sum = (k: keyof Media) => last30.reduce((a, m) => a + (Number(m[k]) || 0), 0);
    const reachOnes = last30.filter(m => m.reach != null);
    const best = [...last30].sort((a, b) => ((b.like_count || 0) + (b.comments_count || 0) + (b.saves || 0) + (b.shares || 0)) - ((a.like_count || 0) + (a.comments_count || 0) + (a.saves || 0) + (a.shares || 0)))[0];
    return { posts: last30.length, likes: sum("like_count"), comments: sum("comments_count"), avgReach: reachOnes.length ? Math.round(sum("reach") / reachOnes.length) : null, best };
  }, [last30]);

  if (loading || busy === "finish") return <p className="muted">{busy === "finish" ? "Connecting Instagram…" : "Loading Instagram…"}</p>;

  if (!conn) return (
    <div className="igEmpty">
      <span className="igBadge"><Instagram size={26} /></span>
      <h3>See {clientName}'s real Instagram here.</h3>
      <p>Connect the Instagram account to bring in the published posts with their likes, comments, reach and views, right next to the plan.</p>
      {canConnect ? <button className="primary" disabled={!!busy} onClick={connect}><Instagram size={16} /> {busy === "connect" ? "Opening Instagram…" : "Connect Instagram"}</button>
        : <p className="muted">Ask the client's owner or an admin to connect it.</p>}
      <small>Works with Instagram Business and Creator accounts. Content Atelier only reads posts and numbers here; it doesn't post anything.</small>
    </div>
  );

  return (
    <div className="igPanel">
      <div className="igHead">
        <div className="igWho">
          {conn.profile_picture_url ? <img src={conn.profile_picture_url} alt="" /> : <span className="igBadge small"><Instagram size={18} /></span>}
          <div><b>@{conn.username}</b><small>{busy === "sync" ? "Syncing…" : `Synced ${ago(conn.last_synced_at)}`}</small></div>
        </div>
        <div className="igActions">
          {canSync && <button className="secondary" disabled={!!busy} onClick={() => sync()}><RefreshCw size={14} className={busy === "sync" ? "spin" : ""} /> Sync now</button>}
          {canConnect && <button className={"iconButton" + (confirmOff ? " igDanger" : "")} disabled={!!busy} onClick={disconnect} title="Disconnect Instagram"><Unplug size={14} /> {confirmOff ? "Disconnect?" : ""}</button>}
        </div>
      </div>
      {conn.last_error && <p className="igError">Last sync had a problem: {conn.last_error}</p>}

      <div className="igStats">
        <div><b>{totals.posts}</b><small>posts, last 30 days</small></div>
        <div><b>{fmt(totals.avgReach)}</b><small>average reach</small></div>
        <div><b>{fmt(totals.likes)}</b><small>likes</small></div>
        <div><b>{fmt(totals.comments)}</b><small>comments</small></div>
      </div>

      {media.length === 0 ? <div className="empty"><Images size={28} /><h3>No posts yet.</h3><p>Published posts show up here after a sync.</p></div> :
        <div className="igGrid">
          {media.map(m => {
            const src = m.media_type === "VIDEO" ? (m.thumbnail_url || m.media_url) : (m.media_url || m.thumbnail_url);
            const isBest = totals.best?.ig_id === m.ig_id && totals.posts > 2;
            return <a key={m.ig_id} className="igCard" href={m.permalink || undefined} target="_blank" rel="noreferrer">
              <div className="igThumb">
                {src ? <img src={src} alt="" loading="lazy" /> : <Instagram size={22} />}
                {m.media_type === "VIDEO" && <span className="igType"><Play size={13} /></span>}
                {m.media_type === "CAROUSEL_ALBUM" && <span className="igType"><Images size={13} /></span>}
                {isBest && <span className="igBest">Top post</span>}
              </div>
              <div className="igBody">
                <small>{m.posted_at ? new Date(m.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""} {m.product_type === "REELS" ? "· Reel" : m.media_type === "CAROUSEL_ALBUM" ? "· Carousel" : "· Post"}<ExternalLink size={11} /></small>
                {m.caption && <p>{m.caption}</p>}
                <div className="igNums">
                  <span title="Likes"><Heart size={13} /> {fmt(m.like_count)}</span>
                  <span title="Comments"><MessageCircle size={13} /> {fmt(m.comments_count)}</span>
                  <span title={m.views != null ? "Views" : "Reach"}><Eye size={13} /> {fmt(m.views ?? m.reach)}</span>
                  {m.saves != null && <span title="Saves"><Bookmark size={13} /> {fmt(m.saves)}</span>}
                  {m.shares != null && <span title="Shares"><Send size={13} /> {fmt(m.shares)}</span>}
                </div>
              </div>
            </a>;
          })}
        </div>}
    </div>
  );
}
