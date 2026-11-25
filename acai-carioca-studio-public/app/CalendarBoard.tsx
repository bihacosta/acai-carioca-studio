"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { thumbOf, framing, type FeedPost } from "./FeedGrid";

type CalPost = FeedPost & { status: string };
type CalTask = { id: string; title: string; status: string; due_date: string | null };

const statusClass = (s: string) => s === "Awaiting approval" ? " awaitingPost" : s === "Changes requested" ? " changesPost" : s === "Approved" ? " approvedPost" : "";

function DayPost({ post, canEdit, onOpen }: { post: CalPost; canEdit: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: post.id, disabled: !canEdit });
  const src = thumbOf(post);
  return (
    <button ref={setNodeRef} type="button" className={"dayPost" + statusClass(post.status) + (isDragging ? " isPlaceholder" : "") + (canEdit ? " canDrag" : "")}
      title={`${post.title} · ${post.status}`} onClick={onOpen} {...attributes} {...listeners}>
      {src ? <img src={src} alt="" style={{ objectPosition: framing(post) }} /> : <span className="dayDot" />}
      <span>{post.title}</span>
    </button>
  );
}

function Day({ date, day, today, children }: { date: string; day: number; today: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "day:" + date });
  return <div ref={setNodeRef} className={"day" + (isOver ? " dropTarget" : "") + (today ? " today" : "")}><b>{day}</b>{children}</div>;
}

export default function CalendarBoard({ month, posts, tasks, canEdit, onOpen, onMove, onTaskClick }: {
  month: string; posts: CalPost[]; tasks: CalTask[]; canEdit: boolean;
  onOpen: (p: CalPost) => void; onMove: (postId: string, date: string) => void; onTaskClick: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );
  const monthDate = new Date(month + "-01T12:00:00");
  const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const offset = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();
  const todayISO = new Date().toISOString().slice(0, 10);
  const active = posts.find(p => p.id === activeId);

  function end(e: DragEndEvent) {
    setActiveId(null);
    const over = e.over?.id ? String(e.over.id) : "";
    if (!over.startsWith("day:")) return;
    const date = over.slice(4);
    const post = posts.find(p => p.id === e.active.id);
    if (post && post.publish_date !== date) onMove(post.id, date);
  }

  return (
    <DndContext sensors={sensors} onDragStart={e => setActiveId(String(e.active.id))} onDragEnd={end} onDragCancel={() => setActiveId(null)}>
      <div className="calendar">
        <div className="weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <span key={d}>{d}</span>)}</div>
        <div className="calendarGrid">
          {Array.from({ length: offset }, (_, i) => <div key={"e" + i} className="dayBlank" />)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, "0")}`;
            return <Day key={date} date={date} day={i + 1} today={date === todayISO}>
              {posts.filter(p => p.publish_date === date).map(p => <DayPost key={p.id} post={p} canEdit={canEdit} onOpen={() => onOpen(p)} />)}
              {tasks.filter(t => t.due_date === date).map(t => <button key={t.id} type="button" className={"dayTask" + (t.status === "Done" ? " done" : "")} onClick={onTaskClick} title={`Task: ${t.title} · ${t.status}`}>
                <span>{t.title}</span><small>Task · {t.status}</small></button>)}
            </Day>;
          })}
        </div>
      </div>
      {mounted && createPortal(
        <DragOverlay dropAnimation={{ duration: 320, easing: "cubic-bezier(.32,.72,0,1)" }} zIndex={60}>
          {active ? <div className={"dayPost liftedChip" + statusClass(active.status)}>{thumbOf(active) && <img src={thumbOf(active)} alt="" style={{ objectPosition: framing(active) }} />}<span>{active.title}</span></div> : null}
        </DragOverlay>, document.body)}
    </DndContext>
  );
}
