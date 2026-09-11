# Sotto business plan

Updated September 11, 2026. Provider prices below were checked on this date. Usage and conversion scenarios are assumptions, not measured results.

## Product and offer

Sotto identifies unsolicited sales email with AI, moves it out of the inbox into Gmail labels, explains the decision and lets the user undo it. The first audience is founders and operators who receive frequent commercial outreach. Keep uncertain messages in the inbox; do not advertise an unmeasured accuracy rate or time saving.

| Plan        |         Monthly price |                       Connected Gmail accounts |
| ----------- | --------------------: | ---------------------------------------------: |
| Solo        |                  US$5 |                                              1 |
| Duo         |                  US$9 |                                              2 |
| Enterprise  |       Contact support |                              Agreed separately |
| Self-hosted | No Sotto subscription | Operator supplies infrastructure and providers |

The launch will use the dedicated Sotto Stripe account, operated by Jose Maria Benitez Genes under the Sotto name. The founder selected this arrangement on September 11, replacing the earlier Perception Technologies Inc. setup. Products previously created in Perception are not the new launch destination. The Sotto account is activated. The live runtime, deployed Solo/Duo Checkouts and customer portal have passed non-charging verification. Public signup and filtering for entitled users were opened with explicit founder authorization on September 11. The founder chose to retain the current hosting and 15-minute Composio triggers for this release. No unlimited-processing commitment is made. The MIT software remains open source; subscriptions pay for the hosted service.

## Included usage and delivery

Solo includes 250 checked emails per monthly billing period and a 50-email trial. Duo includes 500 shared across its two accounts and a 100-email trial. The founder authorized a temporary usage limit on September 11. There are no overage charges or rollover. A slot is reserved when checking begins; retries and Undo do not consume another. Recent cleanup and future messages share the allowance. Reconnecting, deleting a Gmail connection or switching plans does not reset the aggregate counter.

The current release retains Composio-managed Inbox triggers at a 15-minute polling interval, with daily Vercel reconciliation for recovery. This interval is configured in Composio, not as a Vercel cron. Delivery is not instantaneous or a guaranteed deadline. The proposed 30-minute application polling alternative is deferred; no external scheduler was installed. Managed OAuth, API-call and delivered-trigger-event charges still apply.

Implementation reads one history/backfill page at a time, stores continuation, drains queued work before reading again, and stops new reads and classification at quota. Monthly quota is keyed to the subscription's Stripe billing period, with a separate trial window. A verified trigger configuration and signed webhook are required before checkout opens.

Using the trigger-based assumptions below, Solo at 250 checked new messages contributes about $2.145–$2.395 after standard Stripe fees and variable service costs. Duo at 500 total contributes about $3.626–$4.126. These are examples, not measured margins: incoming trigger events can exceed checked messages, especially after the processing allowance is exhausted. The quota caps classification and Gmail processing; it does not cap Composio's delivered-event bill. Keep provider usage under observation before scaling. No paid infrastructure upgrade is included in the current configuration.

Next cost work: measure actual token usage, batch Gmail reads where supported, cache repeated metadata within a worker batch, and revisit volume/provider pricing. A future direct Google integration would remove Composio's intermediary fees but still requires applicable Google verification and security review. Do not promise that another auth provider automatically removes those requirements.

The private global configuration supports `full_access_emails` for operator-selected complimentary users. These workspace owners bypass Stripe and Sotto mail/account caps while listed. Revocation restores their existing billing state and usage without a new trial. These users still incur provider costs, which must be included alongside pilot and paid usage in the economics.

## Three-day trial

1. Connect Gmail with the data-use notice and filtering consent.
2. Select Solo or Duo and complete Stripe Checkout with a card. Only Checkout completion starts the three-day trial; visiting the site or connecting alone does not.
3. The server verifies the subscription with Stripe and starts processing automatically. Duo then permits a second connected account.
4. Display the exact trial deadline and monthly renewal price. Cancel before that deadline to avoid the first charge; otherwise Stripe charges the selected monthly price.
5. One trial per workspace, including reconnects and plan changes. A returning subscriber whose trial was used pays immediately; Checkout shows this before confirmation.
6. Trial expiry or failed payment stops new processing. History, Undo and disconnect remain accessible. Pausing filtering or disconnecting Gmail does not cancel a subscription; cancellation is through the Stripe portal.

## Unit economics

### Payments

At published standard US domestic-card rates, Stripe Payments is 2.9% + US$0.30 and Billing adds 0.7%. The account's effective contract rates have not been independently verified. International cards, FX, tax, disputes and refunds can add cost. [Stripe pricing](https://stripe.com/pricing).

| Per paid month                 |   Solo |    Duo |
| ------------------------------ | -----: | -----: |
| Revenue                        |  $5.00 |  $9.00 |
| Payments + Billing estimate    | $0.480 | $0.624 |
| Available before service costs | $4.520 | $8.376 |

### OpenAI

The current direct OpenAI classifier uses `gpt-5-mini`: $0.25/million input tokens, $0.025/million cached input tokens and $2/million output tokens. Output includes reasoning tokens. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-5-mini).

An illustrative classification with 2,000 uncached input and 500 output tokens costs $0.0015, or $1.50 per 1,000 classifications. This is not an observed average. Long messages, reasoning and retries change it. The new `ai_usage` records contain account ID, model and provider-reported token counts, without message content. Historic calls were not measured this way. Incomplete responses that report usage are recorded too.

Compute cost from measured tokens as:

`(input - cached) * 0.25 / 1e6 + cached * 0.025 / 1e6 + output * 2 / 1e6`

### Composio

The live workspace is on Hobby. Its managed OAuth subset includes 20,000 tool calls and 10,000 delivered trigger events per month within the larger Hobby allowances; the headline tool-call quota is not all available for managed OAuth. Hobby stops service at the relevant cap rather than automatically providing unlimited paid capacity.

Published managed OAuth overage on paid plans is $0.0005/tool call and $0.005/delivered trigger event, with connection charges after included connections. Direct execution outside sessions has an additional $0.0001/call after its first 10,000 free calls; proxy execution adds $0.0002/call after its first 1,000 free calls. Pro is $29/month with $29 of usage credit; do not count that credit and the same covered usage twice. Zero-data-retention options are separate paid features and are not assumed here. [Composio pricing](https://composio.dev/pricing).

The current implementation uses managed triggers for new inbox messages, native tools, raw-message/thread proxy reads, sent-history checks, labeling and reconciliation. **1,000 new messages can cost $5 in trigger events alone after the free quota**, before tool calls, AI or hosting. Changing trigger polling frequency does not change this per-delivered-event charge.

Illustrative steady-state sensitivity beyond free allowances, assuming each analyzed new message produces one event, $2–$3 of aggregate tool costs per 1,000 messages and the AI example above:

| Analyzed new messages per month, per mailbox | Events | Estimated tools | Illustrative AI | Total variable service cost |
| -------------------------------------------- | -----: | --------------: | --------------: | --------------------------: |
| 250                                          |  $1.25 |     $0.50–$0.75 |          $0.375 |               $2.125–$2.375 |
| 500                                          |  $2.50 |     $1.00–$1.50 |          $0.750 |               $4.250–$4.750 |
| 1,000                                        |  $5.00 |     $2.00–$3.00 |          $1.500 |               $8.500–$9.500 |

Tool costs in this table are assumptions to validate, not provider measurements. They omit fixed polling overhead, initial historical cleanup, retries beyond the assumed calls, support and hosting. Some protected mail avoids AI, but still incurs trigger costs. A monthly AI quota alone cannot cap trigger-event costs if triggers keep delivering after the quota is exhausted.

At 1,000 messages, Solo loses money before hosting. With two similarly busy mailboxes Duo also loses money. At 500 per mailbox there is little or no contribution left. Free quotas improve initial cash cost but do not fix the scaled margin.

The selected launch offer uses 250/500 checked emails with these managed triggers. Polling savings are a future alternative and are not included in current margins.

### Hosting and other costs

Vercel Hobby is for personal, non-commercial use. Paid Sotto needs commercial hosting. Pro starts at $20/month with $20 of usage credit. [Hobby terms](https://vercel.com/docs/plans/hobby), [Pro pricing](https://vercel.com/docs/plans/pro-plan).

Check the team's actual upgrade quote before purchase: existing add-ons can make it higher than the $20 base price. Commercial hosting has not yet been activated for this launch. Usage beyond included allowances is additional; the base price is not an all-in hosting cap. Database, queues, domain renewal, monitoring, support and tax are separate or depend on their own free allowances and actual consumption.

Include the provider minimum when modeling paid infrastructure. For a possible paid infrastructure configuration, a simplified Solo-only model is `profit = 5N - 0.480N - 0.375N - 30 - max(29, C(N))`, where `N` is paying Solo subscribers and `C(N)` is total billable Composio usage after free allowances. The $30 hosting figure reflects the team's quoted upgrade with an existing add-on; verify the quote before purchase. The $29 Composio minimum includes usage credit, so usage covered by that credit is not added again.

While billable Composio usage remains within that credit, the example reaches break-even at `ceil(59 / 4.145) = 15` paying Solo subscribers. This is a narrow sensitivity estimate, not a forecast: it excludes trial acquisition cost, the existing pilot's usage, support, taxes, infrastructure overages and any additional services. Beyond the credit, use measured provider usage rather than applying this fixed-cost shortcut.

A trial costing $0.20 with 10% paid conversion adds $2 in acquisition cost per new paying customer. At 5% it adds $4. These are assumptions. Initial history and trial abuse must be measured and bounded before scaling.

## Launch and validation

- Complete dedicated live runtime credentials, a Sotto-only billing portal and signed webhook. Retain closed checkout until validation.
- Verify a sandbox browser checkout and subscription lifecycle, then production readiness and event delivery. Automated mocked tests do not replace this.
- Keep the existing 15-minute Composio trigger configuration and daily reconciliation; verify signed delivery and provider capacity. The founder deferred scheduling and hosting changes. Keep current pilot mailboxes working independently of hosted billing.
- Open public signup and mailbox writes together with verified entitlements; the old pilot write allowlist would otherwise prevent new paying users from receiving the promised service.
- Validate Gmail connection through Composio for a new user, first historical processing, future mail, disconnect and Undo. Confirm applicable provider production requirements rather than describing the underlying Google app as verified without evidence.
- Publish accurate terms, privacy and processor disclosures, identifying Jose Maria Benitez Genes as the operator of Sotto and support@sotto.email as its support contact.

Start with 10–20 users and measure connection success, time to first useful decision, trial-to-paid conversion, monthly retention, restores, support burden, token counts and provider calls/events. Do not buy acquisition traffic or make claims of unlimited usage before those economics are understood.
