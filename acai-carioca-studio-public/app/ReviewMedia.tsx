"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";

/** Post media shown the way Instagram shows it: 4:5 frame, swipeable carousel, Reel cover with a play button. */
export default function ReviewMedia({ title, format, image, extra = [], cover, video, onOpen }: {
  title: string; format: string; image: string; extra?: string[]; cover?: string | null; video?: string | null; onOpen?: () => void;
}) {
  const isReel = format === "Reel";
  const slides = isReel ? [cover || image].filter(Boolean) : [image, ...extra].filter(Boolean);
  const [i, setI] = useState(0);
  const startX = useRef<number | null>(null);
  const go = (d: number) => setI(cur => Math.min(slides.length - 1, Math.max(0, cur + d)));
  const safeVideo = video && /^https?:\/\//i.test(video) ? video : null;

  return (
    <div className={"reviewMedia" + (isReel ? " reel" : "")}
      onTouchStart={e => { startX.current = e.touches[0].clientX; }}
      onTouchEnd={e => { if (startX.current === null) return; const dx = e.changedTouches[0].clientX - startX.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); startX.current = null; }}>
      <div className="reviewTrack" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((src, k) => <img key={k} src={src} alt={k === 0 ? title : ""} onClick={onOpen} draggable={false} />)}
      </div>
      {isReel && (safeVideo
        ? <a className="reviewPlay" href={safeVideo} target="_blank" rel="noopener noreferrer" aria-label="Watch the video"><Play size={26} fill="currentColor" /></a>
        : <span className="reviewPlay muted" aria-hidden="true"><Play size={26} /></span>)}
      {slides.length > 1 && <>
        {i > 0 && <button type="button" className="reviewArrow left" aria-label="Previous image" onClick={() => go(-1)}><ChevronLeft size={18} /></button>}
        {i < slides.length - 1 && <button type="button" className="reviewArrow right" aria-label="Next image" onClick={() => go(1)}><ChevronRight size={18} /></button>}
        <div className="reviewDots">{slides.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}</div>
        <span className="reviewCount">{i + 1}/{slides.length}</span>
      </>}
    </div>
  );
}
