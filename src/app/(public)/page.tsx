import Link from "next/link";
import { GoogleMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { GoogleDataNotice } from "@/components/google-data-notice";
import { configured, isDemo } from "@/lib/server/config";
import { sessionWorkspace } from "@/lib/server/auth";
import { InboxDemo } from "@/components/inbox-demo";

/* One screen: headline, one sentence, the button, the notice, and the demo. */
export default async function LandingPage() {
  const ready = configured() && !isDemo();
  const signedIn = ready && !!(await sessionWorkspace());
  return (
    <main
      id="content"
      className="mx-auto flex w-full max-w-[1120px] flex-1 items-center px-6 py-12 md:py-16"
    >
      <div className="grid w-full items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div className="max-w-[480px]">
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
        </div>
        <InboxDemo />
      </div>
    </main>
  );
}
