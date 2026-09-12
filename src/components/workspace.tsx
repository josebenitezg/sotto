"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight, ExternalLink, Plus, X } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GoogleMark } from "./brand";
import { Wordmark } from "./public-shell";
import { AccountMenu } from "./account-menu";
import { GoogleDataNotice } from "./google-data-notice";
import type { Account, Dashboard, Decision, Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

type Action = { action: string; [key: string]: unknown };
type ContextValue = {
  data: Dashboard;
  act: (action: Action, success: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  clearError: () => void;
};
const WorkspaceContext = createContext<ContextValue | null>(null);
const useWorkspace = () => useContext(WorkspaceContext)!;
const nav = [
  { href: "/review", label: "Inbox" },
  { href: "/accounts", label: "Accounts" },
  { href: "/allowlist", label: "Allowlist" },
  { href: "/settings", label: "Settings" },
];
const modeLabels = {
  review: "Review mode",
  automatic: "Filtering on",
  paused: "Paused",
};
const categoryLabels = {
  cold: "Cold outreach",
  marketing: "Marketing",
  newsletter: "Newsletter",
  transactional: "Transactional",
  personal: "Relevant",
  uncertain: "Needs review",
};
const time = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";

function applyDemo(data: Dashboard, action: Action): Dashboard {
  const next = structuredClone(data);
  const account = next.accounts.find((a) => a.id === action.accountId);
  const decision = next.decisions.find((d) => d.id === action.decisionId);
  if (action.action === "mode" && account) account.mode = action.mode as Mode;
  if (action.action === "startFiltering" && account) {
    account.mode = "automatic";
    next.decisions.forEach((d) => {
      if (d.accountId === account.id && d.state === "suggested")
        d.state = "moved";
    });
  }
  if (action.action === "policy" && account) {
    account.policy.marketing = !!action.marketing;
    account.policy.newsletters = !!action.newsletters;
    if (typeof action.instructions === "string")
      account.policy.instructions = action.instructions;
  }
  if (action.action === "reviewed" && account)
    account.reviewedAt = new Date().toISOString();
  if (action.action === "sync" && account)
    account.lastSync = new Date().toISOString();
  if (action.action === "disconnect" && account) {
    account.connected = false;
    account.mode = "paused";
  }
  if (action.action === "deleteGmailData" && account) {
    next.accounts = next.accounts.filter((a) => a.id !== account.id);
    next.decisions = next.decisions.filter((d) => d.accountId !== account.id);
    next.rules = next.rules.filter((r) => r.accountId !== account.id);
  }
  if (decision && ["keep", "move", "restore"].includes(action.action))
    decision.state =
      action.action === "move"
        ? "moved"
        : action.action === "restore"
          ? "restored"
          : "kept";
  if (action.action === "allow") {
    if (
      !next.rules.some(
        (r) => r.accountId === action.accountId && r.sender === action.sender,
      )
    )
      next.rules.push({
        id: crypto.randomUUID(),
        accountId: action.accountId as string,
        sender: action.sender as string,
        createdAt: new Date().toISOString(),
      });
    next.decisions.forEach((d) => {
      if (
        d.accountId === action.accountId &&
        d.sender === action.sender &&
        d.state === "suggested"
      )
        d.state = "kept";
    });
  }
  if (action.action === "removeRule")
    next.rules = next.rules.filter((r) => r.id !== action.ruleId);
  return next;
}

export function Workspace({
  initial,
  children,
}: {
  initial: Dashboard;
  children: ReactNode;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const actionVersion = useRef(0);
  const pathname = usePathname();
  useEffect(() => {
    if (initial.demo) return;
    const controller = new AbortController();
    let refreshing = false;
    const timer = setInterval(async () => {
      if (document.hidden || inFlight.current || refreshing) return;
      refreshing = true;
      const version = actionVersion.current;
      try {
        const response = await fetch("/api/dashboard", {
          signal: controller.signal,
        });
        if (response.ok) {
          const next = await response.json();
          if (!inFlight.current && version === actionVersion.current)
            setData(next);
        }
      } catch {
        /* Keep last known state; explicit actions surface errors inline. */
      } finally {
        refreshing = false;
      }
    }, 5000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [initial.demo]);
  async function act(action: Action, success: string) {
    if (inFlight.current) return false;
    inFlight.current = true;
    actionVersion.current += 1;
    setBusy(true);
    setError(null);
    try {
      if (data.demo) setData((previous) => applyDemo(previous, action));
      else {
        const response = await fetch("/api/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        const result = await response.json();
        if (!response.ok) {
          const refreshed = await fetch("/api/dashboard");
          if (refreshed.ok) setData(await refreshed.json());
          throw new Error(result.error || "We could not complete the change.");
        }
        const fresh = await fetch("/api/dashboard");
        if (!fresh.ok)
          throw new Error(
            "The change was submitted. Refresh the page to check the result.",
          );
        setData(await fresh.json());
      }
      if (success) toast.success(success);
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "We could not complete the change.",
      );
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <WorkspaceContext.Provider
      value={{ data, act, busy, error, clearError: () => setError(null) }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-background-2 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-[880px] items-center justify-between px-4 md:px-6">
          <Wordmark />
          {data.demo ? (
            <span className="text-xs text-muted-foreground">
              Demo · nothing touches Gmail
            </span>
          ) : data.viewer ? (
            <AccountMenu viewer={data.viewer} />
          ) : data.authenticated ? (
            <form action="/api/logout" method="post">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          ) : null}
        </div>
        <nav
          aria-label="Main navigation"
          className="scrollbar-none mx-auto flex max-w-[880px] overflow-x-auto px-2 md:px-4"
        >
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 shrink-0 items-center px-2 text-[13px] transition-colors duration-[120ms] focus-visible:-outline-offset-2 after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-foreground after:opacity-0 after:content-['']",
                  active
                    ? "text-foreground after:opacity-100"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-[880px] px-4 pt-8 pb-16 md:px-6 md:pt-10"
      >
        {error ? (
          <p
            role="alert"
            className="mb-6 rounded-sm border border-destructive/40 px-3 py-2.5 text-[13px] leading-[18px] text-destructive"
          >
            {error}
          </p>
        ) : null}
        {data.accessActive === false && (
          <p
            role="status"
            className="mb-6 rounded-sm border px-3 py-2.5 text-[13px] leading-[18px]"
          >
            {atAccountLimit(data) &&
            data.accounts.filter((a) => a.connected).length >
              (data.accountLimit ?? Infinity) ? (
              <>
                Your plan covers {data.accountLimit} Gmail account
                {data.accountLimit === 1 ? "" : "s"}. Disconnect one or{" "}
                <Link href="/pricing" className="underline underline-offset-2">
                  change plan
                </Link>{" "}
                to resume filtering.
              </>
            ) : (
              <>
                Filtering is paused until your plan is active.{" "}
                <Link href="/pricing" className="underline underline-offset-2">
                  View plans
                </Link>
                .
              </>
            )}
          </p>
        )}
        {data.allowance &&
          data.accessActive !== false &&
          pathname !== "/settings" && (
            <p
              role="status"
              className="mb-6 text-[13px] leading-5 text-muted-foreground"
            >
              {data.allowance.used} / {data.allowance.limit} emails checked
              {data.allowance.trial ? " during your trial" : " this month"}.
              {data.allowance.exhausted ? " New filtering is paused." : ""}{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Subscription
              </Link>
            </p>
          )}
        {children}
      </main>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "var(--background-2)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "inherit",
            fontSize: "13px",
          },
        }}
      />
    </WorkspaceContext.Provider>
  );
}

function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl leading-8 font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-[60ch] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[13px] leading-[18px] font-medium text-muted-foreground">
      {children}
    </h2>
  );
}
function List({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn("hairline overflow-hidden rounded-md border", className)}
    >
      {children}
    </section>
  );
}
function ConnectButton({ outline = false }: { outline?: boolean }) {
  const { data } = useWorkspace();
  const noticeId = useId();
  return (
    <form
      action="/api/google/connect"
      method="post"
      className="w-full max-w-[420px] space-y-4"
    >
      <input type="hidden" name="intent" value="filter" />
      <Button
        type="submit"
        size="lg"
        variant={outline ? "outline" : "default"}
        disabled={!data.configured || data.demo}
        aria-describedby={noticeId}
      >
        <GoogleMark />
        Connect with Google
      </Button>
      <GoogleDataNotice id={noticeId} />
    </form>
  );
}
function Status({ account }: { account: Account }) {
  const {
    data: { demo, accessActive, allowance },
  } = useWorkspace();
  const label = !account.connected
    ? "Disconnected"
    : accessActive === false || allowance?.exhausted
      ? "Filtering unavailable"
      : account.lastError
        ? "Needs attention"
        : account.mode === "automatic" && !account.writesEnabled && !demo
          ? "Filtering unavailable"
          : modeLabels[account.mode];
  const tone = !account.connected
    ? "text-muted-foreground"
    : label === "Filtering on"
      ? "text-success"
      : "text-warning";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap",
        tone,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-[44ch] text-[13px] leading-[18px] text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}
function AccountPicker({
  value,
  onChange,
  all = false,
}: {
  value: string;
  onChange: (id: string) => void;
  all?: boolean;
}) {
  const { data } = useWorkspace();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Select account" className="min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {all ? <SelectItem value="all">All accounts</SelectItem> : null}
        {data.accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Onboarding() {
  const { data } = useWorkspace();
  return (
    <>
      <PageTitle
        title="Connect Gmail"
        description="Sotto filters cold outreach from the last 7 days, then new mail."
      />
      <ConnectButton />
      {!data.configured ? (
        <p className="mt-3 text-[13px] text-warning">
          The Google connection is still being configured.
        </p>
      ) : null}
    </>
  );
}
function InlineError() {
  const { error } = useWorkspace();
  return error ? (
    <p role="alert" className="text-[13px] leading-[18px] text-destructive">
      {error}
    </p>
  ) : null;
}

export function ReviewPage() {
  const { data, act, busy } = useWorkspace();
  const [accountId, setAccountId] = useState("all");
  const [filter, setFilter] = useState<"suggested" | "kept" | "moved">("moved");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!data.accounts.length) return <Onboarding />;
  const scoped = data.decisions.filter(
    (d) => accountId === "all" || d.accountId === accountId,
  );
  const counts = {
    suggested: scoped.filter((d) => d.state === "suggested").length,
    kept: scoped.filter((d) => ["kept", "restored"].includes(d.state)).length,
    moved: scoped.filter((d) =>
      ["moved", "moving", "restoring"].includes(d.state),
    ).length,
  };
  const visible = scoped.filter((d) =>
    filter === "kept"
      ? ["kept", "restored"].includes(d.state)
      : filter === "moved"
        ? ["moved", "moving", "restoring"].includes(d.state)
        : d.state === "suggested",
  );
  const lastSelected = useRef<Decision | undefined>(undefined);
  const current = data.decisions.find((d) => d.id === selectedId);
  if (current) lastSelected.current = current;
  // The sheet animates out with the row it showed, not an empty panel.
  const selected = selectedId ? current : lastSelected.current;
  const selectedAccount = data.accounts.find(
    (a) => a.id === selected?.accountId,
  );
  const selectedWritesEnabled =
    data.demo || selectedAccount?.writesEnabled === true;
  const syncing = data.accounts.some(
    (a) =>
      (accountId === "all" || a.id === accountId) &&
      a.connected &&
      a.mode !== "paused" &&
      a.sync &&
      (a.sync.pending > 0 || a.sync.failed > 0),
  );
  const accountName = (id: string) =>
    data.accounts.find((a) => a.id === id)?.name;
  return (
    <>
      <PageTitle
        title="Inbox"
        action={<AccountPicker value={accountId} onChange={setAccountId} all />}
      />
      <List label="Filtering status">
        {data.accounts
          .filter((a) => accountId === "all" || a.id === accountId)
          .map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
      </List>
      <div
        className="mt-10 mb-4 flex gap-5 border-b"
        role="group"
        aria-label="Filter decisions"
      >
        {(
          [
            { key: "moved", label: "Moved" },
            { key: "kept", label: "Kept" },
            { key: "suggested", label: "Suggested" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={filter === tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "relative -mb-px flex h-9 items-center gap-2 border-b text-[13px] transition-colors duration-[120ms]",
              filter === tab.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span className="mono text-xs text-muted-foreground">
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>
      <List label="Email decisions">
        {visible.length ? (
          <ul className="hairline">
            {visible.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors duration-[120ms] hover:bg-gray-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate leading-5 font-medium">
                      {d.subject}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] leading-[18px] text-muted-foreground">
                      <span className="mono">{d.sender}</span>
                      {accountId === "all" ? (
                        <>
                          <span aria-hidden="true"> · </span>
                          {accountName(d.accountId)}
                        </>
                      ) : null}
                      <span aria-hidden="true"> · </span>
                      {d.reason}
                    </p>
                  </div>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title={
              filter === "suggested"
                ? syncing
                  ? "Still checking"
                  : "Nothing to review"
                : filter === "moved"
                  ? "Nothing moved yet"
                  : "Nothing kept yet"
            }
            detail={
              filter === "suggested"
                ? "New suggestions appear here with a reason."
                : filter === "moved"
                  ? "Moved emails appear here and under Sotto/Cold in Gmail."
                  : "Emails you keep are recorded here."
            }
          />
        )}
      </List>
      <Sheet
        open={!!selectedId && !!current}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent className="overflow-y-auto">
          {selected ? (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{selected.subject}</SheetTitle>
                <SheetDescription className="mono break-all">
                  {selected.sender}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 px-6 pb-6">
                <div>
                  <p className="text-[13px] text-muted-foreground">
                    {categoryLabels[selected.category]}
                    <span aria-hidden="true"> · </span>
                    <span className="mono">{selectedAccount?.email}</span>
                  </p>
                  <p className="mt-2 leading-5">{selected.reason}</p>
                </div>
                <div className="space-y-2">
                  {selected.state === "suggested" ? (
                    <>
                      <Button
                        className="w-full"
                        disabled={busy || !selectedWritesEnabled}
                        onClick={async () => {
                          if (
                            await act(
                              { action: "move", decisionId: selected.id },
                              "Email moved",
                            )
                          )
                            setSelectedId(null);
                        }}
                      >
                        Move to Sotto/Cold
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await act(
                              { action: "keep", decisionId: selected.id },
                              "Kept in inbox",
                            )
                          )
                            setSelectedId(null);
                        }}
                      >
                        Keep in inbox
                      </Button>
                      {!selectedWritesEnabled ? (
                        <p className="text-[13px] text-warning">
                          Moving emails is disabled for this account.
                        </p>
                      ) : null}
                    </>
                  ) : selected.state === "moved" ? (
                    <Button
                      className="w-full"
                      disabled={busy || !selectedWritesEnabled}
                      onClick={async () => {
                        if (
                          await act(
                            { action: "restore", decisionId: selected.id },
                            "Returned to inbox",
                          )
                        )
                          setSelectedId(null);
                      }}
                    >
                      Return to inbox
                    </Button>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      {["moving", "restoring"].includes(selected.state)
                        ? "Processing…"
                        : "This email stays in Gmail."}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await act(
                          {
                            action: "allow",
                            accountId: selected.accountId,
                            sender: selected.sender,
                          },
                          "Sender allowed",
                        )
                      )
                        setSelectedId(null);
                    }}
                  >
                    Always allow this sender
                  </Button>
                  {selected.gmailUrl ? (
                    <Button variant="ghost" className="w-full" asChild>
                      <a
                        href={selected.gmailUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Gmail
                        <ExternalLink />
                      </a>
                    </Button>
                  ) : null}
                </div>
                <InlineError />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SyncProgress({ account }: { account: Account }) {
  if (!account.sync) return null;
  const { total, done, pending, failed, retrying, scanning } = account.sync;
  const working = scanning || pending > 0;
  if (!working && !retrying && !failed) return null;
  return (
    <div className="mt-3 space-y-2 text-xs text-muted-foreground" role="status">
      {working ? (
        <p className="mono">
          {scanning ? "Finding recent emails…" : `${done} of ${total} checked`}
        </p>
      ) : null}
      {working ? (
        <progress
          className="w-full"
          value={scanning ? undefined : done}
          max={Math.max(1, total)}
          aria-label={`Progress for ${account.name}`}
        />
      ) : null}
      {retrying > 0 || failed > 0 ? (
        <p className="text-warning">
          {retrying > 0 ? `${retrying} waiting to retry. ` : ""}
          {failed > 0 ? `${failed} could not be checked. Use Check now.` : ""}
        </p>
      ) : null}
    </div>
  );
}

function GmailFolderLink({ account }: { account: Account }) {
  const { data } = useWorkspace();
  return (
    <Button variant="ghost" size="sm" asChild>
      <a
        href={
          data.demo
            ? "https://mail.google.com/"
            : `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account.email)}#label/Sotto%2FCold`
        }
        target="_blank"
        rel="noreferrer"
      >
        Sotto/Cold <ExternalLink />
      </a>
    </Button>
  );
}

function FilteringControls({ account }: { account: Account }) {
  const { data, act, busy } = useWorkspace();
  const canFilter =
    data.demo ||
    (account.writesEnabled &&
      data.accessActive !== false &&
      !data.allowance?.exhausted);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {account.mode === "automatic" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            act(
              { action: "mode", accountId: account.id, mode: "paused" },
              "Filtering paused",
            )
          }
        >
          Pause
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={busy || !canFilter}
          onClick={() =>
            act(
              { action: "startFiltering", accountId: account.id },
              "Filtering started",
            )
          }
        >
          {account.mode === "paused" ? "Resume filtering" : "Start filtering"}
        </Button>
      )}
      <GmailFolderLink account={account} />
    </div>
  );
}

function atAccountLimit(data: Dashboard) {
  return (
    data.accountLimit != null &&
    data.accounts.filter((a) => a.connected).length >= data.accountLimit
  );
}
function PlanLimitNote({ limit }: { limit: number }) {
  return (
    <p className="text-[13px] leading-[18px] text-muted-foreground">
      Your plan covers {limit} Gmail account{limit === 1 ? "" : "s"}.{" "}
      <Link
        href="/pricing"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Change plan
      </Link>{" "}
      to add another.
    </p>
  );
}
function AccountRow({
  account,
  children,
}: {
  account: Account;
  children?: ReactNode;
}) {
  const { data, act, busy } = useWorkspace();
  return (
    <div className="px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="mono truncate text-[13px]">{account.email}</p>
          <div className="mt-1">
            <Status account={account} />
          </div>
        </div>
        {account.connected ? (
          <FilteringControls account={account} />
        ) : atAccountLimit(data) ? (
          <PlanLimitNote limit={data.accountLimit!} />
        ) : (
          <ConnectButton outline />
        )}
      </div>
      {account.connected && !account.writesEnabled && !data.demo ? (
        <p className="mt-3 text-[13px] text-warning">
          Moving emails is disabled for this account.
        </p>
      ) : null}
      {account.lastError ? (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-destructive"
        >
          <p>{account.lastError}</p>
          {account.connected && account.mode !== "paused" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                act({ action: "sync", accountId: account.id }, "Checking…")
              }
            >
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      {account.connected && account.mode !== "paused" ? (
        <SyncProgress account={account} />
      ) : null}
      {children}
    </div>
  );
}

export function AccountsPage() {
  const { data, act, busy } = useWorkspace();
  const [confirm, setConfirm] = useState<{
    account: Account;
    action: "disconnect" | "deleteGmailData";
  } | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const confirmEmailId = useId();
  if (!data.accounts.length) return <Onboarding />;
  return (
    <>
      <PageTitle title="Accounts" />
      <List label="Gmail accounts">
        {data.accounts.map((account) => (
          <AccountRow key={account.id} account={account}>
            <details className="mt-3 text-[13px] text-muted-foreground">
              <summary className="flex h-9 w-fit list-none items-center rounded-sm hover:text-foreground [&::-webkit-details-marker]:hidden">
                Options
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {account.connected ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || account.mode === "paused"}
                      onClick={() =>
                        act(
                          { action: "sync", accountId: account.id },
                          "Checking…",
                        )
                      }
                    >
                      Check now
                    </Button>
                    {account.mode === "automatic" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          act(
                            {
                              action: "mode",
                              accountId: account.id,
                              mode: "review",
                            },
                            "Only suggesting",
                          )
                        }
                      >
                        Only suggest
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({ account, action: "disconnect" })
                      }
                    >
                      Disconnect
                    </Button>
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setConfirmEmail("");
                    setConfirm({ account, action: "deleteGmailData" });
                  }}
                >
                  Delete Gmail data
                </Button>
              </div>
              <p className="mono mt-2 text-xs">
                {account.lastSync
                  ? `Last checked ${time(account.lastSync)}`
                  : "Not checked yet"}
              </p>
            </details>
          </AccountRow>
        ))}
      </List>
      <div className="mt-10">
        {atAccountLimit(data) ? (
          <PlanLimitNote limit={data.accountLimit!} />
        ) : (
          <>
            <SectionLabel>Add account</SectionLabel>
            <ConnectButton outline />
          </>
        )}
      </div>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setConfirm(null);
            setConfirmEmail("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "deleteGmailData"
                ? "Delete Gmail data"
                : "Disconnect this account"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "deleteGmailData"
                ? `Sotto will delete its connection, credentials, preferences and processing history for ${confirm.account.email}. Emails and labels stay in Gmail, but these moves can no longer be undone from Sotto. This deletion cannot be undone.`
                : `Sotto will stop processing ${confirm?.account.email} and remove its saved credential. Emails and labels stay in Gmail; decision history stays in Sotto.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm?.action === "deleteGmailData" ? (
            <div className="space-y-2">
              <Label htmlFor={confirmEmailId}>
                Type {confirm.account.email} to confirm
              </Label>
              <Input
                id={confirmEmailId}
                type="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your sign-in, plan and other accounts are kept.
              </p>
            </div>
          ) : null}
          <InlineError />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-filled="true"
              disabled={
                busy ||
                (confirm?.action === "deleteGmailData" &&
                  confirmEmail.trim().toLowerCase() !==
                    confirm.account.email.toLowerCase())
              }
              onClick={async (event) => {
                event.preventDefault();
                if (!confirm) return;
                if (
                  await act(
                    {
                      action: confirm.action,
                      accountId: confirm.account.id,
                      ...(confirm.action === "deleteGmailData"
                        ? { confirmEmail: confirmEmail.trim() }
                        : {}),
                    },
                    confirm.action === "deleteGmailData"
                      ? "Gmail data deleted"
                      : "Account disconnected",
                  )
                )
                  setConfirm(null);
              }}
            >
              {confirm?.action === "deleteGmailData"
                ? "Delete Gmail data"
                : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function RulesPage() {
  const { data, act, busy } = useWorkspace();
  const [open, setOpen] = useState(false),
    [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const [removeId, setRemoveId] = useState<string | null>(null);
  if (!data.accounts.length) return <Onboarding />;
  return (
    <>
      <PageTitle
        title="Allowlist"
        action={
          <Button
            variant="outline"
            disabled={!data.accounts.length}
            onClick={() => setOpen(true)}
          >
            <Plus />
            Allow sender
          </Button>
        }
      />
      <List label="Allowed senders">
        {data.rules.length ? (
          <ul className="hairline">
            {data.rules.map((rule) => (
              <li key={rule.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="mono truncate text-[13px]">{rule.sender}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.accounts.find((a) => a.id === rule.accountId)?.name}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${rule.sender}`}
                  onClick={() => setRemoveId(rule.id)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title="No allowed senders"
            detail="Allowed senders always stay in your inbox, even when their email looks commercial."
          />
        )}
      </List>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Allow a sender</SheetTitle>
            <SheetDescription>
              Their emails always stay in your inbox.
            </SheetDescription>
          </SheetHeader>
          <form
            className="space-y-5 px-6"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  {
                    action: "allow",
                    accountId,
                    sender: email.trim().toLowerCase(),
                  },
                  "Sender allowed",
                )
              ) {
                setOpen(false);
                setEmail("");
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="sender">Email address</Label>
              <Input
                id="sender"
                type="email"
                placeholder="name@company.com…"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Account</Label>
              <AccountPicker value={accountId} onChange={setAccountId} />
            </div>
            <InlineError />
            <Button
              type="submit"
              disabled={busy || !accountId}
              aria-busy={busy}
              className="w-full"
            >
              Allow sender
            </Button>
          </form>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!removeId}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this sender</AlertDialogTitle>
            <AlertDialogDescription>
              Future emails from this sender are evaluated again. Existing
              messages stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <InlineError />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-filled="true"
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (
                  await act(
                    { action: "removeRule", ruleId: removeId },
                    "Sender removed",
                  )
                )
                  setRemoveId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SettingsPage({ subscription }: { subscription?: ReactNode }) {
  const { data, act, busy } = useWorkspace();
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const account = data.accounts.find((a) => a.id === accountId);
  return (
    <>
      <PageTitle
        title="Settings"
        action={
          account ? (
            <AccountPicker value={accountId} onChange={setAccountId} />
          ) : undefined
        }
      />
      {subscription}
      <SectionLabel>Move out of the inbox</SectionLabel>
      <List label="Categories">
        <SettingRow
          title="Cold outreach"
          description="Sotto/Cold"
          checked
          disabled
        />
        <SettingRow
          title="Marketing"
          description="Sotto/Reading"
          checked={account?.policy.marketing ?? false}
          disabled={!account || busy}
          onChange={(value) =>
            account &&
            act(
              {
                action: "policy",
                accountId,
                marketing: value,
                newsletters: account.policy.newsletters,
              },
              "",
            )
          }
        />
        <SettingRow
          title="Newsletters"
          description="Sotto/Reading"
          checked={account?.policy.newsletters ?? false}
          disabled={!account || busy}
          onChange={(value) =>
            account &&
            act(
              {
                action: "policy",
                accountId,
                marketing: account.policy.marketing,
                newsletters: value,
              },
              "",
            )
          }
        />
      </List>
      {account && <PreferencesEditor key={account.id} account={account} />}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-[13px] text-muted-foreground">
        <Link
          href="/privacy"
          className="transition-colors duration-[120ms] hover:text-foreground"
        >
          Privacy
        </Link>
        <a
          href="https://github.com/josebenitezg/sotto"
          target="_blank"
          rel="noreferrer"
          className="transition-colors duration-[120ms] hover:text-foreground"
        >
          GitHub
        </a>
      </div>
    </>
  );
}
function PreferencesEditor({ account }: { account: Account }) {
  const { act, busy } = useWorkspace();
  const [instructions, setInstructions] = useState(
    account.policy.instructions || "",
  );
  const dirty = instructions !== (account.policy.instructions || "");
  return (
    <form
      className="mt-10 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await act(
          {
            action: "policy",
            accountId: account.id,
            marketing: account.policy.marketing,
            newsletters: account.policy.newsletters,
            instructions,
          },
          "Preferences saved",
        );
      }}
    >
      <div>
        <Label htmlFor="ai-preferences">Preferences</Label>
        <p
          id="ai-preferences-help"
          className="mt-1 text-[13px] leading-[18px] text-muted-foreground"
        >
          What you do and which emails matter. The AI reads this before
          deciding.
        </p>
      </div>
      <Textarea
        id="ai-preferences"
        aria-describedby="ai-preferences-help"
        maxLength={1500}
        rows={4}
        placeholder="Keep inquiries from customers and investors. Move pitches from agencies…"
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
      <InlineError />
      <Button
        type="submit"
        variant={dirty ? "default" : "outline"}
        disabled={busy || !dirty}
        aria-busy={busy}
      >
        Save
      </Button>
    </form>
  );
}
function SettingRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => Promise<boolean> | void;
}) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [saved]);
  const id = title.toLowerCase().replaceAll(" ", "-");
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-4">
      <div>
        <Label htmlFor={id} className="text-sm leading-5">
          {title}
        </Label>
        <p
          id={`${id}-help`}
          className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground"
        >
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span role="status" className="text-xs text-muted-foreground">
          {saved ? "Saved" : ""}
        </span>
        <Switch
          id={id}
          aria-describedby={`${id}-help`}
          checked={checked}
          disabled={disabled}
          onCheckedChange={async (value) => {
            const ok = await onChange?.(value);
            if (ok) setSaved(true);
          }}
        />
      </div>
    </div>
  );
}
