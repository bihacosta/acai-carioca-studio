"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, closestCorners, pointerWithin, useDroppable,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
  type DropAnimation, defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type BoardStatus = "To do" | "In progress" | "Done";
export type BoardTask = { id: string; status: BoardStatus; sort_order?: number };
type Columns = Record<BoardStatus, string[]>;

const COLUMNS: { status: BoardStatus; title: string; className?: string }[] = [
  { status: "To do", title: "To do" },
  { status: "In progress", title: "In progress" },
  { status: "Done", title: "Completed", className: "completedColumn" }
];
const isColumn = (id: string) => COLUMNS.some(c => c.status === id);

/** Prefer the card under the pointer, then the column under it, then the nearest card. */
const collision: CollisionDetection = args => {
  const hits = pointerWithin(args);
  const cards = hits.filter(h => !isColumn(String(h.id)));
  if (cards.length) return cards;
  if (hits.length) return hits;
  return closestCorners(args);
};

const dropAnimation: DropAnimation = {
  duration: 340, easing: "cubic-bezier(.32,.72,0,1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.35" } } })
};

function group<T extends BoardTask>(tasks: T[]): Columns {
  const cols: Columns = { "To do": [], "In progress": [], "Done": [] };
  [...tasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).forEach(t => cols[t.status]?.push(t.id));
  return cols;
}

function Column({ status, title, className, count, children }: { status: BoardStatus; title: string; className?: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={"todoColumn" + (className ? " " + className : "") + (isOver ? " isOver" : "")}>
      <div className="todoColumnHead"><h3>{title}</h3><span>{count}</span></div>
      {children}
      {count === 0 && <p className="columnEmpty">Drop a task here</p>}
    </section>
  );
}

function SortableCard({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled, transition: { duration: 320, easing: "cubic-bezier(.32,.72,0,1)" } });
  // Keyboard dragging only when the card itself has focus, so typing in its buttons/menus still works.
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.target === e.currentTarget) listeners?.onKeyDown?.(e); };
  return (
    <div ref={setNodeRef} className={"taskSlot" + (isDragging ? " isDragging" : "")} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} onKeyDown={onKeyDown} aria-roledescription="draggable task">
      {children}
    </div>
  );
}

export default function TaskBoard<T extends BoardTask>({ tasks, disabled = false, renderCard, onChange }: {
  tasks: T[]; disabled?: boolean;
  renderCard: (task: T) => React.ReactNode;
  /** Called after a drop with every task whose column or position changed. */
  onChange: (updates: { id: string; status: BoardStatus; sort_order: number }[]) => void;
}) {
  const [cols, setCols] = useState<Columns>(() => group(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Keep in sync with the parent when not dragging.
  useEffect(() => { if (!activeId) setCols(group(tasks)); }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const byId = new Map(tasks.map(t => [t.id, t]));
  const findCol = (id: string, c: Columns = cols): BoardStatus | null =>
    isColumn(id) ? (id as BoardStatus) : (COLUMNS.find(col => c[col.status].includes(id))?.status ?? null);

  function handleStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
  }
  // Move the card into another column while it is being dragged, so the others make room.
  function handleOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const a = String(active.id), o = String(over.id);
    const from = findCol(a), to = findCol(o);
    if (!from || !to || from === to) return;
    setCols(c => {
      const target = c[to];
      const overIndex = isColumn(o) ? target.length : target.indexOf(o);
      const index = overIndex < 0 ? target.length : overIndex;
      return { ...c, [from]: c[from].filter(x => x !== a), [to]: [...target.slice(0, index), a, ...target.slice(index)] };
    });
  }
  function handleEnd(e: DragEndEvent) {
    const { active, over } = e;
    const a = String(active.id);
    setActiveId(null);
    if (!over) { setCols(group(tasks)); return; }
    const col = findCol(a);
    if (!col) return;
    let next = cols;
    const o = String(over.id);
    if (!isColumn(o) && cols[col].includes(o) && o !== a) {
      next = { ...cols, [col]: arrayMove(cols[col], cols[col].indexOf(a), cols[col].indexOf(o)) };
      setCols(next);
    }
    const updates: { id: string; status: BoardStatus; sort_order: number }[] = [];
    COLUMNS.forEach(({ status }) => next[status].forEach((id, i) => {
      const t = byId.get(id);
      if (t && (t.status !== status || (t.sort_order ?? 0) !== i)) updates.push({ id, status, sort_order: i });
    }));
    if (updates.length) onChange(updates);
  }

  const active = activeId ? byId.get(activeId) : null;
  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={handleStart} onDragOver={handleOver} onDragEnd={handleEnd} onDragCancel={() => { setActiveId(null); setCols(group(tasks)); }}>
      <div className="todoBoard">
        {COLUMNS.map(col => (
          <Column key={col.status} status={col.status} title={col.title} className={col.className} count={cols[col.status].length}>
            <SortableContext items={cols[col.status]} strategy={verticalListSortingStrategy}>
              {cols[col.status].map(id => { const t = byId.get(id); return t ? <SortableCard key={id} id={id} disabled={disabled}>{renderCard({ ...t, status: col.status })}</SortableCard> : null; })}
            </SortableContext>
          </Column>
        ))}
      </div>
      {mounted && createPortal(
        <DragOverlay dropAnimation={dropAnimation} zIndex={60}>
          {active ? <div className="taskLift">{renderCard(active)}</div> : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
