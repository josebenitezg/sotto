import Link from "next/link";
import { ArrowUpRight, Github } from "lucide-react";
import { SottoMark } from "./brand";

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link href="/" className="wordmark" aria-label="Sotto, inicio">
        <SottoMark className="size-8" />
        sotto<span className="wordmark-dot">.</span>
      </Link>
      <nav
        aria-label="Navegación principal"
        className="flex items-center gap-6 sm:gap-9"
      >
        <Link
          className="public-nav-link hidden sm:block"
          href="/#como-funciona"
        >
          Cómo funciona
        </Link>
        <Link className="public-nav-link" href="/planes">
          El plan
        </Link>
        <Link href="/login" className="public-login-link">
          Ingresar <ArrowUpRight size={15} />
        </Link>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <Link href="/" className="wordmark text-xl" aria-label="Sotto, inicio">
        <SottoMark className="size-6" />
        sotto.
      </Link>
      <p className="text-xs text-muted-foreground">Un poco menos de ruido.</p>
      <div className="flex items-center gap-6 text-xs">
        <Link href="/privacidad" className="public-nav-link">
          Privacidad
        </Link>
        <a
          href="https://github.com/josebenitezg/sotto"
          className="public-nav-link inline-flex items-center gap-2"
        >
          <Github size={14} /> Código abierto <ArrowUpRight size={12} />
        </a>
      </div>
    </footer>
  );
}
