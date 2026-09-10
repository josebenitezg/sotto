# Hosted billing

The MIT self-hosted app remains free: leave `BILLING_ENABLED=false`. Hosted billing is opt-in and is not enabled on sotto.email yet. See the [business plan](business-plan.md) for the proposed launch price and assumptions.

## Runtime configuration

Run `npm run db:migrate` before deploying this version. Migration 002 adds workspaces to existing accounts and sessions. Existing installations retain their internal workspace; new hosted signups get independent spaces with at most two connected Gmail accounts. Disconnected accounts preserve history without consuming a connected-account slot.

Configure these server-only values from the same Stripe environment:

- `STRIPE_MODE=test` for sandbox; `live` only for a separately approved paid launch.
- `STRIPE_SECRET_KEY`: a dedicated runtime key. The agent's MCP OAuth token must never become an application credential.
- `STRIPE_PRICE_ID`: an active USD monthly price. Its amount must match `PLAN_PRICE_CENTS` (900 by default).
- `STRIPE_WEBHOOK_SECRET`: the signature secret for `/api/stripe/webhook`.
- `STRIPE_PORTAL_CONFIGURATION_ID`: a dedicated portal with payment-method updates, invoice history and cancellation at period end. Disable quantity/product changes unless supported by the app.
- `TRIAL_REQUIRE_CARD=false`: three days without payment details. Stripe cancels the trial subscription when the trial ends without a payment method. The app stops processing but retains review, restore and disconnect access.
- `BILLING_ENABLED=true`: enforce entitlements for hosted workspaces.
- `CHECKOUT_ENABLED=true`: expose authenticated checkout only after Google and all billing credentials work.
- `PUBLIC_SIGNUP=true`: allow verified Google identities beyond the installation allowlist. Keep false until Gmail verification and a hosted-service pilot are complete.

Stripe events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.trial_will_end`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`.

## Access and retries

`/api/billing/checkout` derives the workspace from the signed-in session. It never accepts a client-supplied customer, price or trial duration. Each workspace owns a dedicated Stripe customer. Checkout attempts persist an idempotency key before provider calls; subsequent attempts reuse open sessions. Stripe subscription history prevents a new trial when a completion webhook was missed.

Signed webhook events trigger a fresh provider read under a workspace row lock. The stored event payload is not authoritative for entitlement, so an older event cannot restore expired access. Active subscriptions require a paid invoice and an unexpired billing period. Queued mailbox work checks access before starting, between jobs and before continuation. Trial expiry is enforced from its timestamp even when the ending webhook is delayed. The plan page can refresh state if a webhook delivery fails.

The public static Payment Link is a **sandbox demonstration only**. It is not used for application provisioning. Hosted users must enter Checkout from their authenticated plan page so subscriptions are bound to the correct workspace.

## Validation before launch

Automated tests cover cross-workspace reads and actions, linking and mailbox limits, exact trial expiry, duplicate/reordered events, failed queue delivery, unpaid invoices, signature tampering and Checkout retry recovery. They use synthetic data, an embedded PostgreSQL engine and a mocked Stripe API with the real Stripe signature verifier. Production locking, Google OAuth, Stripe test clocks and a complete sandbox browser checkout still need integration validation.

Before live billing, confirm the launch price, legal/operator details, tax setup, Gmail restricted-scope approval, a commercial hosting plan and observed variable cost. Do not activate a paid trial before the mailbox service works.
