import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Github,
  Undo2,
} from "lucide-react";
import { GoogleMark, SottoMark } from "@/components/brand";
import { InboxPreview } from "@/components/inbox-preview";
import { configured, isDemo } from "@/lib/server/config";
import { sessionWorkspace } from "@/lib/server/auth";

const questions = [
  [
    "¿Sotto reemplaza a Gmail?",
    "No. Seguís usando Gmail como siempre. Sotto aparta los correos comerciales no solicitados en una etiqueta que podés revisar cuando quieras.",
  ],
  [
    "¿Cómo decide qué apartar?",
    "La IA interpreta el mensaje, el contexto de la conversación y tus preferencias. Primero revisás sus propuestas; después podés activar el modo automático. Si hay dudas, deja el mensaje para revisar.",
  ],
  [
    "¿Y si aparta algo que me importa?",
    "Podés ver el motivo de cada decisión, devolver el correo a la bandeja y agregar el remitente a tus permitidos. Sotto no elimina mensajes ni los marca como leídos.",
  ],
  [
    "¿Qué pasa con mis datos?",
    "Sotto consulta el correo necesario para clasificarlo y envía un fragmento acotado al proveedor de IA. No guarda el cuerpo completo ni abre adjuntos. Los permisos, proveedores y datos guardados están explicados en la página de privacidad.",
  ],
];

export default async function LandingPage() {
  const ready = configured() && !isDemo();
  const signedIn = ready && !!(await sessionWorkspace());
  return (
    <main id="contenido">
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="quiet-dot" /> Menos cold emails. Más calma.
          </div>
          <h1 className="display-title">
            Tu inbox,
            <br />
            <em>en voz baja.</em>
          </h1>
          <p className="hero-description">
            Las conversaciones que importan, a la vista.
            <br className="hidden lg:block" /> Las ventas que no pediste,
            aparte.
            <br /> Dejá que Sotto se ocupe del ruido.
          </p>
          {signedIn ? (
            <Link href="/revision" className="google-cta pressable">
              Abrir mi bandeja <ArrowRight size={16} />
            </Link>
          ) : (
            <form
              action="/api/google/connect"
              method="post"
              className="hero-connect"
            >
              <button
                type="submit"
                className="google-cta pressable"
                disabled={!ready}
                aria-describedby="hero-google-status"
              >
                <span className="google-cta-icon">
                  <GoogleMark />
                </span>
                Continuar con Google <ArrowRight size={16} />
              </button>
            </form>
          )}
          <p id="hero-google-status" className="hero-footnote">
            {ready
              ? "Para Gmail y Google Workspace."
              : "Acceso con Google disponible próximamente."}
          </p>
          <a href="#como-funciona" className="hero-discover">
            Un pequeño cambio en tu día <ArrowDown size={14} />
          </a>
        </div>
        <div className="hero-product">
          <div className="product-margin-note">
            No todo merece tu atención.<span aria-hidden="true">↴</span>
          </div>
          <InboxPreview />
        </div>
      </section>
      <div className="landing-trust">
        <span>
          <SottoMark className="size-4" /> IA que lee el contexto
        </span>
        <span>
          <Undo2 size={14} /> Cada decisión se puede deshacer
        </span>
        <a href="https://github.com/josebenitezg/sotto">
          <Github size={14} /> Abierto, también por dentro{" "}
          <ArrowUpRight size={12} />
        </a>
      </div>
      <section id="como-funciona" className="how-section">
        <div className="section-intro">
          <p className="section-kicker">Así de simple</p>
          <h2 className="display-heading">
            Un lugar para cada correo.
            <br />
            <em>Un poco de aire para vos.</em>
          </h2>
        </div>
        <div className="how-grid">
          <article>
            <span className="step-number">01</span>
            <h3>Conectá tu Gmail.</h3>
            <p>
              Tu cuenta de trabajo, la personal o las dos. El correo sigue donde
              siempre.
            </p>
          </article>
          <article>
            <span className="step-number">02</span>
            <h3>Enseñale qué te importa.</h3>
            <p>
              Contale tus preferencias y revisá las primeras propuestas. La IA
              considera el contexto de cada mensaje.
            </p>
          </article>
          <article>
            <span className="step-number">03</span>
            <h3>Volvé a lo tuyo.</h3>
            <p>
              Activá el modo automático cuando estés listo. Lo comercial queda
              aparte y todo se puede deshacer.
            </p>
          </article>
        </div>
      </section>
      <section className="quiet-manifesto">
        <SottoMark className="size-10" />
        <p>
          No necesitás una bandeja nueva.
          <br />
          Necesitás que la tuya <em>respire.</em>
        </p>
        <span>Menos interrupciones. El mismo Gmail.</span>
      </section>
      <section className="landing-bottom">
        <div className="faq-section">
          <p className="section-kicker">Antes de entrar</p>
          <h2 className="display-heading">
            Con calma.
            <br />
            <em>Y con respuestas.</em>
          </h2>
          <div className="faq-list">
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
        <aside className="landing-plan">
          <SottoMark className="size-8" />
          <p className="mt-5 text-sm">Un plan para hacer lugar.</p>
          <h2 className="display-heading mt-4">
            3 días
            <br />
            <em>para probar.</em>
          </h2>
          <ul className="my-6 space-y-3 text-sm">
            {[
              "Hasta dos cuentas de Gmail",
              "Revisión y modo automático",
              "Tu correo bajo tu control",
            ].map((text) => (
              <li key={text} className="flex items-center gap-2">
                <Check size={15} />
                {text}
              </li>
            ))}
          </ul>
          <Link href="/planes" className="plan-link pressable">
            Conocer el plan <ArrowUpRight size={16} />
          </Link>
          <p className="mt-4 text-xs leading-5 opacity-75">
            Estamos preparando el acceso.
            <br />
            Tu prueba empieza cuando la activás.
          </p>
        </aside>
      </section>
    </main>
  );
}
