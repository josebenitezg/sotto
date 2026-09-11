import Link from "next/link";
export const metadata = { title: "Subscription terms · Sotto" };
export default function TermsPage() {
  return (
    <main
      id="content"
      className="mx-auto max-w-[680px] space-y-6 px-6 py-16 text-sm leading-6"
    >
      <h1 className="text-2xl font-semibold">Subscription terms</h1>
      <p>
        Sotto is operated by Jose Maria Benitez Genes under the Sotto name.
        Contact{" "}
        <a className="underline" href="mailto:support@sotto.email">
          support@sotto.email
        </a>{" "}
        for support, billing questions or account deletion.
      </p>
      <h2 className="text-lg font-medium">Your plan and free trial</h2>
      <p>
        Solo costs US$5 per month for one connected Gmail account. Duo costs
        US$9 per month for two. Enterprise pricing is agreed separately. The
        hosted service and the MIT-licensed self-hosted software are separate;
        self-hosting does not require a Sotto subscription.
      </p>
      <p>
        A new workspace may start one 3-day trial after connecting Gmail and
        completing Stripe Checkout. When a card is required, Checkout displays
        the first charge date and recurring price before you subscribe. Cancel
        before the trial ends to avoid that charge. Reconnecting Gmail or
        changing plans does not restart your trial.
      </p>
      <h2 className="text-lg font-medium">Included emails</h2>
      <p>
        Solo includes 250 checked emails per monthly billing period; Duo
        includes 500 shared across two connected accounts. The 3-day trial
        includes 50 emails on Solo or 100 on Duo. Recent inbox cleanup and new
        messages both count, whether kept or moved. An email uses one slot when
        Sotto first begins checking it; retries and Undo do not consume another
        slot. Unused allowance does not roll over. Reconnecting or changing
        plans does not reset usage.
      </p>
      <p>
        At the limit, new filtering pauses with no overage charge. Messages
        remain in Gmail, and existing history and Undo stay available. A paid
        renewal starts the next allowance. Trial allowance renews only when the
        paid subscription starts successfully. Hosted plans check for new mail
        every 30 minutes while access and allowance are available.
      </p>
      <h2 className="text-lg font-medium">Renewal and cancellation</h2>
      <p>
        Subscriptions renew monthly until canceled. Open Pricing and choose
        Manage subscription to update payment details, view invoices, change
        your plan or cancel through Stripe. Stripe shows any adjustment and its
        timing before you confirm a plan change. Disconnect your extra Gmail
        account before changing from Duo to Solo.
      </p>
      <p>
        Cancellation takes effect at the end of the current trial or paid
        period, as shown in Stripe. Disconnecting Gmail or pausing filtering
        does not cancel a subscription. If you request deletion of your Sotto
        data, cancel your subscription as well to stop renewals. Contact support
        if you need help or believe a charge is incorrect. These terms do not
        limit rights that applicable law provides.
      </p>
      <h2 className="text-lg font-medium">How filtering works</h2>
      <p>
        Sotto uses AI to identify unwanted email and can make mistakes. Review
        the Sotto labels in Gmail and use Undo when needed. Connecting with the
        filtering option authorizes processing of recent inbox messages and
        future messages. Messages stay in Gmail; Sotto does not send replies or
        permanently delete your mail.
      </p>
      <p>
        When trial or paid access ends, Sotto pauses new processing. You can
        still review your history, return messages to your inbox, and
        disconnect. Service depends on continued Gmail permission and the
        availability of Google, Composio, OpenAI and our hosting providers.
      </p>
      <h2 className="text-lg font-medium">Privacy and acceptable use</h2>
      <p>
        Only connect accounts you are authorized to use. Do not use Sotto to
        access another person’s data without permission, bypass access controls
        or interfere with the service. Read the{" "}
        <Link className="underline" href="/privacy">
          Privacy Policy
        </Link>{" "}
        for data handling and deletion details.
      </p>
    </main>
  );
}
