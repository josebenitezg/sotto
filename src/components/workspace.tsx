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
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  ExternalLink,
  Github,
  Inbox,
  ListFilter,
  Mail,
  Pause,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Undo2,
  UsersRound,
  X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { GoogleMark, SottoMark } from "./brand";
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
  { href: "/review", label: "Review", icon: Inbox },
  { href: "/accounts", label: "Accounts", icon: Mail },
  { href: "/allowlist", label: "Allowlist", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings2 },
  { href: "/pricing", label: "Plan", icon: CreditCard },
];
const modeLabels = {
  review: "Review mode",
  automatic: "Active",
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

function applyDemo(data: Dashboard, action: Action): Dashboard {
  const next = structuredClone(data);
  const account = next.accounts.find((a) => a.id === action.accountId);
  const decision = next.decisions.find((d) => d.id === action.decisionId);
  if (action.action === "mode" && account) account.mode = action.mode as Mode;
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
  const pathname = usePathname();
  useEffect(() => {
    if (initial.demo) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      if (document.hidden || inFlight.current) return;
      try {
        const response = await fetch("/api/dashboard", {
          signal: controller.signal,
        });
        if (response.ok && !inFlight.current) setData(await response.json());
      } catch {
        /* Keep last known state; explicit actions surface errors inline. */
      }
    }, 15000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [initial.demo]);
  async function act(action: Action, success: string) {
    if (inFlight.current) return false;
    inFlight.current = true;
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
      toast.success(success);
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
  const suggested = data.decisions.filter(
    (d) => d.state === "suggested",
  ).length;
  return (
    <WorkspaceContext.Provider
      value={{ data, act, busy, error, clearError: () => setError(null) }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card px-4 py-7 md:flex">
        <Link
          href="/"
          className="mb-12 flex items-center gap-2.5 px-3 text-primary"
          aria-label="Sotto, home"
        >
          <SottoMark />
          <span className="text-[25px] leading-8 font-semibold tracking-[-0.06em] text-foreground">
            sotto
          </span>
        </Link>
        <nav aria-label="Main navigation" className="space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-md px-3 font-medium",
                pathname === item.href
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              <item.icon size={18} strokeWidth={1.75} />
              {item.label}
              {item.href === "/" && suggested > 0 ? (
                <span className="ml-auto rounded-md bg-card px-1.5 text-xs tabular-nums">
                  {suggested}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-6 px-3">
          <div className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <p>
              Your email stays in Gmail.
              <br />
              You have the final say.
            </p>
          </div>
          <a
            href="https://github.com/josebenitezg/sotto"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Github size={15} />
            Open source<span className="ml-auto">v0.1</span>
          </a>
        </div>
      </aside>
      <div className="md:ml-60">
        <header className="flex h-16 items-center justify-between border-b bg-background px-5 md:px-8">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="hidden md:inline">Your email</span>
            <ChevronRight size={14} className="hidden md:inline" />
            <span className="font-medium text-foreground md:font-normal">
              {nav.find((n) => n.href === pathname)?.label ?? "Sotto"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {data.demo ? (
              <Badge
                variant="outline"
                className="border-border bg-card text-muted-foreground"
              >
                Sample view
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                Your private workspace
              </span>
            )}
            <SottoMark className="size-6 text-primary md:hidden" />
          </div>
        </header>
        <main
          id="main"
          className="mx-auto max-w-[944px] px-5 pt-8 pb-28 md:px-8 md:pt-10 md:pb-12"
        >
          {data.demo ? (
            <div className="mb-8 flex items-start gap-2.5 text-[13px] text-muted-foreground">
              <CircleHelp size={16} className="mt-0.5 shrink-0" />
              <p>
                These are sample emails. Try the controls; your Gmail stays
                unchanged.
              </p>
            </div>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-destructive/30 bg-card p-4 text-destructive"
            >
              {error}
            </div>
          ) : null}
          {children}
        </main>
      </div>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-card pt-2 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden"
      >
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 px-3 text-xs",
              pathname === item.href
                ? "font-medium text-primary"
                : "text-muted-foreground",
            )}
          >
            <item.icon size={18} />
            {item.label}
          </Link>
        ))}
      </nav>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--card)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            fontFamily: "inherit",
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
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-8 font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-2 max-w-[65ch] text-sm leading-[22px] text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
function ConnectButton({ outline = false }: { outline?: boolean }) {
  const { data } = useWorkspace();
  const noticeId = useId();
  return (
    <form
      action="/api/google/connect"
      method="post"
      className="w-full max-w-md space-y-3"
    >
      <GoogleDataNotice id={noticeId} />
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
    </form>
  );
}
function Status({ account }: { account: Account }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs",
        !account.connected || account.mode !== "automatic"
          ? "text-warning"
          : "text-primary",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {account.connected ? modeLabels[account.mode] : "Disconnected"}
    </span>
  );
}
function Empty({
  title,
  detail,
  icon: Icon = Inbox,
}: {
  title: string;
  detail: string;
  icon?: typeof Inbox;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border bg-background text-muted-foreground">
        <Icon size={20} strokeWidth={1.5} />
      </div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{detail}</p>
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
      <SelectTrigger
        aria-label="Select account"
        className="h-9 min-w-44 bg-card"
      >
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
        title="A little less noise."
        description="Sotto sets unsolicited sales emails aside, leaving room for what matters."
      />
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="p-6 md:p-8">
          <div className="mb-6 flex size-12 items-center justify-center rounded-xl border bg-background text-muted-foreground">
            <Inbox size={24} strokeWidth={1.5} />
          </div>
          <h2 className="text-base font-semibold">
            Start with your work email
          </h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Connect your account and review what Sotto suggests moving. You can
            add your personal email later.
          </p>
          <div className="mt-6">
            <ConnectButton />
          </div>
          {!data.configured ? (
            <p className="mt-3 text-xs text-warning">
              The Google connection is still being configured.
            </p>
          ) : null}
        </div>
        <div className="divide-y border-t">
          {[
            {
              icon: ListFilter,
              title: "Review it first",
              text: "Review suggestions before turning on automatic filtering.",
            },
            {
              icon: ShieldCheck,
              title: "When in doubt, keep it",
              text: "Contacts, customers, and operational emails come first.",
            },
            {
              icon: Undo2,
              title: "You can always undo a move",
              text: "Moving an email does not delete it. It stays in Gmail.",
            },
          ].map((row) => (
            <div
              key={row.title}
              className="flex items-start gap-4 px-6 py-5 md:px-8"
            >
              <row.icon
                size={18}
                strokeWidth={1.75}
                className="mt-0.5 text-muted-foreground"
              />
              <div>
                <p className="font-medium">{row.title}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {row.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <p className="mt-6 max-w-[68ch] text-xs leading-5 text-muted-foreground">
        Connecting lets Sotto read emails and change their labels. Messages that
        need classification are processed by the AI provider configured for your
        installation.{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          See how we handle your data
        </Link>
        .
      </p>
    </>
  );
}

export function ReviewPage() {
  const { data, act, busy } = useWorkspace();
  const [accountId, setAccountId] = useState("all");
  const [filter, setFilter] = useState<"suggested" | "kept" | "moved">(
    "suggested",
  );
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
  const selected = data.decisions.find((d) => d.id === selectedId);
  const selectedAccount = data.accounts.find(
    (a) => a.id === selected?.accountId,
  );
  const selectedWritesEnabled =
    data.demo || selectedAccount?.writesEnabled === true;
  const anyReview = data.accounts.some(
    (a) => a.connected && a.mode === "review",
  );
  const syncing = data.accounts.filter(
    (a) =>
      (accountId === "all" || a.id === accountId) &&
      a.connected &&
      a.mode !== "paused" &&
      a.sync &&
      (a.sync.pending > 0 || a.sync.failed > 0),
  );
  return (
    <>
      <PageTitle
        title="What matters, in view."
        description="Review which emails need your attention and which can move aside."
        action={<AccountPicker value={accountId} onChange={setAccountId} all />}
      />
      {anyReview ? (
        <div className="mb-8 flex flex-col justify-between gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center">
          <div className="flex gap-3">
            <div className="mt-0.5 text-warning">
              <ListFilter size={19} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-medium">Get to know Sotto's judgment</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                In review mode, Sotto suggests and you decide what to move.
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/accounts">
              View my accounts
              <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Your review</h2>
        <span className="text-xs text-muted-foreground">
          {scoped.length} emails in this view
        </span>
      </div>
      {syncing.length > 0 ? (
        <div
          className="mb-5 space-y-3 rounded-xl border bg-card p-4"
          role="status"
        >
          <p className="text-sm font-medium">Reviewing your inbox</p>
          {syncing.map((account) => (
            <SyncProgress key={account.id} account={account} />
          ))}
          <p className="text-xs text-muted-foreground">
            You can close this page. Review continues in the background, and
            results appear here.
          </p>
        </div>
      ) : null}
      <div
        className="mb-4 flex flex-wrap gap-1"
        role="group"
        aria-label="Filter decisions"
      >
        {(
          [
            { key: "suggested", label: "Suggested" },
            { key: "kept", label: "Kept" },
            { key: "moved", label: "Moved" },
          ] as const
        ).map((tab) => (
          <Button
            key={tab.key}
            variant="ghost"
            aria-pressed={filter === tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "gap-2",
              filter === tab.key
                ? "bg-secondary text-foreground"
                : "text-muted-foreground",
            )}
          >
            {tab.label}
            <span className="text-xs tabular-nums text-muted-foreground">
              {counts[tab.key]}
            </span>
          </Button>
        ))}
      </div>
      <section
        aria-label="Email decisions"
        className="overflow-hidden rounded-xl border bg-card"
      >
        {visible.length ? (
          <ul className="divide-y">
            {visible.map((d) => (
              <li key={d.id}>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedId(d.id)}
                  className="h-auto w-full justify-start gap-4 rounded-none px-4 py-5 text-left whitespace-normal sm:px-5"
                >
                  <div className="hidden size-10 shrink-0 items-center justify-center rounded-xl border bg-background font-medium text-muted-foreground sm:flex">
                    {d.sender.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-muted-foreground">
                      <span className="max-w-[220px] truncate">{d.sender}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {data.accounts.find((a) => a.id === d.accountId)?.name}
                      </span>
                    </div>
                    <p className="truncate text-sm leading-5 font-medium">
                      {d.subject}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[13px] leading-[18px] font-normal text-muted-foreground">
                      {d.reason}
                    </p>
                  </div>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title={
              filter === "suggested"
                ? syncing.length > 0
                  ? "Review is still running"
                  : "Nothing to review right now"
                : filter === "moved"
                  ? "No emails moved yet"
                  : "Emails you keep will appear here"
            }
            detail={
              filter === "suggested"
                ? "New suggestions will appear here with an explanation."
                : "Every decision is recorded so you can review it."
            }
          />
        )}
      </section>
      <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        <p>
          A new sender can be a good opportunity. When in doubt, the email
          stays.
        </p>
      </div>
      {anyReview && scoped.length > 0 ? (
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <div>
            <p className="font-medium">Happy with the suggestions?</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Turn on automatic filtering when you finish reviewing.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/accounts">
              Set up filtering
              <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-[480px]">
          {selected ? (
            <>
              <SheetHeader className="border-b p-6 pt-10">
                <SheetTitle className="pr-5 text-base leading-6">
                  {selected.subject}
                </SheetTitle>
                <SheetDescription className="break-all">
                  {selected.sender}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 px-6 py-2">
                <Badge variant="outline" className="font-normal">
                  {categoryLabels[selected.category]}
                </Badge>
                <div>
                  <p className="mb-2 font-medium">
                    Why Sotto made this decision
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selected.reason}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Mail size={16} />
                  {
                    data.accounts.find((a) => a.id === selected.accountId)
                      ?.email
                  }
                </div>
                <div className="space-y-3 border-t pt-6">
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
                        <ArrowDownToLine />
                        Move this email
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await act(
                              { action: "keep", decisionId: selected.id },
                              "Kept in your inbox",
                            )
                          )
                            setSelectedId(null);
                        }}
                      >
                        <Check />
                        Keep in my inbox
                      </Button>
                      {!selectedWritesEnabled ? (
                        <p className="text-xs text-warning">
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
                            "Email restored",
                          )
                        )
                          setSelectedId(null);
                      }}
                    >
                      <Undo2 />
                      Return to my inbox
                    </Button>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      {["moving", "restoring"].includes(selected.state)
                        ? "The change is being processed."
                        : "This email stays in Gmail."}
                    </p>
                  )}
                  <Button
                    variant="ghost"
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
                    <ShieldCheck />
                    Always allow this sender
                  </Button>
                  {selected.gmailUrl ? (
                    <Button variant="outline" className="w-full" asChild>
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
  const { total, done, pending, failed, retrying, since } = account.sync;
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">{account.name}</span> ·{" "}
        {done} of {total} emails processed
        {pending > 0 ? ` · ${pending} pending` : ""}
      </p>
      {total > 0 ? (
        <progress
          className="h-1.5 w-full accent-primary"
          value={done}
          max={total}
          aria-label={`Progress for ${account.name}`}
        />
      ) : null}
      {retrying > 0 || failed > 0 ? (
        <p className="text-warning">
          {retrying > 0 ? `${retrying} emails waiting for a retry. ` : ""}
          {failed > 0 ? `${failed} need another Sync attempt.` : ""}
        </p>
      ) : null}
      <p>
        Inbox emails since{" "}
        {new Date(since).toLocaleDateString("en-US", {
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        })}
        .
      </p>
    </div>
  );
}
function InlineError() {
  const { error } = useWorkspace();
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

export function AccountsPage() {
  const { data, act, busy } = useWorkspace();
  const [confirm, setConfirm] = useState<{
    account: Account;
    action: "automatic" | "disconnect" | "deleteGmailData";
  } | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const confirmEmailId = useId();
  if (!data.accounts.length) return <Onboarding />;
  return (
    <>
      <PageTitle
        title="Each account, at your pace."
        description="Connect your accounts and choose when filtering starts."
        action={<ConnectButton outline />}
      />
      <section className="overflow-hidden rounded-xl border bg-card">
        <ul className="divide-y">
          {data.accounts.map((account) => (
            <li key={account.id} className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background">
                  <Mail
                    size={20}
                    strokeWidth={1.5}
                    className="text-muted-foreground"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{account.name}</p>
                    <Status account={account} />
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {account.email}
                  </p>
                </div>
              </div>
              <div className="mt-5 sm:pl-14">
                <p className="text-[13px] text-muted-foreground">
                  {!account.connected
                    ? "Reconnect this account to continue."
                    : account.mode === "review"
                      ? "Sotto suggests what to move. Emails stay in your inbox."
                      : account.mode === "paused"
                        ? "Filtering is paused. New emails are not processed."
                        : "Cold outreach goes to Sotto/Cold. Uncertain messages stay."}
                </p>
                {account.lastError ? (
                  <p className="mt-3 text-[13px] text-destructive">
                    {account.lastError}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {account.connected ? (
                    <>
                      {account.mode !== "paused" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            act(
                              {
                                action: "mode",
                                accountId: account.id,
                                mode: "paused",
                              },
                              "Filtering paused",
                            )
                          }
                        >
                          <Pause />
                          Pause
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            act(
                              {
                                action: "mode",
                                accountId: account.id,
                                mode: "review",
                              },
                              "Review mode enabled",
                            )
                          }
                        >
                          Resume in review mode
                        </Button>
                      )}
                      {account.mode === "review" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            busy ||
                            !data.decisions.some(
                              (d) => d.accountId === account.id,
                            ) ||
                            (!data.demo && !account.writesEnabled)
                          }
                          onClick={() =>
                            setConfirm({ account, action: "automatic" })
                          }
                        >
                          Enable filtering
                          <ArrowRight />
                        </Button>
                      ) : account.mode === "automatic" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            act(
                              {
                                action: "mode",
                                accountId: account.id,
                                mode: "review",
                              },
                              "Review mode enabled",
                            )
                          }
                        >
                          Switch to review mode
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || account.mode === "paused"}
                        onClick={() =>
                          act(
                            { action: "sync", accountId: account.id },
                            "Sync requested",
                          )
                        }
                      >
                        <RefreshCw />
                        Sync
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() =>
                          setConfirm({ account, action: "disconnect" })
                        }
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <ConnectButton outline />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => {
                      setConfirmEmail("");
                      setConfirm({ account, action: "deleteGmailData" });
                    }}
                  >
                    Delete Gmail data
                  </Button>
                </div>
                {!data.demo &&
                !account.writesEnabled &&
                account.mode === "review" ? (
                  <p className="mt-3 text-xs text-warning">
                    Moving emails is disabled for this account.
                  </p>
                ) : null}
                <p className="mt-4 text-xs text-muted-foreground">
                  {account.lastSync
                    ? `Last synced: ${new Date(account.lastSync).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" })} UTC`
                    : "Waiting for the first sync"}
                </p>
                <div className="mt-3">
                  <SyncProgress account={account} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-8 flex gap-3 text-sm text-muted-foreground">
        <UsersRound size={18} className="mt-0.5 shrink-0" />
        <p className="max-w-[65ch]">
          Your accounts share this workspace, with separate rules and decisions.
          Start with work and add your personal account later.
        </p>
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
              {confirm?.action === "automatic"
                ? "Enable filtering"
                : confirm?.action === "deleteGmailData"
                  ? "Delete Gmail data"
                  : "Disconnect this account"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "automatic"
                ? `You confirm that you have reviewed the suggestions for ${confirm.account.email}. Sotto can now move new emails in your selected categories. You can pause filtering and undo each move.`
                : confirm?.action === "deleteGmailData"
                  ? `Sotto will remove the connection, credential, preferences, allowed senders, and processing records for ${confirm.account.email} from its active database. Filtering stops for this account. Emails and labels stay as they are in Gmail; moves can no longer be undone from Sotto's history. This deletion cannot be undone.`
                  : `Sotto will stop processing ${confirm?.account.email} and delete its local credential. Emails and labels stay in Gmail; decision history stays in Sotto. If Google does not respond, you can revoke access from your Google Account.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm?.action === "deleteGmailData" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your sign-in, plan data, and other accounts are kept.
                Reconnecting Google authorizes a new review. If Google does not
                respond to the revocation request, you can revoke access in your
                Google Account; local deletion still completes.
              </p>
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
              </div>
            </div>
          ) : null}
          <InlineError />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm?.action === "deleteGmailData"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
              disabled={
                busy ||
                (confirm?.action === "deleteGmailData" &&
                  confirmEmail.trim().toLowerCase() !==
                    confirm.account.email.toLowerCase())
              }
              onClick={async (event) => {
                event.preventDefault();
                if (!confirm) return;
                if (confirm.action === "automatic") {
                  if (
                    !(await act(
                      { action: "reviewed", accountId: confirm.account.id },
                      "Review confirmed",
                    ))
                  )
                    return;
                  if (
                    await act(
                      {
                        action: "mode",
                        accountId: confirm.account.id,
                        mode: "automatic",
                      },
                      "Filtering enabled",
                    )
                  )
                    setConfirm(null);
                } else if (confirm.action === "deleteGmailData") {
                  if (
                    await act(
                      {
                        action: "deleteGmailData",
                        accountId: confirm.account.id,
                        confirmEmail: confirmEmail.trim(),
                      },
                      "Gmail data deleted from Sotto",
                    )
                  ) {
                    setConfirm(null);
                    setConfirmEmail("");
                  }
                } else if (
                  await act(
                    { action: "disconnect", accountId: confirm.account.id },
                    "Account disconnected from Sotto",
                  )
                )
                  setConfirm(null);
              }}
            >
              {busy
                ? "Saving…"
                : confirm?.action === "automatic"
                  ? "Enable filtering"
                  : confirm?.action === "deleteGmailData"
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
  return (
    <>
      <PageTitle
        title="These emails stay."
        description="Keep the people you want to hear from close."
        action={
          <Button
            size="lg"
            disabled={!data.accounts.length}
            onClick={() => setOpen(true)}
          >
            <Plus />
            Allow sender
          </Button>
        }
      />
      <section className="overflow-hidden rounded-xl border bg-card">
        {data.rules.length ? (
          <ul className="divide-y">
            {data.rules.map((rule) => (
              <li key={rule.id} className="flex items-center gap-4 p-5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
                  <ShieldCheck size={17} className="text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{rule.sender}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.accounts.find((a) => a.id === rule.accountId)?.name}·
                    Always in my inbox
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove allowance for ${rule.sender}`}
                  onClick={() => setRemoveId(rule.id)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title="A place for trusted contacts"
            detail="Add a sender to keep their emails in your inbox, even when they look commercial."
            icon={ShieldCheck}
          />
        )}
      </section>
      <p className="mt-5 max-w-[65ch] text-xs leading-5 text-muted-foreground">
        Sotto also keeps conversations you have participated in, emails from
        your organization, and messages you have starred.
      </p>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-[440px]">
          <SheetHeader className="p-6 pt-10">
            <SheetTitle>Allow a sender</SheetTitle>
            <SheetDescription>
              Their future emails stay in your inbox.
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
              <Label htmlFor="sender">Sender email</Label>
              <Input
                id="sender"
                type="email"
                placeholder="nombre@empresa.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>For this account</Label>
              <AccountPicker value={accountId} onChange={setAccountId} />
            </div>
            <InlineError />
            <Button
              type="submit"
              disabled={busy || !accountId}
              className="w-full"
            >
              {busy ? "Saving…" : "Allow sender"}
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
            <AlertDialogTitle>Remove this exception</AlertDialogTitle>
            <AlertDialogDescription>
              Sotto will evaluate future emails from this sender again. Existing
              messages stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <InlineError />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (
                  await act(
                    { action: "removeRule", ruleId: removeId },
                    "Exception removed",
                  )
                )
                  setRemoveId(null);
              }}
            >
              Remove exception
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SettingsPage() {
  const { data, act, busy } = useWorkspace();
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const account = data.accounts.find((a) => a.id === accountId);
  return (
    <>
      <PageTitle
        title="Make it yours."
        description="Choose what to move out of each inbox."
        action={
          account ? (
            <AccountPicker value={accountId} onChange={setAccountId} />
          ) : undefined
        }
      />
      <h2 className="mb-4 text-base font-semibold">What Sotto can move</h2>
      <section className="divide-y overflow-hidden rounded-xl border bg-card">
        <SettingRow
          title="Cold outreach"
          description="Individual sales pitches from people you have not spoken with."
          checked
          disabled
        />
        <SettingRow
          title="Marketing"
          description="Brand campaigns, promotions, and product offers."
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
              "Saved",
            )
          }
        />
        <SettingRow
          title="Newsletters"
          description="Editorial newsletters and recurring digests you prefer to read later."
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
              "Saved",
            )
          }
        />
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Cold outreach goes to Sotto/Cold. Other enabled categories go to
        Sotto/Reading.
      </p>
      {account && <PreferencesEditor key={account.id} account={account} />}
      <h2 className="mt-10 mb-4 text-base font-semibold">
        Always under your control
      </h2>
      <section className="divide-y overflow-hidden rounded-xl border bg-card">
        {[
          {
            icon: ShieldCheck,
            title: "When in doubt, keep it",
            description:
              "Potential customers, investors, paperwork, and useful notices stay.",
          },
          {
            icon: Undo2,
            title: "Moved, still yours",
            description: "Every move has an explanation and can be undone.",
          },
          {
            icon: RefreshCw,
            title: "A backup check",
            description:
              "If a Gmail notification is missed, Sotto catches up on pending changes.",
          },
        ].map((row) => (
          <div key={row.title} className="flex items-start gap-4 p-5">
            <row.icon
              size={18}
              className="mt-0.5 shrink-0 text-muted-foreground"
            />
            <div>
              <p className="font-medium">{row.title}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {row.description}
              </p>
            </div>
          </div>
        ))}
      </section>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy and data access
        </Link>
        {data.authenticated ? (
          <form action="/api/logout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        ) : (
          <a
            href="https://github.com/josebenitezg/sotto"
            target="_blank"
            rel="noreferrer"
          >
            Sotto is open source ↗
          </a>
        )}
      </div>
    </>
  );
}
function PreferencesEditor({ account }: { account: Account }) {
  const { act, busy } = useWorkspace();
  const [instructions, setInstructions] = useState(
    account.policy.instructions || "",
  );
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
      <Label htmlFor="ai-preferences" className="text-base font-semibold">
        What matters to you
      </Label>
      <p id="ai-preferences-help" className="text-[13px] text-muted-foreground">
        Tell the AI what you do and which opportunities interest you. It will
        consider this when reading future emails.
      </p>
      <Textarea
        id="ai-preferences"
        aria-describedby="ai-preferences-help"
        maxLength={1500}
        rows={4}
        placeholder="For example: keep inquiries from potential customers and investors. Move pitches from agencies and lead generation services."
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
      <InlineError />
      <Button
        type="submit"
        disabled={busy || instructions === (account.policy.instructions || "")}
      >
        Save preferences
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
    <div className="flex items-center justify-between gap-6 p-5">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {title}
        </Label>
        <p id={`${id}-help`} className="mt-1 text-[13px] text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
