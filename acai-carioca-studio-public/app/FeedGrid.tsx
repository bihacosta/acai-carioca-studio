"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, pointerWithin, useDroppable, type CollisionDetection,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DropAnimation, defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Inbox, ImagePlus } from "lucide-react";
import { dominantColor } from "@/lib/media";

export type FeedPost = {
  id: string; title: string; image_url: string; publish_date: string | null; format: string;
  crop_x?: number; crop_y?: number; cover_url?: string | null; extra_images?: string[]; on_grid?: boolean; status?: string;
};
export type Profile = { title: string; subtitle?: string | null; avatar_url?: string | null };

/** The picture Instagram shows in the grid: Reel cover if set, else the first image. */
export const thumbOf = (p: FeedPost) => (p.format === "Reel" && p.cover_url) ? p.cover_url : p.image_url;
export const framing = (p: FeedPost) => `${p.crop_x ?? 50}% ${p.crop_y ?? 50}%`;

function TileContent({ post }: { post: FeedPost }) {
  const src = thumbOf(post);
  return <>
    {src ? <img src={src} alt={post.title} draggable={false} style={{ objectPosition: framing(post) }} />
      : <div className="tileEmpty"><ImagePlus size={20} /><span>{post.title}</span></div>}
    <div className="tileOverlay"><b>{post.title}</b><span>{post.publish_date || "No date"} · {post.format}</span></div>
    {post.format === "Reel" && <span className="formatIcon">▶</span>}
    {(post.format === "Carousel" || (post.extra_images?.length ?? 0) > 0) && post.format !== "Reel" && <span className="formatIcon">▤</span>}
  </>;
}

function SortableTile({ post, disabled, onOpen, color, className = "feedTile" }: {
  post: FeedPost; disabled: boolean; onOpen: () => void; color?: string | null; className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: post.id, disabled, transition: { duration: 420, easing: "cubic-bezier(.32,.72,0,1)" }
  });
  return (
    <article ref={setNodeRef}
      className={className + (isDragging ? " isPlaceholder" : "") + (disabled ? "" : " canDrag")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onOpen} {...attributes} {...listeners}>
      <TileContent post={post} />
    </article>
  );
}

function GridZone({ children, sorting }: { children: React.ReactNode; sorting: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "grid-zone" });
  return <div ref={setNodeRef} className={"feedGrid" + (sorting ? " isSorting" : "") + (isOver ? " isOver" : "")}>{children}</div>;
}
function DraftZone({ children, count }: { children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: "draft-zone" });
  return <div ref={setNodeRef} className={"draftTray" + (isOver ? " isOver" : "")}>{children}{count === 0 && <p className="draftEmpty">Drafts you add with “Save as draft” wait here. Drag one onto the grid when it’s ready.</p>}</div>;
}

const ZONES = ["grid-zone", "draft-zone"];
/** Prefer the photo under the pointer; fall back to the empty area of the grid or drafts; then the nearest photo. */
const collision: CollisionDetection = args => {
  const hits = pointerWithin(args);
  const tiles = hits.filter(h => !ZONES.includes(String(h.id)));
  if (tiles.length) return tiles;
  const draftZone = hits.find(h => h.id === "draft-zone");
  if (draftZone) return [draftZone];
  // Between photos (or while the page scrolls): use the nearest photo, so it never jumps to the end.
  const nearest = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => !ZONES.includes(String(c.id))) });
  return nearest.length ? nearest : hits;
};

const dropAnimation: DropAnimation = {
  duration: 380, easing: "cubic-bezier(.32,.72,0,1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.35" } } })
};

export default function FeedGrid({ posts, drafts, disabled, mode, profile, showColors, onOpen, onReorder, onPlaceDraft, onMoveToDrafts }: {
  posts: FeedPost[]; drafts: FeedPost[]; disabled: boolean; mode: "grid" | "phone"; profile: Profile; showColors: boolean;
  onOpen: (p: FeedPost) => void; onReorder: (ordered: FeedPost[]) => void;
  onPlaceDraft: (draftId: string, index: number) => void; onMoveToDrafts: (postId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [colors, setColors] = useState<Record<string, string | null>>({});
  useEffect(() => setMounted(true), []);

  // Work out each photo's main color (only when the color view is on).
  useEffect(() => {
    if (!showColors) return;
    let alive = true;
    posts.forEach(p => {
      const src = thumbOf(p);
      if (!src || colors[p.id] !== undefined) return;
      dominantColor(src).then(c => { if (alive) setColors(prev => ({ ...prev, [p.id]: c })); });
    });
    return () => { alive = false; };
  }, [showColors, posts]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const all = [...posts, ...drafts];
  const active = all.find(p => p.id === activeId) || null;
  const isDraft = (id: string) => drafts.some(d => d.id === id);

  function handleStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
  }
  function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over) return;
    const aid = String(a.id), oid = String(over.id);
    const fromDraft = isDraft(aid);
    const overDraft = oid === "draft-zone" || isDraft(oid);
    if (fromDraft && !overDraft) {
      const idx = oid === "grid-zone" ? posts.length : Math.max(0, posts.findIndex(p => p.id === oid));
      onPlaceDraft(aid, idx);
      return;
    }
    if (!fromDraft && overDraft) { onMoveToDrafts(aid); return; }
    if (fromDraft || aid === oid) return;
    const from = posts.findIndex(p => p.id === aid), to = posts.findIndex(p => p.id === oid);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(posts, from, to));
  }

  const grid = (
    <SortableContext items={posts.map(p => p.id)} strategy={rectSortingStrategy} disabled={disabled}>
      <GridZone sorting={!!activeId}>
        {posts.map(p => <SortableTile key={p.id} post={p} disabled={disabled} onOpen={() => onOpen(p)} color={showColors ? colors[p.id] : null} />)}
        {posts.length === 0 && <p className="draftEmpty gridEmpty">Drag a draft here to start your grid.</p>}
      </GridZone>
    </SortableContext>
  );

  const palette = showColors && posts.length > 0 && (
    <div className="paletteStrip" aria-label="Feed colors, in grid order">
      {posts.slice(0, 12).map(p => <span key={p.id} title={p.title} style={{ background: colors[p.id] || "var(--sand)" }} />)}
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={handleStart} onDragEnd={handleEnd} onDragCancel={() => setActiveId(null)}>
      <div className={"feedLayout" + (mode === "phone" ? " phoneMode" : "")}>
        <div className="feedMain">
          {mode === "phone" ? (
            <div className="phoneFrame">
              <div className="phoneNotch" />
              <div className="phoneScreen">
                <div className="phoneProfile">
                  <div className="phoneAvatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : "AC"}</div>
                  <div className="phoneStats"><div><b>{posts.length}</b><span>posts</span></div><div><b>—</b><span>followers</span></div><div><b>—</b><span>following</span></div></div>
                </div>
                <div className="phoneBio"><b>{profile.title}</b>{profile.subtitle && <p>{profile.subtitle}</p>}</div>
                <div className="phoneButtons"><span>Following</span><span>Message</span></div>
                {palette}
                {grid}
              </div>
            </div>
          ) : <>{palette}{grid}</>}
        </div>
        {!disabled && (
          <aside className="draftsPanel">
            <div className="draftsHead"><Inbox size={16} /><b>Drafts</b><span>{drafts.length}</span></div>
            <SortableContext items={drafts.map(d => d.id)} strategy={rectSortingStrategy}>
              <DraftZone count={drafts.length}>
                {drafts.map(d => <SortableTile key={d.id} post={d} disabled={false} onOpen={() => onOpen(d)} className="feedTile draftTile" />)}
              </DraftZone>
            </SortableContext>
          </aside>
        )}
      </div>
      {mounted && createPortal(
        <DragOverlay dropAnimation={dropAnimation} zIndex={60}>
          {active ? <article className="feedTile liftedTile"><TileContent post={active} /></article> : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
