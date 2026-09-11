# Hosted billing

The MIT self-hosted app needs no Sotto subscription: leave `BILLING_ENABLED=false`. Hosted billing is opt-in. See the [business plan](business-plan.md) for $5 Solo / $9 Duo, the trial flow and dated cost assumptions.

## Runtime configuration

Run database migrations before deploying. Migration 007 adds `billing_plan`, durable checkout-plan recovery and technical AI usage records. Migration 008 adds per-period mail allowances and durable scan continuation. Existing subscriptions map to Duo; new hosted workspaces start with the Solo mailbox limit until Stripe verifies another plan. Internal installations keep their existing access. Disconnected accounts retain history without occupying a connected slot.

Configure server-only values from one Stripe environment:

- `STRIPE_MODE=test` for sandbox; `live` for production.
- `STRIPE_SECRET_KEY`: a dedicated restricted runtime key. The agent's MCP OAuth token must never become an application credential. Runtime needs Customers, Checkout Sessions and Customer Portal write access, plus Prices, Products, Subscriptions and Invoices read access.
- `STRIPE_PRICE_SOLO_ID`: active recurring USD $5/month price.
- `STRIPE_PRICE_DUO_ID`: active recurring USD $9/month price. The server checks amount and billing interval; clients can select only `solo` or `duo`, not supply a price.
- `STRIPE_WEBHOOK_SECRET`: signature secret for `/api/stripe/webhook`.
- `STRIPE_PORTAL_CONFIGURATION_ID`: a dedicated Sotto portal with payment-method updates, invoice history, cancellation at period end and plan changes restricted to Solo/Duo with fixed quantity 1. Configure and verify proration behavior before allowing changes. Do not change a shared account-wide portal configuration.
- `TRIAL_REQUIRE_CARD=true`: require a card for the three-day trial, followed by monthly billing unless canceled. The optional `false` setting supports no-card trials on self-managed installations; missing payment method ends the trial by cancellation.
- `BILLING_ENABLED=true`: enforce hosted entitlements.
- `COMPOSIO_NOTIFICATION_MODE=poll`: use scheduled history reconciliation for non-internal hosted accounts and remove their managed per-message triggers. Internal pilot accounts keep their existing notifications.
- `COMPOSIO_POLLING_READY=true`: set only after deploying and verifying `/api/cron/poll` on a `*/30 * * * *` commercial scheduler. The route requires `CRON_SECRET` and `QUEUE_DRIVER=vercel`. This flag gates checkout; it does not install a schedule. The repository currently retains only the daily recovery schedule so it can deploy before the commercial hosting upgrade.
- `CHECKOUT_ENABLED=true`: expose checkout only when Gmail, runtime permissions, webhook and the portal have passed integration validation.
- `PUBLIC_SIGNUP=true`: accept verified Google identities beyond the pilot email allowlist. Public launch also needs installation-wide mailbox-write opt-in; leaving `MAILBOX_WRITE_ACCOUNT_IDS` restricted to pilot accounts would prevent new subscribers from receiving filtering. Remove that restriction only for the authorized launch after entitlement checks are verified. An empty value fails closed; it is not equivalent to an unset restriction.

Stripe events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.trial_will_end`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`.

## Trial, limits and billing access

The trial starts after authenticated Checkout completion, not at signup. One trial per workspace; Stripe subscription history also prevents reuse after a missed webhook. Completed trials cannot be restarted by reconnecting Gmail or changing plans. Returning subscribers pay immediately, as displayed by Stripe.

Solo permits one connected mailbox; Duo permits two. Users should disconnect the second mailbox before downgrading to Solo. If a downgrade occurs through Stripe with two still connected, processing pauses until the user disconnects one or upgrades. History and Undo remain available. The pricing page explains this state; the app never silently disconnects or deletes an account.

`/api/billing/checkout` derives the workspace from the session. It accepts only a plan ID and never trusts a client-supplied customer, price or trial duration. Every workspace has its own Stripe customer. Checkout attempts persist their idempotency key and selected plan before provider calls. Open checkouts are reused; switching plans expires the old session. A provider success followed by a database failure can be recovered without accidentally reusing the same key with a different plan.

Signed events cause a fresh Stripe read under a workspace row lock. The incoming event's subscription snapshot is not used to grant access, so delayed events cannot replay an obsolete trial. Paid access requires an active subscription, a paid invoice and an unexpired period. Workers check entitlements before processing and between jobs. Trial expiry is enforced from its deadline even if the ending webhook is late. Stripe payment failure pauses processing. Cancellation keeps access until the displayed current trial/paid-period end.

Users can open the portal to change payment details, see invoices or cancel, and refresh billing state if delivery was delayed. Pausing filtering and disconnecting Gmail do not cancel billing. Read, restore and disconnect remain possible without paid access.

Static Payment Links are not used for hosted provisioning: authenticated Checkout binds the subscription to the workspace. Old test demonstration links must not be published as production signup links.

## Usage measurement

The direct OpenAI classifier records model, account ID, input/cached-input/output tokens in `ai_usage`. It records reported usage even for incomplete responses, without persisting email content in the usage table. Missing or invalid provider usage is skipped; telemetry failures do not interrupt mailbox processing. This measures future calls, not historical usage. See the business plan for the pricing formula and Composio costs that token measurement alone does not capture.

Solo includes 250 checked emails per monthly billing period (50 during the trial); Duo includes 500 shared across both accounts (100 during the trial). Checking reserves a slot before provider reads. Kept and moved emails, including recent cleanup, count. Retries and Undo do not count again. New work pauses at the cap without an overage charge. Existing reservations can finish. The UI shows usage and reset time.

Quota updates share a workspace row lock across accounts. A trial and each Stripe monthly billing period have distinct usage buckets; replay, reconnect and plan changes preserve usage. Account deletion removes checked-message IDs but retains the aggregate count until workspace deletion. There is no rollover. A new unpaid period grants no processing until Stripe confirms payment. Hosted scans persist one page at a time and drain pending work before another history read. At quota, the worker stops new reads and avoids a queue continuation loop.

Free Composio allowances are shared across the installation. The mail cap bounds per-customer processing, not the global number of customers. Monitor capacity and upgrade the provider plan before that shared limit is reached.

## Verification and deployment status

Updated September 11, 2026:

- Live Solo ($5) and Duo ($9) products/prices have been created and read back in Perception Technologies Inc. No customer has been charged by this setup.
- A dedicated sandbox portal permits Solo/Duo changes, fixed quantity 1, prorated invoices, payment updates and period-end cancellation.
- A dedicated live restricted-key form and a commercial Vercel upgrade quote are prepared, pending the founder's confirmations. Live portal, runtime environment and signed webhook setup are incomplete.
- Test runtime settings are prepared on production with checkout/public signup closed. The half-hour scheduler remains gated off until commercial hosting is active. Existing pilot accounts keep internal access.

Automated tests use synthetic records, embedded PostgreSQL and a mocked Stripe API with the real Stripe signature verifier. Coverage includes workspace isolation, Solo/Duo limits, price validation, exact trial expiry, unpaid states, duplicate/reordered events, failed queue publication, signature tampering and checkout retry recovery. These tests do not establish that the live key, portal, Google flow or Stripe deliveries work.

The September 11 sandbox browser run used a synthetic customer, Stripe test cards and a Test Clock. It verified card-required Checkout with the exact 259,200-second trial, $0 initial invoice, $5 first charge, Solo-to-Duo change with $3.47 proration and no duplicate subscription, and the next $9 monthly renewal. A failing test card produced an unpaid $9 invoice and `past_due`; the application denied new processing against that real provider state. Updating the card through the portal recovered that invoice and application access. Period-end cancellation has been requested; terminal cancellation and signed deployed delivery are verified separately before release.

`tests/stripe-sandbox.integration.test.ts` is opt-in and never runs real API calls in ordinary CI. It uses real Stripe test data with an isolated synthetic PostgreSQL database and a paused mailbox without Gmail credentials. Supply a test-only key, both test price IDs and an ignored `private/stripe-sandbox-run.json` containing `workspaceId`, `customer`, `subscription` and a dedicated `portal` configuration. These resources must have matching Sotto metadata. Run with `STRIPE_INTEGRATION=true`; set `STRIPE_EXPECT_STATUS=past_due` or `canceled` for those lifecycle stages. Never use a live key or a real customer for these tests.
