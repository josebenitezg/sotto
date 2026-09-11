import Link from "next/link";
import { SottoMark } from "./brand";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 text-foreground ${className}`}
      aria-label="Sotto, home"
    >
      <SottoMark className="size-5" />
      <span className="text-[15px] leading-5 font-semibold tracking-[-0.02em]">
        sotto
      </span>
    </Link>
  );
}

export function PublicHeader({ inApp = false }: { inApp?: boolean }) {
  return (
    <header className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-6">
      <Wordmark />
      <nav aria-label="Main navigation" className="flex items-center gap-1">
        <Link
          href="/pricing"
          className="flex h-8 items-center rounded-sm px-3 text-[13px] text-muted-foreground transition-colors duration-[120ms] hover:text-foreground"
        >
          Pricing
        </Link>
        <Link
          href={inApp ? "/review" : "/login"}
          className="flex h-8 items-center rounded-sm border border-border px-3 text-[13px] text-foreground transition-colors duration-[120ms] hover:border-border-hover hover:bg-gray-100"
        >
          {inApp ? "Open Sotto" : "Sign in"}
        </Link>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <SottoMark className="size-4" />
        Sotto
      </span>
      <nav aria-label="Footer" className="flex items-center gap-6">
        <Link
          href="/privacy"
          className="transition-colors duration-[120ms] hover:text-foreground"
        >
          Privacy
        </Link>
        <a
          href="https://github.com/josebenitezg/sotto"
          className="transition-colors duration-[120ms] hover:text-foreground"
        >
          GitHub
        </a>
      </nav>
    </footer>
  );
}
