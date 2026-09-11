import Link from "next/link";
export default function PrivacyPage() {
  return (
    <main id="content" className="public-document space-y-6">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        Back to home
      </Link>
      <h1 className="text-[28px] leading-8 font-semibold tracking-tight">
        Your email belongs to you.
      </h1>
      <p className="text-muted-foreground">
        Sotto is an open-source tool for organizing Gmail. The sotto.email
        service is operated by Perception Technologies Inc. and processes data
        on this installation's infrastructure. If you host your own copy, you
        choose and control the providers. Each installation maintains its own
        database.
      </p>
      <h2 className="text-base font-semibold">What we access</h2>
      <p className="text-muted-foreground">
        Sender, subject, message text, labels, and conversation context. Sotto
        also checks whether you have previously emailed the sender. Attachments,
        links, and remote images are not opened.
      </p>
      <h2 className="text-base font-semibold">When filtering starts</h2>
      <p className="text-muted-foreground">
        Connecting through the automatic-filtering notice authorizes Sotto to
        organize cold outreach in your Inbox from the last seven days and new
        incoming messages. You can pause filtering or restore moved messages.
        Sotto records this authorization. Reconnecting without this notice
        preserves your existing filtering choice.
      </p>
      <h2 className="text-base font-semibold">What we store</h2>
      <p className="text-muted-foreground">
        The encrypted Google connection, rules, message identifiers, sender,
        subject, and decision history. Sotto does not store full message bodies.
        You can delete a Gmail connection's data from Accounts, as explained
        below.
      </p>
      <h2 className="text-base font-semibold">When we use AI</h2>
      <p className="text-muted-foreground">
        Messages that the protective checks do not resolve are classified with
        OpenAI. At sotto.email, the connection to OpenAI is direct. OpenAI
        receives the sender, subject, recipient account address, your
        preferences, and up to 16,000 characters of normalized text. We request
        that the response not be stored by the service; this is not a guarantee
        of zero retention by the provider. If you host your own copy, check
        which provider you have configured. Also check your organization's
        policy before connecting a work account.
      </p>
      <h2 className="text-base font-semibold">Limited use of your data</h2>
      <p className="text-muted-foreground">
        We use Google data only to connect your account, classify and organize
        the email you choose, show decisions, and let you correct them. Our use
        and transfer of information received from Google APIs comply with the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="underline underline-offset-4"
        >
          Google API Services User Data Policy
        </a>
        , including its Limited Use requirements.
      </p>
      <p className="text-muted-foreground">
        We do not sell your data or use it for advertising, credit assessment,
        or training general-purpose AI models. Classification uses an existing
        model; it does not train a model on your email. Sharing API inputs and
        outputs with OpenAI for training is disabled in this installation. Human
        access to content requires your specific authorization, except when
        necessary for security or compliance with the law.
      </p>
      <h2 className="text-base font-semibold">Providers and retention</h2>
      <p className="text-muted-foreground">
        Google manages Gmail access and change notifications. Vercel hosts Sotto
        and its processing queue; Neon stores encrypted connections and
        application records; OpenAI receives the data needed for classification.
        These providers process information to deliver the service. We do not
        send message bodies to the queue or the payment system.
      </p>
      <p className="text-muted-foreground">
        We retain the credential until you disconnect or delete Gmail data.
        History, preferences, and job identifiers are retained until you delete
        them: they support reviewing decisions, undoing moves, and avoiding
        duplicate processing. Disconnecting preserves this history; deleting
        Gmail data removes it from the active database. Your sign-in identity
        and plan are retained until you request deletion of your Sotto account
        through the privacy contact.
      </p>
      <p className="text-muted-foreground">
        Sessions expire after seven days and connection attempts after ten
        minutes. Daily cleanup removes expired sessions and attempts, along with
        Gmail notifications processed more than seven days ago. Pending Vercel
        queue jobs contain only an account identifier and expire within 24
        hours; they cannot access that Gmail account after its connection is
        deleted.
      </p>
      <p className="text-muted-foreground">
        This installation's database has a six-hour recovery window in Neon. A
        record deleted from the active database may remain in that history until
        the window expires. This does not delete internal records retained by
        the provider under its own terms.
      </p>
      <p className="text-muted-foreground">
        OpenAI may retain abuse-monitoring logs for up to 30 days under its
        usual policy, subject to the legal and security exceptions described in
        its{" "}
        <a
          href="https://developers.openai.com/api/docs/guides/your-data"
          className="underline underline-offset-4"
        >
          data controls
        </a>
        . Requesting that the response not be stored does not remove that
        retention. Provider backups and operational logs may persist after
        deletion from the active database under their retention terms; a request
        for complete deletion is also reviewed with respect to those records.
      </p>
      <h2 className="text-base font-semibold">Subscriptions and payments</h2>
      <p className="text-muted-foreground">
        When subscriptions are enabled, Stripe processes payments and receives
        your account email and workspace identifier. We do not send your
        messages to Stripe. Sotto stores subscription identifiers and status; it
        does not store your card details.
      </p>
      <h2 className="text-base font-semibold">
        The Google permission we request
      </h2>
      <p className="text-muted-foreground">
        Google groups reading, modification, and sending within the permission
        needed to change message labels. Sotto uses that access to read and
        organize messages; it does not implement sending, deleting, or marking
        messages as read.
      </p>
      <h2 className="text-base font-semibold">Pausing or disconnecting</h2>
      <p className="text-muted-foreground">
        You can pause an account, disconnect it, or revoke access from your
        Google Account. Disconnecting stops processing and deletes its local
        credential, even if Google does not respond to the revocation request.
        You can check or revoke that permission directly in{" "}
        <a
          href="https://myaccount.google.com/connections"
          className="underline underline-offset-4"
        >
          your Google Account connections
        </a>
        . Disconnecting does not delete emails, labels, or Sotto's decision
        history.
      </p>
      <p className="text-xs text-muted-foreground">
        <strong>Delete Gmail data.</strong> In Accounts, this action asks you to
        confirm the address and removes that account's connection, credential,
        preferences, allowed senders, decisions, jobs, and events from the
        active database. It stops processing even if Google revocation fails.
        Emails and labels stay as they are in Gmail; deleting the history means
        moves can no longer be undone from Sotto. We retain the minimum identity
        linking your sign-in to your workspace, the deletion time to prevent
        reconnections started before the request, your workspace email, and plan
        data. Other accounts are not deleted. Reconnecting Google authorizes a
        new review. This action does not request deletion of records that
        providers may retain under their own policies.
      </p>
      <p className="text-xs text-muted-foreground">
        For support, privacy questions, or requests to delete sotto.email data,
        contact{" "}
        <a
          href="mailto:support@sotto.email"
          className="underline underline-offset-4"
        >
          support@sotto.email
        </a>
        .
      </p>
      <p className="text-xs text-muted-foreground">
        Last updated: September 2026. Each installation's operator is
        responsible for its configuration and data processing.
      </p>
    </main>
  );
}
