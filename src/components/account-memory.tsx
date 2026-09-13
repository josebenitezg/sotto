"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AccountMemory({
  accountId,
  email,
  demoMarkdown,
}: {
  accountId: string;
  email: string;
  demoMarkdown?: string;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const url = `/api/memory?accountId=${encodeURIComponent(accountId)}`;
  const download =
    demoMarkdown === undefined
      ? url
      : `data:text/markdown;charset=utf-8,${encodeURIComponent(demoMarkdown)}`;
  return (
    <section className="mt-12" aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="mb-3 text-sm leading-5 font-medium text-muted-foreground"
      >
        Memory
      </h2>
      <div className="space-y-4 rounded-md border p-4">
        <div className="space-y-1 text-small">
          <p className="mono break-all">{email}</p>
          <p className="text-muted-foreground">
            Your learned outreach patterns, read before each new AI
            classification.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">Open memory</Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-[640px]">
              <SheetHeader className="border-b">
                <SheetTitle>memory.md</SheetTitle>
                <SheetDescription className="mono break-all">
                  {email}
                </SheetDescription>
              </SheetHeader>
              {open ? (
                <MemoryDocument
                  key={accountId}
                  url={url}
                  demoMarkdown={demoMarkdown}
                />
              ) : null}
              <div className="mt-auto border-t p-6">
                <Button variant="outline" asChild>
                  <a href={download} download="memory.md">
                    Download memory.md
                  </a>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <Button variant="outline" asChild>
            <a href={download} download="memory.md">
              Download memory.md
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Updates automatically while open. Only this Gmail account uses this
          memory.
        </p>
      </div>
    </section>
  );
}

function MemoryDocument({
  url,
  demoMarkdown,
}: {
  url: string;
  demoMarkdown?: string;
}) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (demoMarkdown !== undefined) return;
    const controller = new AbortController();
    let refreshing = false;
    async function refresh() {
      if (document.hidden || refreshing || controller.signal.aborted) return;
      refreshing = true;
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (response.status === 401 || response.status === 404)
            setMarkdown(null);
          throw new Error("Memory unavailable");
        }
        const text = await response.text();
        if (controller.signal.aborted) return;
        setMarkdown(text);
        setCheckedAt(new Date());
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        refreshing = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [url, demoMarkdown, retry]);
  const content = demoMarkdown ?? markdown;
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-2">
      {error ? (
        <div className="space-y-2 text-small" role="alert">
          <p>
            {content
              ? "Could not refresh. Showing the last loaded memory."
              : "Could not load memory. Check your connection and sign-in."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRetry((r) => r + 1)}
          >
            Try again
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" role="status">
          {demoMarkdown !== undefined
            ? "Demo memory"
            : checkedAt
              ? `Updates automatically · Last checked ${checkedAt.toLocaleTimeString("en-US")}`
              : "Loading memory…"}
        </p>
      )}
      {content !== null ? (
        <pre
          aria-label="Account memory"
          className="mono whitespace-pre-wrap break-words text-small leading-6"
        >
          {content}
        </pre>
      ) : null}
    </div>
  );
}
