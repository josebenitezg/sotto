# Setup

## 1. Configuration

Copy `.env.example` to `.env.local`. Generate a 32-byte encryption key:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep it in `ENCRYPTION_KEY`, never in Git. Losing it makes stored Google credentials unreadable. Set `APP_URL` to the exact public HTTPS origin (HTTP is allowed only on localhost). Set `ALLOWED_GOOGLE_EMAILS` to an explicit comma-separated list of accounts that belong to this installation's single owner.

This allowlist is required even though the source code is public. Any allowed account signs in to the same owner's dashboard and can view all connected accounts. Do not list accounts belonging to independent users. Public multi-user hosting is not supported.

## 2. PostgreSQL

Use a dedicated database with a restricted application role. Configure `DATABASE_URL` and run `npm run db:migrate`. If your provider gives a transaction-pooled URL, also set `DATABASE_URL_UNPOOLED` to its direct connection URL; account advisory locks require a pinned session. Back up the database and encryption key separately. PostgreSQL must verify TLS when the connection crosses an untrusted network; follow the provider's certificate instructions rather than disabling verification.

For local development with Docker:

```sh
docker compose --env-file .env.local up -d db
npm run db:migrate
```

The database is exposed only on `127.0.0.1:5438` for this development path. Use a strong `POSTGRES_PASSWORD` and matching `DATABASE_URL`. The simple `sotto` password in the example is local development only.

## 3. Google OAuth

1. Create a dedicated Google Cloud project. Enable the Gmail API.
2. Configure Google Auth Platform branding and audience. Use **External** when connecting a consumer Gmail account as well as Workspace. Add your accounts as test users during development.
3. Create an OAuth client with application type **Web application**.
4. Add the redirect URI `http://localhost:3000/api/google/callback` for local testing, and your exact production equivalent when deployed. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Request `openid`, `email`, `profile` and `https://www.googleapis.com/auth/gmail.modify`.
6. Start Sotto and connect each allowed account separately. Grant offline Gmail access. Workspace administrators may need to allow the application.

External apps left in Google's **Testing** publishing state receive refresh tokens that expire after seven days for these scopes. Configure an appropriate production audience before unattended operation. Limited personal-use apps may qualify for a verification exception; public apps using restricted Gmail scopes have additional verification requirements. Check the current [Google OAuth guidance](https://developers.google.com/identity/protocols/oauth2#expiration), [verification exceptions](https://support.google.com/cloud/answer/13464323?hl=en) and [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

Do not reuse another application's OAuth client or copy its refresh tokens. Connecting Google in ChatGPT does not authorize or provision Sotto's own OAuth client.

## 4. Classifier

Choose `AI_PROVIDER=openai` with `OPENAI_API_KEY`, or `AI_PROVIDER=vercel` for Vercel AI Gateway. Gateway mode uses the deployment's OIDC identity; outside Vercel, provide `AI_GATEWAY_API_KEY` or a valid development OIDC token. No shared key from another application is needed. Set `OPENAI_MODEL` if desired; the default is `gpt-5-mini`. Use a model that supports the Responses API and strict JSON schema output. Verify model access and set a provider budget before running a real pilot.

Under **Preferencias**, describe what matters for each account in natural language. The AI receives these preferences and chooses keep, review or move from the message's meaning. Relationship protections still apply. No keyword list or confidence threshold decides whether a vendor pitch is cold.

Messages resolved by relationship protections are not sent to the model. Remaining messages include sender, recipient account, subject, account preferences and up to 16,000 characters of normalized text. Attachments are excluded and links are not opened. Confirm this data handling is acceptable for the account and organization.

## 5. Gmail push

1. Enable Google Cloud Pub/Sub in the same project as the Gmail API client.
2. Create a dedicated topic. Grant `gmail-api-push@system.gserviceaccount.com` Pub/Sub Publisher **on that topic only**.
3. Put the full `projects/PROJECT_ID/topics/TOPIC` name in `GOOGLE_PUBSUB_TOPIC`.
4. Create an authenticated push subscription targeting `https://YOUR_HOST/api/gmail/events`.
5. Choose a dedicated push service account. Set its exact email in `PUBSUB_SERVICE_ACCOUNT_EMAIL` and the configured OIDC audience in `PUBSUB_AUDIENCE`. Allow Pub/Sub to mint an ID token for that account using Google's documented permissions.
6. Start the worker or enable Vercel Queue processing below. Processing registers/renews each account's Gmail watch and persists incoming events before acknowledging them.

The endpoint validates the Google token, exact audience and service-account email before accepting a payload. Do not replace these checks with an unguessable URL. Notification IDs are not Gmail message IDs. Gmail notifications carry a history cursor, and several message changes may be batched behind one event. See [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push) and [authenticated push subscriptions](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).

Without a configured topic, the supervised worker polls at 15-minute intervals; the Vercel recovery cron runs daily. For near-real-time processing on Vercel, configure Gmail push. Cloud Run deployments require a worker execution model that continues outside requests; a default request-only web service is not sufficient.

### Vercel deployment

Link the repository to your own Vercel project and attach a dedicated PostgreSQL database. Set the production environment variables, including `QUEUE_DRIVER=vercel`, `DEMO_MODE=false`, your exact `APP_URL`, account allowlist and a random `CRON_SECRET`. Run the database migration before deploying. Keep an independent secure backup of `ENCRYPTION_KEY`; sensitive Vercel values cannot be recovered with an environment pull.

The included `vercel.json` configures a private Queue consumer in `iad1` and a daily recovery cron at 08:00 UTC. Each delivery processes a small batch and schedules continuation when needed. Deploy with Vercel Queues enabled on your account; verify an actual queue delivery, Google push and watch renewal before treating the installation as unattended. You do not need a separate process worker in this mode. The daily cron uses the `CRON_SECRET` bearer automatically and is compatible with a once-daily schedule.

To verify Queue delivery before connecting Gmail, call `GET /api/cron/reconcile?probe=queue` with the same `CRON_SECRET` bearer. It publishes an inert installation probe from the production deployment; check its completed delivery in Vercel logs. Do not pin a message published with a local development OIDC token to a production deployment: its acknowledgement uses a different environment namespace. Keep tokens out of logs and shared command history.

## 6. Review and activate

Keep `ENABLE_MAILBOX_WRITES=false`. Connect the work account first. The initial scan covers messages in Inbox from the last seven days. Review examples and add allowed senders. Validate false positives on examples not used to tune rules.

Once satisfied, set `ENABLE_MAILBOX_WRITES=true`, redeploy or restart the web and worker, and activate the filter for that account from **Cuentas**. The confirmation records that the sample was reviewed. Start with unsolicited sales only. Enabling an optional category changes future decisions; it does not replay prior decisions automatically.

For a manual move from review mode, the account must be connected, unpaused, and the global write gate must be enabled. All message changes are reversible; no bulk historical cleanup is performed.

## 7. Operate

For process deployments, supervise the worker and web separately. For Vercel, monitor Queue deliveries and the daily cron. Both modes renew watches, retry incomplete jobs with backoff and recover missed events. Check last-sync timestamps and visible account errors. **Sincronizar** queues a fresh sync and retries failed jobs; processing must be healthy for it to finish.

For full Docker deployment, use `docker compose --env-file .env.local up --build -d`. Set `DATABASE_URL` to use host `db` inside the containers; local host commands instead use `localhost:5438`. Configure a TLS proxy in front of the web service and keep PostgreSQL private. Monitor provider usage and persistent-disk capacity.

Disconnect removes the locally stored credential and attempts to stop/revoke Google access. You can also revoke it directly in your [Google Account](https://myaccount.google.com/connections). Historical decisions and Gmail labels are retained. Define your own retention and backup policy.
