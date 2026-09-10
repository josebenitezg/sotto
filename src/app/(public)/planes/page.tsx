import Link from "next/link";
import { Check } from "lucide-react";
import {
  BillingAction,
  RefreshAfterCheckout,
} from "@/components/billing-action";
import { Button } from "@/components/ui/button";
import { sessionWorkspace } from "@/lib/server/auth";
import { billingReady, trialRequiresCard } from "@/lib/server/billing";
import { query } from "@/lib/server/db";
import { configured, hosted, isDemo } from "@/lib/server/config";
import { hasAccess } from "@/lib/server/entitlements";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const workspaceId = isDemo() ? null : await sessionWorkspace();
  const [workspace] = workspaceId
    ? await query("SELECT * FROM workspaces WHERE id=$1", [workspaceId])
    : [];
  const available = billingReady();
  const active =
    workspace &&
    hasAccess({
      internal: workspace.internal,
      subscription_status: workspace.subscription_status,
      trial_end: workspace.trial_end,
      paid_until: workspace.paid_until,
    });
  const amount = Number(process.env.PLAN_PRICE_CENTS || "900") / 100;
  const params = await searchParams;
  const date = (value: Date) =>
    new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(value) + " UTC";
  return (
    <main id="contenido" className="public-document space-y-8">
      <div>
        <h1 className="text-[28px] leading-8 font-semibold tracking-tight">
          Menos ruido. Un plan simple.
        </h1>
        <p className="mt-3 max-w-[58ch] text-sm leading-6 text-muted-foreground">
          Probá Sotto durante tres días. Seguí usando Gmail, con las propuestas
          comerciales aparte y cada decisión a la vista.
        </p>
      </div>
      <section
        className="rounded-xl border bg-card p-6 md:p-8"
        aria-labelledby="plan-title"
      >
        <h2 id="plan-title" className="text-base font-semibold">
          Sotto
        </h2>
        <p className="mt-4">
          <span className="text-4xl font-semibold tracking-tight">
            US${amount}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            por persona al mes
          </span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Tres días de prueba. Hasta dos cuentas Gmail.
        </p>
        <ul className="my-7 space-y-3 text-sm">
          {[
            "IA que interpreta el mensaje y tus preferencias",
            "Cuentas de trabajo y personal en un solo espacio",
            "Motivo de cada decisión y opción de deshacer",
            "Tu correo sigue en Gmail",
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <Check size={17} className="mt-0.5 shrink-0 text-primary" />
              {line}
            </li>
          ))}
        </ul>
        {workspace?.internal ? (
          <p className="text-sm text-muted-foreground">
            Tu instalación personal ya tiene acceso. No necesita una
            suscripción.
          </p>
        ) : !available ? (
          <>
            <Button size="lg" disabled>
              Prueba disponible próximamente
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">
              Estamos terminando la conexión. La prueba y los cobros todavía no
              están habilitados.
            </p>
          </>
        ) : !workspace ? (
          <form action="/api/google/connect" method="post">
            <Button type="submit" size="lg" disabled={!configured()}>
              Conectar con Google
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">
              Primero conectás Gmail. La prueba comienza cuando la activás en el
              siguiente paso.
            </p>
          </form>
        ) : active ? (
          <div className="space-y-4">
            <p className="text-sm">
              {workspace.subscription_status === "trialing"
                ? `Tu prueba termina el ${date(workspace.trial_end)}.`
                : workspace.cancel_at_period_end
                  ? `Tu plan está cancelado y conserva acceso hasta el ${date(workspace.paid_until)}.`
                  : "Tu suscripción está activa."}
            </p>
            <BillingAction action="portal">Gestionar suscripción</BillingAction>
          </div>
        ) : (
          <BillingAction action="checkout">
            {workspace.trial_used
              ? "Activar suscripción"
              : "Comenzar mis 3 días de prueba"}
          </BillingAction>
        )}
        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          {trialRequiresCard()
            ? "Se pide tarjeta al iniciar. Al finalizar los tres días, Stripe cobra el precio mensual indicado salvo que canceles antes."
            : "Sin tarjeta para probar. Si no elegís continuar, la prueba termina sin cobros. Al contratar la suscripción, el cobro es mensual hasta que canceles."}{" "}
          Los impuestos aplicables se muestran en el checkout cuando
          corresponda.
        </p>
      </section>
      {workspace && hosted() && !workspace.internal && (
        <div className="space-y-4">
          {params.checkout === "success" && available && (
            <RefreshAfterCheckout />
          )}
          {!active && workspace.trial_used && (
            <p className="text-sm text-muted-foreground">
              El procesamiento está pausado. Podés seguir consultando tu
              historial, devolver correos a la bandeja y desconectar tus
              cuentas.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <BillingAction action="refresh" secondary>
              Actualizar estado
            </BillingAction>
            {workspace.stripe_customer_id && !active && (
              <BillingAction action="portal" secondary>
                Gestionar pagos
              </BillingAction>
            )}
          </div>
        </div>
      )}
      <section className="space-y-3 text-sm leading-6 text-muted-foreground">
        <h2 className="font-semibold text-foreground">
          También podés instalarlo vos.
        </h2>
        <p>
          Sotto es de código abierto bajo licencia MIT. La instalación propia no
          necesita esta suscripción; usás tu infraestructura y tu proveedor de
          IA.
        </p>
        <a
          href="https://github.com/josebenitezg/sotto"
          className="text-primary underline underline-offset-4"
        >
          Ver el proyecto en GitHub
        </a>
      </section>
      <p className="text-xs text-muted-foreground">
        <Link className="underline underline-offset-4" href="/privacidad">
          Privacidad y uso de tus datos
        </Link>
      </p>
    </main>
  );
}
