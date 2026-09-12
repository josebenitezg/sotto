import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GoogleMark } from "@/components/brand";
import { InboxPreview } from "@/components/inbox-preview";
import { GoogleDataNotice } from "@/components/google-data-notice";
import { configured, isDemo } from "@/lib/server/config";
import { sessionWorkspace } from "@/lib/server/auth";

/* One screen. The demo is the how-it-works; the notice is the fine print. */
export default async function LandingPage() {
  const ready = configured() && !isDemo();
  const signedIn = ready && !!(await sessionWorkspace());
  return (
    <main
      id="content"
      className="mx-auto flex w-full max-w-[1120px] flex-1 items-center px-6 py-12 md:py-16"
    >
      <section className="grid w-full items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="max-w-[520px]">
          <h1 className="text-[clamp(40px,5vw,60px)] leading-[1.02] font-semibold tracking-[-0.04em]">
            Your inbox,
            <br />
            <span className="text-muted-foreground">a little quieter.</span>
          </h1>
          <p className="mt-6 max-w-[42ch] text-base leading-6 text-muted-foreground">
            Sotto moves cold sales emails out of your Gmail inbox and shows you
            why.
          </p>
          {signedIn ? (
            <Link
              href="/review"
              className="pressable mt-8 inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85"
            >
              Open Sotto
              <ArrowRight size={16} />
            </Link>
          ) : (
            <form
              action="/api/google/connect"
              method="post"
              className="mt-8 max-w-[420px]"
            >
              <input type="hidden" name="intent" value="filter" />
              <button
                type="submit"
                className="pressable inline-flex h-10 items-center gap-2.5 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50"
                disabled={!ready}
                aria-describedby={
                  ready ? "hero-permission" : "hero-permission hero-status"
                }
              >
                <GoogleMark />
                Connect with Google
              </button>
              {!ready && (
                <p
                  id="hero-status"
                  role="status"
                  className="mt-3 text-xs text-muted-foreground"
                >
                  {isDemo()
                    ? "Sign-in is off in the demo."
                    : "Google sign-in is not set up yet."}
                </p>
              )}
              <div className="mt-4">
                <GoogleDataNotice id="hero-permission" />
              </div>
            </form>
          )}
        </div>
        <InboxPreview />
      </section>
    </main>
  );
}
