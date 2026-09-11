import Link from "next/link";

/* Required disclosure for the Google connection. Restyle only; never shorten. */
export function GoogleDataNotice({ id }: { id: string }) {
  return (
    <p id={id} className="text-xs leading-4 text-muted-foreground">
      With active trial or plan access, connecting starts filtering cold
      outreach from the last 7 days, then new emails, into Sotto/Cold in Gmail.
      Sotto shares email text, sender details, your email address and
      preferences with OpenAI for classification. By connecting, you authorize
      this use. Pause or undo anytime. Connections through Composio share Gmail
      access and message data with Composio to provide this service.{" "}
      <Link
        href="/privacy"
        className="underline underline-offset-2 hover:text-foreground"
      >
        How we use your data
      </Link>
      .
    </p>
  );
}
