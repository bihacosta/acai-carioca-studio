"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Mail, CheckSquare, CalendarDays } from "lucide-react";
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

function Day({ date, day, today, selected, onSelect, children }: { date: string; day: number; today: boolean; selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "day:" + date });
  return <div ref={setNodeRef} onClick={onSelect} className={"day" + (isOver ? " dropTarget" : "") + (today ? " today" : "") + (selected ? " selected" : "")}><b>{day}</b>{children}</div>;
}

const statusDot = (s: string) => s === "Awaiting approval" ? "awaiting" : s === "Changes requested" ? "changes" : s === "Approved" ? "approved" : "";

type CalEmail = { id: string; title: string; subject: string | null; send_date: string | null; status: string };

export default function CalendarBoard({ month, posts, tasks, emails = [], canEdit, onOpen, onMove, onTaskClick, onEmailClick }: {
  month: string; posts: CalPost[]; tasks: CalTask[]; emails?: CalEmail[]; canEdit: boolean; onEmailClick?: () => void;
  onOpen: (p: CalPost) => void; onMove: (postId: string, date: string) => void; onTaskClick: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 6 } })
  );
  const monthDate = new Date(month + "-01T12:00:00");
  const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const offset = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();
  const todayISO = new Date().toISOString().slice(0, 10);
  const active = posts.find(p => p.id === activeId);
  // Phone view: tap a day to list everything on it below the calendar.
  const inMonth = todayISO.slice(0, 7) === month;
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [month]);
  const firstBusy = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)
    .find(d => posts.some(p => p.publish_date === d) || emails.some(m => m.send_date === d) || tasks.some(t => t.due_date === d));
  const selected = picked || (inMonth ? todayISO : firstBusy || `${month}-01`);
  const dayPosts = posts.filter(p => p.publish_date === selected);
  const dayEmails = emails.filter(m => m.send_date === selected);
  const dayTasks = tasks.filter(t => t.due_date === selected);
  const selectedLabel = new Date(selected + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

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
            const dp = posts.filter(p => p.publish_date === date), de = emails.filter(m => m.send_date === date), dt = tasks.filter(t => t.due_date === date);
            const marks = [...dp.map(p => ({ k: "p" + p.id, cls: "post " + statusDot(p.status), src: thumbOf(p), pos: framing(p) })), ...de.map(m => ({ k: "e" + m.id, cls: "email" + (m.status === "Sent" ? " done" : ""), src: "", pos: "" })), ...dt.map(t => ({ k: "t" + t.id, cls: "task" + (t.status === "Done" ? " done" : ""), src: "", pos: "" }))];
            return <Day key={date} date={date} day={i + 1} today={date === todayISO} selected={date === selected} onSelect={() => setPicked(date)}>
              {marks.length > 0 && <span className="dayMarks" aria-label={`${marks.length} item${marks.length === 1 ? "" : "s"}`}>
                {marks.slice(0, 3).map(m => m.src ? <img key={m.k} className={"markThumb " + m.cls} src={m.src} alt="" style={{ objectPosition: m.pos }} /> : <i key={m.k} className={"markDot " + m.cls} />)}
                {marks.length > 3 && <small>+{marks.length - 3}</small>}
              </span>}
              {dp.map(p => <DayPost key={p.id} post={p} canEdit={canEdit} onOpen={() => onOpen(p)} />)}
              {emails.filter(m => m.send_date === date).map(m => <button key={m.id} type="button" className={"dayEmail" + (m.status === "Sent" ? " done" : "")} onClick={onEmailClick} title={`Email: ${m.subject || m.title} · ${m.status}`}>
                <span><Mail size={10} /> {m.subject || m.title}</span><small>Email · {m.status}</small></button>)}
              {tasks.filter(t => t.due_date === date).map(t => <button key={t.id} type="button" className={"dayTask" + (t.status === "Done" ? " done" : "")} onClick={onTaskClick} title={`Task: ${t.title} · ${t.status}`}>
                <span>{t.title}</span><small>Task · {t.status}</small></button>)}
            </Day>;
          })}
        </div>
      </div>
      <section className="dayAgenda" aria-label={`Plan for ${selectedLabel}`}>
        <h3>{selectedLabel}</h3>
        {dayPosts.length + dayEmails.length + dayTasks.length === 0 ? <p className="agendaEmpty"><CalendarDays size={16} /> Nothing planned for this day.</p> : <ul>
          {dayPosts.map(p => { const src = thumbOf(p); return <li key={p.id}><button type="button" className={"agendaItem" + statusClass(p.status)} onClick={() => onOpen(p)}>
            {src ? <img src={src} alt="" style={{ objectPosition: framing(p) }} /> : <span className="agendaIcon" />}
            <span className="agendaText"><b>{p.title}</b><small>{p.format} · {p.status}</small></span></button></li>; })}
          {dayEmails.map(m => <li key={m.id}><button type="button" className={"agendaItem agendaEmail" + (m.status === "Sent" ? " done" : "")} onClick={onEmailClick}>
            <span className="agendaIcon"><Mail size={16} /></span><span className="agendaText"><b>{m.subject || m.title}</b><small>Email · {m.status}</small></span></button></li>)}
          {dayTasks.map(t => <li key={t.id}><button type="button" className={"agendaItem agendaTask" + (t.status === "Done" ? " done" : "")} onClick={onTaskClick}>
            <span className="agendaIcon"><CheckSquare size={16} /></span><span className="agendaText"><b>{t.title}</b><small>Task · {t.status}</small></span></button></li>)}
        </ul>}
      </section>
      {mounted && createPortal(
        <DragOverlay dropAnimation={{ duration: 320, easing: "cubic-bezier(.32,.72,0,1)" }} zIndex={60}>
          {active ? <div className={"dayPost liftedChip" + statusClass(active.status)}>{thumbOf(active) && <img src={thumbOf(active)} alt="" style={{ objectPosition: framing(active) }} />}<span>{active.title}</span></div> : null}
        </DragOverlay>, document.body)}
    </DndContext>
  );
}
