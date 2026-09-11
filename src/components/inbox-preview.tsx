"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Inbox,
  Mail,
  RotateCcw,
  Star,
} from "lucide-react";
import { SottoMark } from "./brand";

const messages = [
  {
    id: "ana",
    initials: "AM",
    from: "Ana Martínez",
    subject: "Our next step, together",
    preview: "Loved our conversation. Shall we pick it up tomorrow?",
    time: "10:42",
    cold: false,
  },
  {
    id: "growth",
    initials: "G",
    from: "Growth Partners",
    subject: "Quick question about your growth",
    preview: "We help companies like yours book more meetings…",
    time: "10:31",
    cold: true,
  },
  {
    id: "equipo",
    initials: "E",
    from: "Your team",
    subject: "Ready for your review",
    preview: "Here is the first version of the project.",
    time: "10:18",
    cold: false,
  },
  {
    id: "pipeline",
    initials: "P",
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
    <div className="inbox-demo" aria-label="Demo with sample emails">
      <div className="demo-toolbar">
        <span className="flex items-center gap-2">
          <Mail size={15} />
          Your Gmail, with room.
        </span>
        <span className="demo-sample">Demo</span>
      </div>
      <div className="demo-heading">
        <span className="flex items-center gap-2">
          <Inbox size={18} />
          Inbox <span className="demo-count">{quiet ? 2 : 4}</span>
        </span>
        <span className="text-xs text-muted-foreground">Today</span>
      </div>
      <div className="demo-messages" data-quiet={quiet}>
        {messages.map((message, index) => (
          <div
            className={`demo-message ${message.cold ? "demo-message-cold" : "demo-message-keep"}`}
            key={message.id}
            style={
              {
                "--row": index,
                "--quiet-row": message.id === "ana" ? 0 : 1,
              } as React.CSSProperties
            }
            aria-hidden={quiet && message.cold}
          >
            <span
              className={`demo-avatar ${message.cold ? "demo-avatar-cold" : ""}`}
            >
              {message.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium">
                  {message.from}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {message.time}
                </span>
              </div>
              <p className="truncate text-xs">{message.subject}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {message.preview}
              </p>
            </div>
            {!message.cold && (
              <Star className="demo-star" size={13} aria-label="Starred" />
            )}
          </div>
        ))}
        <div className="demo-quiet-note" aria-hidden={!quiet}>
          <Check size={16} />
          <span>What matters stays here.</span>
        </div>
      </div>
      <div className="demo-sotto-folder" data-active={quiet}>
        <span className="flex items-center gap-2 font-medium">
          <SottoMark className="size-5" /> Sotto / Cold
        </span>
        <span className="flex items-center gap-2 text-xs">
          {quiet ? "2 emails set aside" : "No emails moved"}
          <ArrowDown size={13} />
        </span>
      </div>
      <div className="demo-action-row">
        <p
          className="max-w-[200px] text-xs leading-5 text-muted-foreground"
          aria-live="polite"
        >
          {quiet
            ? "Unsolicited pitches. Kept in Gmail, out of your way."
            : "Two conversations. Two pitches you did not ask for."}
        </p>
        <button
          type="button"
          className="demo-action pressable"
          onClick={() => setQuiet(!quiet)}
          aria-pressed={quiet}
        >
          {quiet ? (
            <>
              <RotateCcw size={14} />
              See it again
            </>
          ) : (
            <>
              See it with Sotto
              <ArrowUpRight size={15} />
            </>
          )}
        </button>
      </div>
      <p className="demo-caption">Sample inbox · not connected to your email</p>
    </div>
  );
}
