import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, LockKeyhole } from "lucide-react";
import { GoogleMark, SottoMark } from "@/components/brand";
import { GoogleDataNotice } from "@/components/google-data-notice";
import { configured, isDemo } from "@/lib/server/config";
import { sessionWorkspace } from "@/lib/server/auth";

export const metadata = { title: "Sign in — Sotto" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ connection_error?: string }>;
}) {
  if (!isDemo() && (await sessionWorkspace())) redirect("/review");
  const ready = configured() && !isDemo();
  const { connection_error: error } = await searchParams;
  return (
    <main id="content" className="login-page">
      <div className="login-aside">
        <SottoMark className="size-12" />
        <p className="display-title">
          One less
          <br />
          email.
          <br />
          <em>
            A little more
            <br />
            room.
          </em>
        </p>
        <span>Your attention has better places to be.</span>
      </div>
      <section className="login-form" aria-labelledby="login-title">
        <p className="section-kicker">Welcome to Sotto</p>
        <h1 id="login-title" className="display-heading">
          Make room
          <br />
          <em>for what matters.</em>
        </h1>
        <p className="my-6 max-w-[34ch] text-muted-foreground">
          Connect Gmail and choose what belongs in your inbox.
        </p>
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
          >
            The connection did not complete. Try again with an enabled account
            and allow access to Gmail.
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
            Continue with Google
            <ArrowRight size={16} />
          </button>
        </form>
        {!ready && (
          <p id="google-status" role="status" className="login-status">
            Google sign-in is coming soon. In the meantime, explore how Sotto
            works.
          </p>
        )}
        <div className="login-privacy">
          <LockKeyhole className="mt-0.5 shrink-0" size={14} />
          <p>
            Learn what data we use, how AI helps, and how to disconnect in our{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              privacy policy
            </Link>
            .
          </p>
        </div>
        <Link
          href="/#how-it-works"
          className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground"
        >
          See how it works first
          <ArrowUpRight size={13} />
        </Link>
      </section>
    </main>
  );
}
