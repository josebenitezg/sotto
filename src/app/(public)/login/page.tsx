import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, LockKeyhole } from "lucide-react";
import { GoogleMark, SottoMark } from "@/components/brand";
import { GoogleDataNotice } from "@/components/google-data-notice";
import { configured, isDemo } from "@/lib/server/config";
import { sessionWorkspace } from "@/lib/server/auth";

export const metadata = { title: "Ingresar — Sotto" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ connection_error?: string }>;
}) {
  if (!isDemo() && (await sessionWorkspace())) redirect("/revision");
  const ready = configured() && !isDemo();
  const { connection_error: error } = await searchParams;
  return (
    <main id="contenido" className="login-page">
      <div className="login-aside">
        <SottoMark className="size-12" />
        <p className="display-title">
          Un correo
          <br />
          menos.
          <br />
          <em>
            Un respiro
            <br />
            más.
          </em>
        </p>
        <span>Tu atención tiene mejores planes.</span>
      </div>
      <section className="login-form" aria-labelledby="login-title">
        <p className="section-kicker">Bienvenido a Sotto</p>
        <h1 id="login-title" className="display-heading">
          Hacé lugar
          <br />
          <em>para lo importante.</em>
        </h1>
        <p className="my-6 max-w-[34ch] text-muted-foreground">
          Conectá tu Gmail y elegí qué merece quedarse en tu bandeja.
        </p>
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
          >
            No se completó la conexión. Volvé a intentarlo con una cuenta
            habilitada y aceptá el acceso a Gmail.
          </p>
        )}
        <form action="/api/google/connect" method="post" className="space-y-4">
          <GoogleDataNotice id="google-permission" />
          <button
            type="submit"
            className="google-cta pressable w-full justify-center"
            disabled={!ready}
            aria-describedby={
              !ready ? "google-permission google-status" : "google-permission"
            }
          >
            <span className="google-cta-icon">
              <GoogleMark />
            </span>{" "}
            Continuar con Google <ArrowRight size={16} />
          </button>
        </form>
        {!ready && (
          <p id="google-status" role="status" className="login-status">
            Estamos terminando de habilitar el acceso con Google. Por ahora
            podés explorar cómo funciona Sotto.
          </p>
        )}
        <div className="login-privacy">
          <LockKeyhole className="mt-0.5 shrink-0" size={14} />
          <p>
            Conocé qué datos usamos, cómo interviene la IA y cómo desconectarte
            en nuestra{" "}
            <Link href="/privacidad" className="underline underline-offset-4">
              página de privacidad
            </Link>
            .
          </p>
        </div>
        <Link
          href="/#como-funciona"
          className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground"
        >
          Primero quiero ver cómo funciona <ArrowUpRight size={13} />
        </Link>
      </section>
    </main>
  );
}
