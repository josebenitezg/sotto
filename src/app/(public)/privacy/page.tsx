export default function PrivacyPage() {
  return (
    <main
      id="content"
      className="mx-auto w-full max-w-[680px] space-y-6 px-6 py-16 text-[15px] leading-6 md:py-24 [&_h2]:pt-6 [&_h2]:text-base [&_h2]:leading-6 [&_h2]:font-medium [&_h2]:text-foreground [&_a]:text-foreground"
    >
      <h1 className="text-2xl leading-8 font-semibold">Privacy</h1>
      <p className="text-muted-foreground">
        Sotto is an open-source tool for organizing Gmail. The sotto.email
        service is operated by Jose Maria Benitez Genes under the Sotto name and
        processes data on this installation's infrastructure. If you host your
        own copy, you choose and control the providers. Each installation
        maintains its own database.
      </p>
      <h2>What we access</h2>
      <p className="text-muted-foreground">
        Sender, subject, message text, labels, and conversation context. Sotto
        also checks whether you have previously emailed the sender. Attachments,
        links, and remote images are not opened.
      </p>
      <h2>When filtering starts</h2>
      <p className="text-muted-foreground">
        Connecting through the automatic-filtering notice authorizes Sotto to
        organize cold outreach in your Inbox from the last seven days and new
        incoming messages. You can pause filtering or restore moved messages.
        Sotto records this authorization. Reconnecting without this notice
        preserves your existing filtering choice.
      </p>
      <h2>What we store</h2>
      <p className="text-muted-foreground">
        Connection identifiers, encrypted credentials for direct Google
        connections, rules, message identifiers, sender, subject, and decision
        history. We also store the name and profile picture of the Google
        account you sign in with, only to show who is signed in. We also store
        the AI model and input, cached-input and output token counts linked to
        the account to measure service usage and cost. We record checked-message
        identifiers and a per-period usage total to enforce plan allowances.
        These usage records contain no message text. Sotto does not store full
        message bodies. You can delete a Gmail connection's data from Accounts,
        as explained below.
      </p>
      <h2 id="data-protection">How we protect Google user data</h2>
      <p className="text-muted-foreground">
        At sotto.email, we protect Google user data in transit with encrypted
        connections: HTTPS between your browser and Sotto and between our server
        and Google, Composio, or OpenAI, and TLS with certificate verification
        for our database connection. Stored application data, including Gmail
        metadata and decision history, is encrypted at rest by our database
        provider, Neon, using AES-256 encryption.
      </p>
      <p className="text-muted-foreground">
        For direct Google connections, refresh tokens receive an additional
        layer of encryption in Sotto using AES-256-GCM, bound to the
        corresponding account. The encryption key and provider API credentials
        are kept in private server environment configuration, separate from the
        database, and are not included in browser code or the public source
        repository. Sotto does not collect or store your Google password.
      </p>
      <p className="text-muted-foreground">
        Access to mailbox data and controls requires an authenticated session.
        The server checks workspace ownership before returning mailbox data or
        accepting changes. Session cookies are Secure and HttpOnly, sessions
        expire, and session identifiers are stored as hashes in the database.
        Direct Google connections use PKCE and single-use, browser-bound
        authorization state. Composio connections require the originating
        browser to complete authorization before they can be used. Changes from
        the browser require an origin check. Notifications require a verified
        Google identity token or a valid Composio webhook signature.
      </p>
      <p className="text-muted-foreground">
        We also limit the data we retain: full message bodies are processed for
        classification but are not stored in Sotto's database, and processing
        queues contain account identifiers rather than email content.
        Application code excludes email bodies and Google credentials from
        diagnostic logs. You can revoke access or delete the stored Gmail data
        using the controls described below. These measures apply to the hosted
        sotto.email service; operators of self-hosted copies control their own
        security configuration.
      </p>
      <h2>When we use AI</h2>
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
      <h2>Limited use of your data</h2>
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
      <h2>Providers and retention</h2>
      <p className="text-muted-foreground">
        Google provides Gmail. Connections through Composio use its managed
        Google authorization: Composio stores the Google credentials and handles
        Gmail reads, label changes, and new-message notifications on our behalf.
        Gmail data passes through Composio; its project is configured not to
        store request and response log data. This setting does not guarantee
        zero retention of operational or security records. Existing direct
        Google connections continue to use Google until reconnected. Vercel
        hosts Sotto and its processing queue; Neon stores encrypted connections
        and application records; OpenAI receives the data needed for
        classification. These providers process information to deliver the
        service. We do not send message bodies to the queue or the payment
        system.
      </p>
      <p className="text-muted-foreground">
        We retain the connection until you disconnect or delete Gmail data. For
        Composio connections, Sotto stores an account identifier instead of a
        Google refresh token. Disconnecting also requests revocation and
        deletion at Composio; failed requests are retried during daily cleanup.
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
      <h2>Subscriptions and payments</h2>
      <p className="text-muted-foreground">
        When subscriptions are enabled, Stripe processes payments and receives
        your account email and workspace identifier. We do not send your
        messages to Stripe. Sotto stores subscription identifiers and status; it
        does not store your card details.
      </p>
      <h2>The Google permission we request</h2>
      <p className="text-muted-foreground">
        Direct Google connections request gmail.modify, which includes reading,
        modifying, and sending email, plus your basic profile (name and picture)
        to show who is signed in. A managed Composio connection may request full
        Gmail access, which also permits permanent deletion; the Google consent
        screen shows the permission being granted. Sotto only uses fixed
        operations for reading, labeling, and restoring messages. It does not
        implement sending, deleting, or marking messages as read.
      </p>
      <h2>Pausing or disconnecting</h2>
      <p className="text-muted-foreground">
        You can pause an account, disconnect it, or revoke access from your
        Google Account. Disconnecting stops processing and deletes its local
        credential or provider connection identifier, even if the provider does
        not respond to the revocation request. You can check or revoke that
        permission directly in{" "}
        <a
          href="https://myaccount.google.com/connections"
          className="underline underline-offset-4"
        >
          your Google Account connections
        </a>
        . Disconnecting does not delete emails, labels, or Sotto's decision
        history.
      </p>
      <p className="text-small text-muted-foreground">
        <strong>Delete Gmail data.</strong> In Accounts, this action asks you to
        confirm the address and removes that account's connection, credential,
        preferences, allowed senders, decisions, jobs, events, and AI usage
        records from the active database. It stops processing even if Google
        revocation fails. Emails and labels stay as they are in Gmail; deleting
        the history means moves can no longer be undone from Sotto. We retain
        the minimum identity linking your sign-in to your workspace, the
        deletion time to prevent reconnections started before the request, your
        workspace email, and plan data. Other accounts are not deleted.
        Reconnecting Google through the connection notice authorizes filtering
        again. This action does not request deletion of records that providers
        may retain under their own policies.
      </p>
      <p className="text-small text-muted-foreground">
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
      <p className="text-small text-muted-foreground">
        Last updated: September 11, 2026. Each installation's operator is
        responsible for its configuration and data processing.
      </p>
    </main>
  );
}
