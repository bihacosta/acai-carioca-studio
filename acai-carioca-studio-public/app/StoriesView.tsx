"use client";

import { Plus } from "lucide-react";
import type { FeedPost } from "./FeedGrid";

type StoryPost = FeedPost & { status: string };

const label = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Stories planned day by day, in the 9:16 shape people see them. */
export default function StoriesView({ stories, canEdit, onOpen, onAdd }: {
  stories: StoryPost[]; canEdit: boolean; onOpen: (p: StoryPost) => void; onAdd: (date?: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const dated = stories.filter(s => s.publish_date).sort((a, b) => (a.publish_date || "").localeCompare(b.publish_date || ""));
  const upcoming = dated.filter(s => (s.publish_date || "") >= today);
  const past = dated.filter(s => (s.publish_date || "") < today).reverse().slice(0, 14);
  const undated = stories.filter(s => !s.publish_date);
  const group = (list: StoryPost[]) => {
    const map = new Map<string, StoryPost[]>();
    list.forEach(s => { const k = s.publish_date || "none"; map.set(k, [...(map.get(k) || []), s]); });
    return Array.from(map.entries());
  };
  const Row = ({ date, items }: { date: string; items: StoryPost[] }) => (
    <section className="storyDay">
      <div className="storyDayHead"><b>{date === "none" ? "No date yet" : date === today ? "Today" : label(date)}</b><span>{items.length} {items.length === 1 ? "story" : "stories"}</span></div>
      <div className="storyRow">
        {items.map(s => <button key={s.id} type="button" className="storyTile" onClick={() => onOpen(s)} title={`${s.title} · ${s.status}`}>
          {s.image_url ? <img src={s.image_url} alt={s.title} /> : <span className="tileEmpty" />}
          <span className="storyTitle">{s.title}</span>
        </button>)}
        {canEdit && date !== "none" && <button type="button" className="storyTile addStory" onClick={() => onAdd(date)} aria-label={`Add a story on ${date}`}><Plus size={20} /></button>}
      </div>
    </section>
  );
  if (stories.length === 0) return (
    <div className="empty"><h3>No Stories planned yet.</h3><p>Plan your Stories here in their real 9:16 shape, day by day.</p>
      {canEdit && <button className="primary" onClick={() => onAdd()}><Plus size={16} /> Plan a Story</button>}</div>
  );
  return (
    <div className="storiesView">
      {canEdit && <button className="secondary addStoryButton" onClick={() => onAdd()}><Plus size={15} /> Plan a Story</button>}
      {group(upcoming).map(([d, items]) => <Row key={d} date={d} items={items} />)}
      {undated.length > 0 && <Row date="none" items={undated} />}
      {past.length > 0 && <><p className="eyebrow storyPastLabel">Recent</p>{group(past).map(([d, items]) => <Row key={d} date={d} items={items} />)}</>}
    </div>
  );
}
