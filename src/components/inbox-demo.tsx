"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/*
  A fictional inbox that filters itself, in the app's own list surface.
  A reading line sweeps down once the list is on screen. Each cold email
  it passes dissolves out of the inbox through a 4px dot grid and
  re-materializes under Sotto/Cold with its reason, while the rows below
  close the gap. With a mouse the line follows the cursor; moving back up
  brings the emails back. That is the undo, shown instead of explained.
*/
const rows = [
  {
    id: "ana",
    subject: "Our next step, together",
    sender: "ana@martinez.example",
    preview: "Loved our conversation. Shall we pick it up tomorrow?",
    cold: false,
  },
  {
    id: "growth",
    subject: "Quick question about your growth",
    sender: "hello@growthpartners.example",
    preview: "We help companies like yours book more meetings…",
    reason: "A pitch for a lead generation service. No prior conversation.",
    cold: true,
  },
  {
    id: "team",
    subject: "Ready for your review",
    sender: "team@studio.example",
    preview: "Here is the first version of the project.",
    cold: false,
  },
  {
    id: "pipeline",
    subject: "15 minutes this week?",
    sender: "marcos@pipeline.example",
    preview: "Just following up on my previous email…",
    reason: "A vendor's second follow-up. You never wrote back.",
    cold: true,
  },
  {
    id: "sofia",
    subject: "We would like to try your product",
    sender: "sofia@north.example",
    preview: "Could we start with twenty seats next month?",
    cold: false,
  },
];
const ROW = 56;
const GROUP = 40;
const COUNT = rows.length;
const HEIGHT = COUNT * ROW + GROUP;
const SWEEP_MS = 1600;
const HYSTERESIS = 8;
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const coldRank = rows.reduce<Record<string, number>>((acc, row, index) => {
  if (row.cold) acc[row.id] = rows.slice(0, index).filter((r) => r.cold).length;
  return acc;
}, {});

// A row is read once the line passes 60% of its height, with an 8px band
// so a cursor resting on the threshold does not flicker.
function readSet(lineY: number, previous: boolean[]) {
  return rows.map((row, index) => {
    if (!row.cold) return false;
    const enter = (index + 0.6) * ROW;
    return previous[index] ? lineY >= enter - HYSTERESIS : lineY >= enter;
  });
}

export function InboxDemo() {
  const [gone, setGone] = useState<boolean[]>(() => rows.map(() => false));
  const [reduced, setReduced] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const section = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const goneRef = useRef(gone);
  const frame = useRef(0);
  const sweeping = useRef(false);
  const userActed = useRef(false);
  const announceTimer = useRef(0);
  goneRef.current = gone;

  const place = useCallback((lineY: number) => {
    const el = list.current;
    if (!el) return;
    el.style.setProperty("--scan", `${lineY}px`);
    const next = readSet(lineY, goneRef.current);
    if (next.some((value, index) => value !== goneRef.current[index]))
      setGone(next);
  }, []);

  const sweep = useCallback(
    (delay = 0) => {
      cancelAnimationFrame(frame.current);
      const el = list.current;
      if (!el) return;
      sweeping.current = true;
      el.dataset.sweeping = "true";
      el.dataset.line = "true";
      place(0);
      let start: number | null = null;
      let last = 0;
      const tick = (now: number) => {
        if (start === null) start = now + delay;
        // A hidden tab pauses frames; resume where the line was, do not jump.
        if (last && now - last > 250) start += now - last - 16;
        last = now;
        const p = Math.min(1, Math.max(0, (now - start) / SWEEP_MS));
        place(easeInOut(p) * COUNT * ROW);
        if (p < 1) frame.current = requestAnimationFrame(tick);
        else {
          sweeping.current = false;
          delete el.dataset.sweeping;
          delete el.dataset.line;
        }
      };
      frame.current = requestAnimationFrame(tick);
    },
    [place],
  );

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    if (!("registerProperty" in CSS)) el.dataset.noDither = "true";
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setGone(rows.map((row) => row.cold));
      return;
    }
    let timer = 0;
    // Play once, when the list is on screen and the tab is actually visible.
    const start = () => {
      timer = window.setTimeout(() => sweep(), 500);
    };
    const whenVisible = () => {
      if (document.visibilityState === "visible") return start();
      document.addEventListener("visibilitychange", whenVisible, {
        once: true,
      });
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        whenVisible();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", whenVisible);
      clearTimeout(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [sweep]);

  const moved = gone.filter(Boolean).length;

  // One sentence for assistive tech, after the person acts and the list settles.
  useEffect(() => {
    if (!userActed.current) return;
    clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(
      () =>
        setAnnouncement(
          `${COUNT - moved} in the inbox, ${moved} moved to Sotto/Cold.`,
        ),
      600,
    );
    return () => clearTimeout(announceTimer.current);
  }, [moved]);

  const replay = () => {
    userActed.current = true;
    if (reduced) {
      setGone((current) =>
        current.some(Boolean) ? rows.map(() => false) : rows.map((r) => r.cold),
      );
      return;
    }
    sweep(moved ? 400 : 0);
  };

  const shiftFor = (index: number) =>
    gone.slice(0, index).filter(Boolean).length;

  return (
    <section
      ref={section}
      aria-label="Demo of five sample emails"
      className="demo w-full overflow-hidden rounded-md border"
    >
      <div className="flex h-11 items-center justify-between border-b pr-2 pl-4 text-small">
        <span>Inbox</span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Demo</span>
          <Button
            variant="ghost"
            onClick={replay}
            className="[@media(pointer:coarse)]:h-11"
          >
            Replay
          </Button>
        </span>
      </div>
      <ul
        ref={list}
        className="demo-list relative list-none"
        style={
          {
            height: HEIGHT,
            "--demo-height": `${HEIGHT}px`,
          } as React.CSSProperties
        }
        onPointerMove={(event) => {
          if (event.pointerType === "touch" || sweeping.current || reduced)
            return;
          if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
          const el = list.current;
          if (!el) return;
          userActed.current = true;
          el.dataset.line = "true";
          const box = el.getBoundingClientRect();
          const y = Math.min(COUNT * ROW, Math.max(0, event.clientY - box.top));
          place(y);
        }}
        onPointerLeave={() => {
          if (!sweeping.current && list.current)
            delete list.current.dataset.line;
        }}
      >
        {rows.map((row, index) => {
          const out = gone[index];
          return (
            <li
              key={row.id}
              className="demo-row flex items-center border-b px-4"
              data-out={out}
              aria-hidden={out}
              style={{
                top: index * ROW,
                transform: `translateY(${-shiftFor(index) * ROW}px)`,
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate leading-5 font-medium">{row.subject}</p>
                <p className="mt-0.5 truncate text-small text-muted-foreground">
                  <span className="mono">{row.sender}</span>
                  <span aria-hidden="true"> · </span>
                  {row.preview}
                </p>
              </div>
            </li>
          );
        })}
        <li
          className="demo-group flex items-center justify-between border-b px-4 text-small text-muted-foreground"
          style={{
            top: COUNT * ROW,
            transform: `translateY(${-moved * ROW}px)`,
          }}
        >
          <span className="flex items-center gap-2">
            Sotto/Cold
            <span className="mono text-xs">{moved}</span>
          </span>
        </li>
        {rows
          .filter((row) => row.cold)
          .map((row) => {
            const index = rows.indexOf(row);
            const shown = gone[index];
            return (
              <li
                key={`${row.id}-moved`}
                className="demo-row flex items-center border-b px-4"
                data-in={shown}
                aria-hidden={!shown}
                style={{
                  top: COUNT * ROW + GROUP + coldRank[row.id] * ROW,
                  transform: `translateY(${-moved * ROW}px)`,
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate leading-5 font-medium">
                    {row.subject}
                  </p>
                  <p className="mt-0.5 truncate text-small text-muted-foreground">
                    <span className="mono">{row.sender}</span>
                    <span aria-hidden="true"> · </span>
                    {row.reason}
                  </p>
                </div>
              </li>
            );
          })}
        <li
          aria-hidden="true"
          className="demo-line pointer-events-none absolute inset-x-0 top-0 h-px bg-gray-600"
        />
      </ul>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
