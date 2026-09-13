"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
  A fictional inbox. Once it is on screen, each cold email disintegrates:
  its letters drift out to the right, the avatar dissolves through a dot
  grid, and the rows below close the gap. What matters stays. Replay
  reassembles the letters and runs it again. Every random offset comes
  from a seeded hash so the server and the client render the same markup.
*/
const rows = [
  {
    id: "ana",
    from: "Ana Martínez",
    subject: "Our next step, together",
    snippet: "Loved our conversation. Same time tomorrow?",
    time: "10:42",
    cold: false,
  },
  {
    id: "growth",
    from: "Growth Partners",
    subject: "Quick question",
    snippet: "We help teams like yours book 3x more meetings",
    time: "10:31",
    cold: true,
  },
  {
    id: "tomas",
    from: "Tomás Rey",
    subject: "Ready for your review",
    snippet: "First version of the project is up.",
    time: "10:18",
    cold: false,
  },
  {
    id: "pipeline",
    from: "Pipeline Studio",
    subject: "15 minutes this week?",
    snippet: "Just following up on my previous email…",
    time: "9:56",
    cold: true,
  },
  {
    id: "sofia",
    from: "Sofía North",
    subject: "Trying your product",
    snippet: "Could we start with twenty seats next month?",
    time: "9:40",
    cold: false,
  },
];
const ROW = 56;
const COUNT = rows.length;
const STAGGER_MS = 520;
const coldIndexes = rows.flatMap((row, index) => (row.cold ? [index] : []));

// Deterministic pseudo-random in [0, 1). Integer math only: Math.sin differs
// in its last bits between Node and browsers, which breaks hydration.
function noise(seed: number) {
  let h = (seed * 0x9e3779b1) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const round = (value: number) => Math.round(value * 10) / 10;

/* Each letter is its own element so it can leave on its own path. */
function Scatter({
  text,
  seed,
  className,
}: {
  text: string;
  seed: number;
  className?: string;
}) {
  const letters = [...text];
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      {letters.map((letter, index) => {
        const n = seed * 1000 + index;
        const progress = index / Math.max(1, letters.length - 1);
        const style = {
          "--dx": `${round(28 + noise(n) * 72)}px`,
          "--dy": `${round(-36 + noise(n + 1) * 44)}px`,
          "--r": `${round(-18 + noise(n + 2) * 36)}deg`,
          "--d": `${Math.round(progress * 260 + noise(n + 3) * 140)}ms`,
        } as React.CSSProperties;
        return (
          <span
            key={index}
            className="demo-char"
            style={style}
            aria-hidden="true"
          >
            {letter === " " ? " " : letter}
          </span>
        );
      })}
    </span>
  );
}

export function InboxDemo() {
  const [gone, setGone] = useState<boolean[]>(() => rows.map(() => false));
  const [done, setDone] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const section = useRef<HTMLElement>(null);
  const replayButton = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  const userActed = useRef(false);

  const clear = () => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const run = useCallback((delay = 0) => {
    clear();
    setDone(false);
    setGone(rows.map(() => false));
    coldIndexes.forEach((index, order) =>
      later(
        () =>
          setGone((current) =>
            current.map((value, i) => (i === index ? true : value)),
          ),
        delay + order * STAGGER_MS,
      ),
    );
    later(() => setDone(true), delay + coldIndexes.length * STAGGER_MS + 900);
  }, []);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    if (!("registerProperty" in CSS)) el.dataset.noDither = "true";
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setGone(rows.map((row) => row.cold));
      setDone(true);
      return;
    }
    // Once, when the list is on screen, the tab is visible and fonts are in.
    const start = () =>
      document.fonts.ready.then(() => run(900)).catch(() => run(900));
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
      clear();
    };
  }, [run]);

  const moved = gone.filter(Boolean).length;

  useEffect(() => {
    if (!userActed.current || !done) return;
    setAnnouncement(
      `${COUNT - moved} in the inbox, ${moved} moved to Sotto/Cold.`,
    );
  }, [done, moved]);

  const replay = () => {
    userActed.current = true;
    // The button hides while it runs; focus must not sit on a hidden node.
    if (document.activeElement === replayButton.current)
      section.current?.focus({ preventScroll: true });
    if (reduced) {
      setGone((current) =>
        current.some(Boolean) ? rows.map(() => false) : rows.map((r) => r.cold),
      );
      return;
    }
    // Letters fly back first, then the inbox is read again.
    run(moved ? 900 : 0);
  };

  const shiftFor = (index: number) =>
    gone.slice(0, index).filter(Boolean).length;

  return (
    <section
      ref={section}
      aria-label="Sample inbox with fictional emails"
      tabIndex={-1}
      className="demo w-full overflow-hidden rounded-md border outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex h-11 items-center justify-between border-b pr-2 pl-4 text-small">
        <span className="font-medium">Inbox</span>
        <Button
          ref={replayButton}
          variant="ghost"
          size="icon-sm"
          aria-label="Replay"
          onClick={replay}
          tabIndex={done ? 0 : -1}
          aria-hidden={!done}
          className={done ? "opacity-100" : "pointer-events-none opacity-0"}
        >
          <RotateCcw />
        </Button>
      </div>
      <ul
        className="demo-list relative list-none"
        style={{ height: COUNT * ROW }}
      >
        {rows.map((row, index) => {
          const out = gone[index];
          return (
            <li
              key={row.id}
              className="demo-row flex items-center gap-3 border-b px-4"
              data-gone={out}
              aria-hidden={out}
              style={{
                top: index * ROW,
                transform: `translateY(${-shiftFor(index) * ROW}px)`,
              }}
            >
              <span
                className="demo-avatar grid size-7 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-medium"
                aria-hidden="true"
              >
                {row.from.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1 whitespace-nowrap">
                <div className="flex items-baseline justify-between gap-3">
                  {row.cold ? (
                    <Scatter
                      text={row.from}
                      seed={index * 7 + 1}
                      className="text-small font-medium"
                    />
                  ) : (
                    <span className="text-small font-medium">{row.from}</span>
                  )}
                  {row.cold ? (
                    <Scatter
                      text={row.time}
                      seed={index * 7 + 2}
                      className="mono text-xs text-muted-foreground"
                    />
                  ) : (
                    <span className="mono text-xs text-muted-foreground">
                      {row.time}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "text-small text-muted-foreground",
                    row.cold ? "whitespace-nowrap" : "truncate",
                  )}
                >
                  {row.cold ? (
                    <>
                      <Scatter
                        text={row.subject}
                        seed={index * 7 + 3}
                        className="text-foreground"
                      />
                      <Scatter text=" · " seed={index * 7 + 4} />
                      <Scatter text={row.snippet} seed={index * 7 + 5} />
                    </>
                  ) : (
                    <>
                      <span className="text-foreground">{row.subject}</span>
                      <span aria-hidden="true"> · </span>
                      {row.snippet}
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex h-10 items-center justify-between border-t px-4 text-small text-muted-foreground">
        <span>Sotto/Cold</span>
        <span className="mono text-xs">{moved}</span>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
