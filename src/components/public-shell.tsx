import Link from "next/link";
import { ArrowUpRight, Github } from "lucide-react";
import { SottoMark } from "./brand";

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link href="/" className="wordmark" aria-label="Sotto, home">
        <SottoMark className="size-8" />
        sotto<span className="wordmark-dot">.</span>
      </Link>
      <nav
        aria-label="Main navigation"
        className="flex items-center gap-6 sm:gap-9"
      >
        <Link className="public-nav-link hidden sm:block" href="/#how-it-works">
          How it works
        </Link>
        <Link className="public-nav-link" href="/pricing">
          Pricing
        </Link>
        <Link href="/login" className="public-login-link">
          Sign in
          <ArrowUpRight size={15} />
        </Link>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <Link href="/" className="wordmark text-xl" aria-label="Sotto, home">
        <SottoMark className="size-6" />
        sotto.
      </Link>
      <p className="text-xs text-muted-foreground">A little less noise.</p>
      <div className="flex items-center gap-6 text-xs">
        <Link href="/privacy" className="public-nav-link">
          Privacy
        </Link>
        <a
          href="https://github.com/josebenitezg/sotto"
          className="public-nav-link inline-flex items-center gap-2"
        >
          <Github size={14} />
          Open source
          <ArrowUpRight size={12} />
        </a>
      </div>
    </footer>
  );
}
