"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/*
  A fictional inbox that filters itself. A reading line sweeps down the
  list; every cold email it passes is pushed out and dissolves into a dot
  grid while the rows below close the gap. With a mouse, the line follows
  the cursor, so moving back up brings the emails back: that is Undo.
*/
const rows = [
  {
    id: "ana",
    from: "Ana Martínez",
    subject: "Our next step, together",
    preview: "Loved our conversation. Shall we pick it up tomorrow?",
    time: "10:42",
    cold: false,
  },
  {
    id: "growth",
    from: "Growth Partners",
    subject: "Quick question about your growth",
    preview: "We help companies like yours book more meetings…",
    time: "10:31",
    cold: true,
  },
  {
    id: "team",
    from: "Your team",
    subject: "Ready for your review",
    preview: "Here is the first version of the project.",
    time: "10:18",
    cold: false,
  },
  {
    id: "pipeline",
    from: "Pipeline Studio",
    subject: "15 minutes this week?",
    preview: "Just following up on my previous email…",
    time: "09:56",
    cold: true,
  },
  {
    id: "sofia",
    from: "Sofía North",
    subject: "We would like to try your product",
    preview: "Could we start with twenty seats next month?",
    time: "09:40",
    cold: false,
  },
];
const ROW = 56;
const SWEEP_MS = 1800;
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function InboxDemo() {
  const count = rows.length;
  const [scan, setScan] = useState(0);
  const [hoverable, setHoverable] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const sweep = useCallback((delay = 0) => {
    cancelAnimationFrame(frame.current);
    setScan(0);
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now + delay;
      const p = Math.min(1, Math.max(0, (now - start) / SWEEP_MS));
      setScan(easeInOut(p));
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setHoverable(matchMedia("(hover: hover) and (pointer: fine)").matches);
    if (reduced) {
      setScan(1);
      return;
    }
    const timer = setTimeout(() => sweep(), 600);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [sweep]);

  const read = (index: number) => scan >= (index + 0.6) / count;
  const gone = rows.map((row, index) => row.cold && read(index));
  const moved = gone.filter(Boolean).length;
  const shiftFor = (index: number) =>
    gone.slice(0, index).filter(Boolean).length;

  return (
    <section
      aria-label="Demo inbox with sample emails"
      className="w-full overflow-hidden rounded-md border bg-background-2"
    >
      <div className="flex h-11 items-center justify-between border-b px-4 text-small">
        <span className="flex items-center gap-2">
          Inbox
          <span className="mono text-xs text-muted-foreground">
            {count - moved}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">Demo</span>
      </div>
      <div
        ref={listRef}
        className="demo-list relative"
        style={{ height: count * ROW, "--scan": scan } as React.CSSProperties}
        onPointerMove={(event) => {
          if (!hoverable || !listRef.current) return;
          cancelAnimationFrame(frame.current);
          const box = listRef.current.getBoundingClientRect();
          setScan(
            Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
          );
        }}
        onClick={() => {
          if (!hoverable) sweep(moved ? 400 : 0);
        }}
      >
        {rows.map((row, index) => {
          const isGone = gone[index];
          return (
            <div
              key={row.id}
              className="demo-row flex items-center border-b px-4"
              data-gone={isGone}
              aria-hidden={isGone}
              style={{
                top: index * ROW,
                transform: isGone
                  ? "translateX(32px)"
                  : `translateY(${-shiftFor(index) * ROW}px)`,
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={`truncate text-small ${row.cold ? "text-muted-foreground" : "font-medium"}`}
                  >
                    {row.from}
                  </span>
                  <span className="mono text-xs text-muted-foreground">
                    {row.time}
                  </span>
                </div>
                <p className="truncate text-small text-muted-foreground">
                  <span className={row.cold ? "" : "text-foreground"}>
                    {row.subject}
                  </span>
                  <span aria-hidden="true"> · </span>
                  {row.preview}
                </p>
              </div>
            </div>
          );
        })}
        <div
          aria-hidden="true"
          className="demo-line pointer-events-none absolute inset-x-0 top-0 h-px bg-gray-600"
          data-active={scan > 0 && scan < 1}
        />
      </div>
      <div className="flex h-12 items-center justify-between border-t px-4">
        <span
          className="flex items-center gap-2 text-small text-muted-foreground"
          aria-live="polite"
        >
          Sotto/Cold
          <span className="mono text-xs">{moved}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => sweep(moved ? 400 : 0)}
        >
          Replay
        </Button>
      </div>
    </section>
  );
}
