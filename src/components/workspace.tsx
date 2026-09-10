"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
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
  { href: "/", label: "Revisión", icon: Inbox },
  { href: "/cuentas", label: "Cuentas", icon: Mail },
  { href: "/permitidos", label: "Permitidos", icon: ShieldCheck },
  { href: "/ajustes", label: "Ajustes", icon: Settings2 },
];
const modeLabels = {
  review: "En prueba",
  automatic: "Activo",
  paused: "Pausado",
};
const categoryLabels = {
  cold: "Venta no solicitada",
  marketing: "Seguimiento comercial",
  newsletter: "Newsletter",
  transactional: "Operativo",
  personal: "Relevante",
  uncertain: "Para revisar",
};

function applyDemo(data: Dashboard, action: Action): Dashboard {
  const next = structuredClone(data);
  const account = next.accounts.find((a) => a.id === action.accountId);
  const decision = next.decisions.find((d) => d.id === action.decisionId);
  if (action.action === "mode" && account) account.mode = action.mode as Mode;
  if (action.action === "policy" && account) {
    account.policy.marketing = !!action.marketing;
    account.policy.newsletters = !!action.newsletters;
  }
  if (action.action === "reviewed" && account)
    account.reviewedAt = new Date().toISOString();
  if (action.action === "sync" && account)
    account.lastSync = new Date().toISOString();
  if (action.action === "disconnect" && account) {
    account.connected = false;
    account.mode = "paused";
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
        if (!response.ok)
          throw new Error(result.error || "No pudimos completar el cambio.");
        const fresh = await fetch("/api/dashboard");
        if (!fresh.ok)
          throw new Error(
            "El cambio se envió. Actualizá la página para comprobar el resultado.",
          );
        setData(await fresh.json());
      }
      toast.success(success);
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No pudimos completar el cambio.",
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
        Ir al contenido
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card px-4 py-7 md:flex">
        <Link
          href="/"
          className="mb-12 flex items-center gap-2.5 px-3 text-primary"
          aria-label="Sotto, inicio"
        >
          <SottoMark />
          <span className="text-[25px] leading-8 font-semibold tracking-[-0.06em] text-foreground">
            sotto
          </span>
        </Link>
        <nav aria-label="Navegación principal" className="space-y-1">
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
              Tu correo sigue en Gmail.
              <br />
              Vos tenés la última palabra.
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
            <span className="hidden md:inline">Tu correo</span>
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
                Vista de ejemplo
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                Tu espacio privado
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
                Estos correos son ficticios. Podés probar los controles; tu
                Gmail no cambia.
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
        aria-label="Navegación móvil"
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
  return (
    <form action="/api/google/connect" method="post">
      <Button
        type="submit"
        size="lg"
        variant={outline ? "outline" : "default"}
        disabled={!data.configured || data.demo}
      >
        <GoogleMark />
        Conectar con Google
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
      {account.connected ? modeLabels[account.mode] : "Desconectada"}
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
        aria-label="Seleccionar cuenta"
        className="h-9 min-w-44 bg-card"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {all ? <SelectItem value="all">Todas las cuentas</SelectItem> : null}
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
        title="Un poco menos de ruido."
        description="Sotto separa las ventas no solicitadas para que tu bandeja tenga espacio para lo que importa."
      />
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="p-6 md:p-8">
          <div className="mb-6 flex size-12 items-center justify-center rounded-xl border bg-background text-muted-foreground">
            <Inbox size={24} strokeWidth={1.5} />
          </div>
          <h2 className="text-base font-semibold">
            Empezá por tu correo de trabajo
          </h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Conectá tu cuenta y revisá lo que Sotto propone apartar. Después
            podés sumar tu correo personal.
          </p>
          <div className="mt-6">
            <ConnectButton />
          </div>
          {!data.configured ? (
            <p className="mt-3 text-xs text-warning">
              La conexión con Google todavía está pendiente de configuración.
            </p>
          ) : null}
        </div>
        <div className="divide-y border-t">
          {[
            {
              icon: ListFilter,
              title: "Primero, una prueba",
              text: "Revisás las propuestas antes de activar el filtro.",
            },
            {
              icon: ShieldCheck,
              title: "Lo dudoso se queda",
              text: "Contactos, clientes y correos operativos tienen prioridad.",
            },
            {
              icon: Undo2,
              title: "Siempre podés volver atrás",
              text: "Apartar un correo no lo elimina. Sigue en tu Gmail.",
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
        Al conectarte, Sotto podrá leer correos y cambiar sus etiquetas. Los
        mensajes que necesiten clasificación se procesarán con el proveedor de
        IA configurado en tu instalación.{" "}
        <Link href="/privacidad" className="underline underline-offset-2">
          Ver cómo cuidamos tus datos
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
  const anyReview = data.accounts.some(
    (a) => a.connected && a.mode === "review",
  );
  return (
    <>
      <PageTitle
        title="Lo importante, a la vista."
        description="Revisá qué correos merecen tu atención y cuáles pueden ir aparte."
        action={<AccountPicker value={accountId} onChange={setAccountId} all />}
      />
      {anyReview ? (
        <div className="mb-8 flex flex-col justify-between gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center">
          <div className="flex gap-3">
            <div className="mt-0.5 text-warning">
              <ListFilter size={19} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-medium">Probá el criterio de Sotto</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                En modo de prueba, todos los correos siguen en tu bandeja.
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/cuentas">
              Ver mis cuentas
              <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Tu revisión</h2>
        <span className="text-xs text-muted-foreground">
          {scoped.length} correos en esta vista
        </span>
      </div>
      <div
        className="mb-4 flex flex-wrap gap-1"
        role="group"
        aria-label="Filtrar decisiones"
      >
        {(
          [
            { key: "suggested", label: "Para apartar" },
            { key: "kept", label: "Conservados" },
            { key: "moved", label: "Apartados" },
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
        aria-label="Decisiones de correo"
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
                ? "Nada para revisar por ahora"
                : filter === "moved"
                  ? "Todavía no apartamos correos"
                  : "Acá vas a ver lo que se conserva"
            }
            detail={
              filter === "suggested"
                ? "Las próximas propuestas van a aparecer acá, con una explicación."
                : "Cada decisión queda registrada para que puedas revisarla."
            }
          />
        )}
      </section>
      <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        <p>
          Un remitente nuevo también puede ser una buena oportunidad. Si hay
          dudas, el correo se queda.
        </p>
      </div>
      {anyReview && scoped.length > 0 ? (
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <div>
            <p className="font-medium">¿El criterio tiene sentido?</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Podés activar el filtro cuando termines de revisar.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/cuentas">
              Configurar el filtro
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
                  <p className="mb-2 font-medium">Por qué tomó esta decisión</p>
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
                        disabled={busy || (!data.demo && !data.writesEnabled)}
                        onClick={async () => {
                          if (
                            await act(
                              { action: "move", decisionId: selected.id },
                              "Correo apartado",
                            )
                          )
                            setSelectedId(null);
                        }}
                      >
                        <ArrowDownToLine />
                        Apartar este correo
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await act(
                              { action: "keep", decisionId: selected.id },
                              "Se queda en tu bandeja",
                            )
                          )
                            setSelectedId(null);
                        }}
                      >
                        <Check />
                        Conservar en mi bandeja
                      </Button>
                      {!data.demo && !data.writesEnabled ? (
                        <p className="text-xs text-warning">
                          El movimiento de correos está desactivado en esta
                          instalación.
                        </p>
                      ) : null}
                    </>
                  ) : selected.state === "moved" ? (
                    <Button
                      className="w-full"
                      disabled={busy || (!data.demo && !data.writesEnabled)}
                      onClick={async () => {
                        if (
                          await act(
                            { action: "restore", decisionId: selected.id },
                            "Correo restaurado",
                          )
                        )
                          setSelectedId(null);
                      }}
                    >
                      <Undo2 />
                      Volver a mi bandeja
                    </Button>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      {["moving", "restoring"].includes(selected.state)
                        ? "El cambio se está procesando."
                        : "Este correo se conserva en Gmail."}
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
                          "Remitente permitido",
                        )
                      )
                        setSelectedId(null);
                    }}
                  >
                    <ShieldCheck />
                    Siempre permitir este remitente
                  </Button>
                  {selected.gmailUrl ? (
                    <Button variant="outline" className="w-full" asChild>
                      <a
                        href={selected.gmailUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir en Gmail
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
    action: "automatic" | "disconnect";
  } | null>(null);
  if (!data.accounts.length) return <Onboarding />;
  return (
    <>
      <PageTitle
        title="Cada cuenta, a su ritmo."
        description="Conectá tus correos y elegí cuándo empieza a trabajar el filtro."
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
                    ? "Volvé a conectarla para continuar."
                    : account.mode === "review"
                      ? "Sotto propone qué apartar. Los correos siguen en tu bandeja."
                      : account.mode === "paused"
                        ? "El filtro está en pausa. No se procesan correos nuevos."
                        : "Las ventas no solicitadas van a Sotto/Cold. Lo dudoso se queda."}
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
                              "Filtro pausado",
                            )
                          }
                        >
                          <Pause />
                          Pausar
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
                              "Modo de prueba activado",
                            )
                          }
                        >
                          Reanudar en prueba
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
                            (!data.demo && !data.writesEnabled)
                          }
                          onClick={() =>
                            setConfirm({ account, action: "automatic" })
                          }
                        >
                          Activar filtro
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
                              "Modo de prueba activado",
                            )
                          }
                        >
                          Volver a prueba
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || account.mode === "paused"}
                        onClick={() =>
                          act(
                            { action: "sync", accountId: account.id },
                            "Sincronización solicitada",
                          )
                        }
                      >
                        <RefreshCw />
                        Sincronizar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() =>
                          setConfirm({ account, action: "disconnect" })
                        }
                      >
                        Desconectar
                      </Button>
                    </>
                  ) : (
                    <ConnectButton outline />
                  )}
                </div>
                {!data.demo &&
                !data.writesEnabled &&
                account.mode === "review" ? (
                  <p className="mt-3 text-xs text-warning">
                    Esta instalación todavía está en modo de prueba.
                  </p>
                ) : null}
                <p className="mt-4 text-xs text-muted-foreground">
                  {account.lastSync
                    ? `Última sincronización: ${new Date(account.lastSync).toLocaleString("es", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" })} UTC`
                    : "Esperando la primera sincronización"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-8 flex gap-3 text-sm text-muted-foreground">
        <UsersRound size={18} className="mt-0.5 shrink-0" />
        <p className="max-w-[65ch]">
          Tus cuentas comparten este espacio, pero mantienen sus propias reglas
          y decisiones. Podés empezar por el trabajo y sumar la personal
          después.
        </p>
      </div>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "automatic"
                ? "Activar el filtro"
                : "Desconectar esta cuenta"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "automatic"
                ? `Confirmás que revisaste las propuestas de ${confirm.account.email}. Desde ahora, Sotto podrá apartar nuevos correos de las categorías que elegiste. Podés pausarlo y deshacer cada movimiento.`
                : `Sotto dejará de acceder a ${confirm?.account.email}. Los correos y etiquetas existentes quedan en Gmail. También podés revisar o revocar el acceso en tu Cuenta de Google.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <InlineError />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (event) => {
                event.preventDefault();
                if (!confirm) return;
                if (confirm.action === "automatic") {
                  if (
                    !(await act(
                      { action: "reviewed", accountId: confirm.account.id },
                      "Revisión confirmada",
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
                      "Filtro activado",
                    )
                  )
                    setConfirm(null);
                } else if (
                  await act(
                    { action: "disconnect", accountId: confirm.account.id },
                    "Cuenta desconectada de Sotto",
                  )
                )
                  setConfirm(null);
              }}
            >
              {busy
                ? "Guardando…"
                : confirm?.action === "automatic"
                  ? "Activar filtro"
                  : "Desconectar"}
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
        title="Estos correos se quedan."
        description="Dale prioridad a las personas con las que querés seguir en contacto."
        action={
          <Button
            size="lg"
            disabled={!data.accounts.length}
            onClick={() => setOpen(true)}
          >
            <Plus />
            Permitir remitente
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
                    {data.accounts.find((a) => a.id === rule.accountId)?.name} ·
                    Siempre en mi bandeja
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar permiso de ${rule.sender}`}
                  onClick={() => setRemoveId(rule.id)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title="Un lugar para tus contactos de confianza"
            detail="Agregá un remitente para que Sotto conserve sus correos, incluso cuando parezcan comerciales."
            icon={ShieldCheck}
          />
        )}
      </section>
      <p className="mt-5 max-w-[65ch] text-xs leading-5 text-muted-foreground">
        Además, Sotto conserva las conversaciones en las que participaste, los
        correos de tu organización y los mensajes que marcaste con una estrella.
      </p>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-[440px]">
          <SheetHeader className="p-6 pt-10">
            <SheetTitle>Permitir un remitente</SheetTitle>
            <SheetDescription>
              Sus próximos correos se quedan en tu bandeja.
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
                  "Remitente permitido",
                )
              ) {
                setOpen(false);
                setEmail("");
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="sender">Correo del remitente</Label>
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
              <Label>En esta cuenta</Label>
              <AccountPicker value={accountId} onChange={setAccountId} />
            </div>
            <InlineError />
            <Button
              type="submit"
              disabled={busy || !accountId}
              className="w-full"
            >
              {busy ? "Guardando…" : "Permitir remitente"}
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
            <AlertDialogTitle>Quitar esta excepción</AlertDialogTitle>
            <AlertDialogDescription>
              Sotto volverá a evaluar los próximos correos de este remitente.
              Sus mensajes actuales no cambian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <InlineError />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (
                  await act(
                    { action: "removeRule", ruleId: removeId },
                    "Excepción quitada",
                  )
                )
                  setRemoveId(null);
              }}
            >
              Quitar excepción
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
        title="A tu manera."
        description="Elegí cuánto ruido querés sacar de cada bandeja."
        action={
          account ? (
            <AccountPicker value={accountId} onChange={setAccountId} />
          ) : undefined
        }
      />
      <h2 className="mb-4 text-base font-semibold">Qué puede apartar</h2>
      <section className="divide-y overflow-hidden rounded-xl border bg-card">
        <SettingRow
          title="Ventas no solicitadas"
          description="Propuestas comerciales de personas con las que no conversaste."
          checked
          disabled
        />
        <SettingRow
          title="Seguimientos comerciales"
          description="Ofertas de herramientas en las que te registraste o que ya usás."
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
              "Guardado",
            )
          }
        />
        <SettingRow
          title="Newsletters y promociones"
          description="Boletines y campañas que preferís leer en otro momento."
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
              "Guardado",
            )
          }
        />
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Las ventas van a Sotto/Cold. Las otras categorías, a Sotto/Lectura.
      </p>
      <h2 className="mt-10 mb-4 text-base font-semibold">
        Siempre bajo tu control
      </h2>
      <section className="divide-y overflow-hidden rounded-xl border bg-card">
        {[
          {
            icon: ShieldCheck,
            title: "Ante la duda, conservar",
            description:
              "Posibles clientes, inversores, trámites y avisos útiles se quedan.",
          },
          {
            icon: Undo2,
            title: "Apartar no es borrar",
            description:
              "Cada movimiento tiene una explicación y se puede deshacer.",
          },
          {
            icon: RefreshCw,
            title: "Una revisión de respaldo",
            description:
              "Si se pierde un aviso de Gmail, Sotto recupera los cambios pendientes.",
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
        <Link href="/privacidad" className="underline underline-offset-4">
          Privacidad y acceso a tus datos
        </Link>
        {data.authenticated ? (
          <form action="/api/logout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Cerrar sesión
            </Button>
          </form>
        ) : (
          <a
            href="https://github.com/josebenitezg/sotto"
            target="_blank"
            rel="noreferrer"
          >
            Sotto es open source ↗
          </a>
        )}
      </div>
    </>
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
          {saved ? "Guardado" : ""}
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
