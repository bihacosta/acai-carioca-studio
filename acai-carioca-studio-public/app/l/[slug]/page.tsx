"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Page = { workspace_id: string; title: string; subtitle: string | null; avatar_url: string | null };
type Link = { id: string; label: string; url: string };

const safeHref = (u: string) => /^(https?:\/\/|mailto:|tel:)/i.test(u) ? u : "#";

export default function LinkPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!supabase || !slug) { setState("missing"); return; }
    (async () => {
      const { data: p } = await supabase!.from("bio_pages").select("workspace_id,title,subtitle,avatar_url").eq("slug", String(slug).toLowerCase()).eq("published", true).maybeSingle();
      if (!p) { setState("missing"); return; }
      const { data: l } = await supabase!.from("bio_links").select("id,label,url").eq("workspace_id", (p as Page).workspace_id).order("sort_order");
      setPage(p as Page); setLinks((l || []) as Link[]); setState("ready");
      document.title = (p as Page).title;
    })();
  }, [slug]);

  return (
    <main className="linkPage">
      {state === "loading" && <div className="linkCard"><p className="muted">Loading…</p></div>}
      {state === "missing" && <div className="linkCard"><h1>Page not found</h1><p className="muted">This link page doesn’t exist or isn’t published yet.</p></div>}
      {state === "ready" && page && (
        <div className="linkCard">
          <div className="linkAvatar">{page.avatar_url ? <img src={page.avatar_url} alt="" /> : "AC"}</div>
          <h1>{page.title}</h1>
          {page.subtitle && <p className="linkBio">{page.subtitle}</p>}
          <nav className="linkList">
            {links.map(l => <a key={l.id} href={safeHref(l.url)} target={l.url.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{l.label}</a>)}
          </nav>
        </div>
      )}
    </main>
  );
}
