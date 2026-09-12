import Link from "next/link";
import { GoogleMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { GoogleDataNotice } from "@/components/google-data-notice";
import { configured, isDemo } from "@/lib/server/config";
import { sessionWorkspace } from "@/lib/server/auth";
import { demoDashboard } from "@/lib/demo";

// Two sample decisions from the demo data: the same row the app shows.
const samples = demoDashboard.decisions
  .filter((d) => d.category === "cold")
  .slice(0, 2);

/* One screen: headline, one sentence, the button, the notice, two rows of proof. */
export default async function LandingPage() {
  const ready = configured() && !isDemo();
  const signedIn = ready && !!(await sessionWorkspace());
  return (
    <main
      id="content"
      className="mx-auto flex w-full max-w-[1120px] flex-1 items-center px-6 py-12 md:py-16"
    >
      <div className="w-full max-w-[560px]">
        <h1 className="text-[clamp(40px,5vw,60px)] leading-[1.02] font-semibold tracking-[-0.04em]">
          Cold sales emails,
          <br />
          out of your inbox.
        </h1>
        <p className="mt-6 max-w-[42ch] text-base leading-6 text-muted-foreground">
          Sotto moves them to a Gmail label, shows why, and lets you undo.
        </p>
        {signedIn ? (
          <Button asChild size="lg" className="mt-8">
            <Link href="/review">Open Sotto</Link>
          </Button>
        ) : (
          <form action="/api/google/connect" method="post" className="mt-8">
            <input type="hidden" name="intent" value="filter" />
            <Button
              type="submit"
              size="lg"
              disabled={!ready}
              aria-describedby={
                ready ? "hero-permission" : "hero-permission hero-status"
              }
            >
              <GoogleMark />
              Connect with Google
            </Button>
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
        <section
          aria-label="Sample of moved emails"
          className="hairline mt-12 rounded-md border"
        >
          <h2 className="flex h-10 items-center justify-between px-4 text-small text-muted-foreground">
            <span>Moved to Sotto/Cold</span>
            <span>Demo</span>
          </h2>
          {samples.map((d) => (
            <div key={d.id} className="px-4 py-4">
              <p className="leading-5 font-medium">{d.subject}</p>
              <p className="mt-1 text-small text-muted-foreground">
                <span className="mono">{d.sender}</span>
                <span aria-hidden="true"> · </span>
                {d.reason}
              </p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
