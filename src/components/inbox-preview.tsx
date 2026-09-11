"use client";

import { useState } from "react";
import { SottoMark } from "./brand";

const messages = [
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
];

export function InboxPreview() {
  const [quiet, setQuiet] = useState(false);
  return (
    <div
      className="overflow-hidden rounded-lg border bg-background-2"
      aria-label="Demo with sample emails"
    >
      <div className="flex h-11 items-center justify-between border-b px-4 text-[13px]">
        <span className="flex items-center gap-2">
          Inbox
          <span className="mono text-xs text-muted-foreground">
            {quiet ? 2 : 4}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">Demo</span>
      </div>
      <div
        className="demo-messages relative h-64 overflow-hidden"
        data-quiet={quiet}
      >
        {messages.map((message, index) => (
          <div
            className={`demo-message absolute inset-x-0 top-0 flex h-16 items-center gap-3 border-b px-4 ${message.cold ? "demo-message-cold" : "demo-message-keep"}`}
            key={message.id}
            style={
              {
                "--row": index,
                "--quiet-row": message.id === "ana" ? 0 : 1,
              } as React.CSSProperties
            }
            aria-hidden={quiet && message.cold}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`truncate text-[13px] ${message.cold ? "text-muted-foreground" : "font-medium"}`}
                >
                  {message.from}
                </span>
                <span className="mono text-xs text-muted-foreground">
                  {message.time}
                </span>
              </div>
              <p className="truncate text-[13px] leading-[18px] text-muted-foreground">
                <span className={message.cold ? "" : "text-foreground"}>
                  {message.subject}
                </span>
                <span aria-hidden="true"> · </span>
                {message.preview}
              </p>
            </div>
          </div>
        ))}
        <p
          className="demo-quiet-note absolute inset-x-0 top-[152px] text-center text-[13px] text-muted-foreground"
          aria-hidden={!quiet}
        >
          Two pitches moved to Sotto/Cold.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <SottoMark className="size-4" />
          Sotto/Cold
          <span className="mono text-xs" aria-live="polite">
            {quiet ? 2 : 0}
          </span>
        </span>
        <button
          type="button"
          className="pressable h-8 rounded-sm border border-border px-3 text-[13px] transition-colors duration-[120ms] hover:border-border-hover hover:bg-gray-100"
          onClick={() => setQuiet(!quiet)}
          aria-pressed={quiet}
        >
          {quiet ? "Undo" : "Filter"}
        </button>
      </div>
    </div>
  );
}
