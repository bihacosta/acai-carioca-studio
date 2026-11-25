"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DropAnimation, defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type FeedPost = { id: string; title: string; image_url: string; publish_date: string | null; format: string };

function TileContent({ post }: { post: FeedPost }) {
  return <>
    <img src={post.image_url} alt={post.title} draggable={false} />
    <div className="tileOverlay"><b>{post.title}</b><span>{post.publish_date || "No date"} · {post.format}</span></div>
    {post.format === "Reel" && <span className="formatIcon">▶</span>}
    {post.format === "Carousel" && <span className="formatIcon">▤</span>}
  </>;
}

function SortableTile({ post, disabled, onOpen }: { post: FeedPost; disabled: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: post.id, disabled,
    transition: { duration: 420, easing: "cubic-bezier(.32,.72,0,1)" }
  });
  return (
    <article
      ref={setNodeRef}
      className={"feedTile" + (isDragging ? " isPlaceholder" : "") + (disabled ? "" : " canDrag")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <TileContent post={post} />
    </article>
  );
}

const dropAnimation: DropAnimation = {
  duration: 380,
  easing: "cubic-bezier(.32,.72,0,1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.35" } } })
};

export default function FeedGrid({ posts, disabled, onOpen, onReorder }: {
  posts: FeedPost[]; disabled: boolean; onOpen: (p: FeedPost) => void; onReorder: (ordered: FeedPost[]) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const sensors = useSensors(
    // Mouse: start dragging after moving 6px, so a simple click still opens the post.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Touch: press and hold briefly to lift a photo, so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const active = posts.find(p => p.id === activeId) || null;

  function handleStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
  }
  function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const from = posts.findIndex(p => p.id === a.id), to = posts.findIndex(p => p.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(posts, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleStart} onDragEnd={handleEnd} onDragCancel={() => setActiveId(null)}>
      <SortableContext items={posts.map(p => p.id)} strategy={rectSortingStrategy} disabled={disabled}>
        <div className={"feedGrid" + (activeId ? " isSorting" : "")}>
          {posts.map(p => <SortableTile key={p.id} post={p} disabled={disabled} onOpen={() => onOpen(p)} />)}
        </div>
      </SortableContext>
      {/* Rendered at page level so the lifted photo stays exactly under your finger. */}
      {mounted && createPortal(
        <DragOverlay dropAnimation={dropAnimation} zIndex={60}>
          {active ? <article className="feedTile liftedTile"><TileContent post={active} /></article> : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
