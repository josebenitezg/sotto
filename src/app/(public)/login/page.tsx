import { redirect } from "next/navigation";
import { GoogleMark, SottoMark } from "@/components/brand";
import { GoogleDataNotice } from "@/components/google-data-notice";
import { configured, isDemo } from "@/lib/server/config";
import { sessionWorkspace } from "@/lib/server/auth";
import {
  connectionErrorCode,
  connectionErrorMessage,
} from "@/lib/connection-errors";

export const metadata = { title: "Sign in · Sotto" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ connection_error?: string }>;
}) {
  const { connection_error: error } = await searchParams;
  if (!isDemo() && (await sessionWorkspace()))
    redirect(
      error
        ? `/review?connection_error=${connectionErrorCode(error)}`
        : "/review",
    );
  const ready = configured() && !isDemo();
  return (
    <main
      id="content"
      className="mx-auto flex w-full max-w-[360px] flex-col px-6 py-20 md:py-28"
    >
      <SottoMark className="size-8" />
      <h1 className="mt-6 text-2xl leading-8 font-semibold">Sign in</h1>
      <p className="mt-2 text-muted-foreground">
        Use the Google account Sotto should filter.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-sm border border-destructive/40 px-3 py-2.5 text-[13px] leading-[18px] text-destructive"
        >
          {connectionErrorMessage(error)}
        </p>
      )}
      <form action="/api/google/connect" method="post" className="mt-6">
        <input type="hidden" name="intent" value="filter" />
        <button
          type="submit"
          className="pressable inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-[120ms] hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50"
          disabled={!ready}
          aria-describedby={
            ready ? "google-permission" : "google-permission google-status"
          }
        >
          <GoogleMark />
          Connect with Google
        </button>
        {!ready && (
          <p
            id="google-status"
            role="status"
            className="mt-3 text-xs text-muted-foreground"
          >
            {isDemo()
              ? "Sign-in is off in the demo."
              : "Google sign-in is not set up yet."}
          </p>
        )}
        <div className="mt-4">
          <GoogleDataNotice id="google-permission" />
        </div>
      </form>
    </main>
  );
}
