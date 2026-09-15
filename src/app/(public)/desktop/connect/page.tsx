import Link from "next/link";
import { sessionViewer, sessionWorkspace } from "@/lib/server/auth";
import { desktopEnabled } from "@/lib/server/desktop-config";
import { query } from "@/lib/server/db";
import { Button } from "@/components/ui/button";
import { GoogleDataNotice } from "@/components/google-data-notice";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; approved?: string }>;
}) {
  const params = await searchParams;
  const workspace = await sessionWorkspace();
  const viewer = workspace ? await sessionViewer() : null;
  const [pair] =
    desktopEnabled() && params.id && /^[a-f0-9-]{36}$/.test(params.id)
      ? await query(
          "SELECT id,user_code FROM desktop_pairings WHERE id=$1 AND expires_at>now() AND workspace_id IS NULL",
          [params.id],
        )
      : [];
  return (
    <main className="mx-auto max-w-sm px-6 py-16 space-y-6">
      <h1 className="text-2xl font-semibold">
        {params.approved ? "Mac connected" : "Connect your Mac"}
      </h1>
      {params.approved ? (
        <p className="text-muted-foreground">
          Return to Sotto Local to finish setting up this Mac.
        </p>
      ) : !pair ? (
        <p className="text-muted-foreground">
          Open Sotto Local and start a new connection.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Only approve if this code matches the one in Sotto Local on your
            Mac.
          </p>
          <p className="font-mono text-2xl tracking-widest">{pair.user_code}</p>
          <p className="text-small text-muted-foreground">
            Your Mac will access your Sotto account, connected Gmail accounts
            and subscription. Email content passes through Composio and Sotto to
            your Mac. AI classification runs locally after you enable it for an
            account.
          </p>
          {workspace ? (
            <form
              action="/api/desktop/approve"
              method="post"
              className="space-y-4"
            >
              <p className="text-small">
                Continue as {viewer?.email ?? "your signed-in account"}
              </p>
              <input type="hidden" name="id" value={pair.id} />
              <input type="hidden" name="code" value={pair.user_code} />
              <Button type="submit">Connect this Mac</Button>
            </form>
          ) : (
            <form
              action="/api/google/connect"
              method="post"
              className="space-y-4"
            >
              <input type="hidden" name="desktopPairing" value={pair.id} />
              <Button type="submit" aria-describedby="desktop-google-data">
                Continue with Google
              </Button>
              <GoogleDataNotice id="desktop-google-data" />
            </form>
          )}
          <Link href="/privacy" className="text-small underline">
            How we use your data
          </Link>
        </>
      )}
    </main>
  );
}
