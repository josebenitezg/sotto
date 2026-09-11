# Sotto

**A quieter inbox.** Open-source Gmail triage that puts unsolicited sales emails aside and leaves uncertain messages in your inbox.

Connect your work and personal Google accounts. The connection notice authorizes automatic filtering of cold outreach from the last seven days of Inbox and new incoming emails. Sotto labels messages instead of deleting them. Each move has a reason and an undo action.

## Status

Early implementation. Self-hosted installations support one owner with multiple accounts. An optional hosted mode isolates each person’s workspace and adds subscription billing. The interface is in English. It includes OAuth connection, AI classification with per-account preferences, Google Pub/Sub or Composio event ingestion, durable processing, review mode, label changes and undo.

Local checks use synthetic messages, mocked Gmail calls and an embedded PostgreSQL engine. They do **not** certify live Google OAuth, Pub/Sub delivery, real-mail classification accuracy or deployment reliability. Run a review pilot on your installation before enabling writes. Public signup and payments are disabled by default. Hosted billing and signup require the additional setup in [billing](docs/billing.md).

## Try the interface

Node.js 22.13+ is required.

```sh
npm ci
DEMO_MODE=true npm run dev
```

Open [the landing](http://localhost:3000) or [the demo workspace](http://localhost:3000/revision). Demo messages are fictional, controls only change local browser state, and refreshing resets the demo. No Google account or API key is needed.

## Run with Gmail

You need PostgreSQL, an OpenAI API key, and either a managed Composio Gmail connection or your own Google OAuth web client. See [Composio setup](docs/composio.md) for managed connections. Direct Google connections use Gmail API access and optional Pub/Sub for push delivery. OpenAI is used directly by default.

```sh
cp .env.example .env.local
# Fill in the settings described in docs/setup.md.
npm ci
npm run db:migrate
npm run dev
# In another terminal:
npm run worker
```

Both web and worker use the same dedicated PostgreSQL database. For production, use HTTPS. Choose a supervised worker process, or deploy to Vercel with `QUEUE_DRIVER=vercel` to process incoming events through Vercel Queues and recover missed events daily. The queue mode does not require `npm run worker`.

See [setup](docs/setup.md) for Google configuration and [architecture](docs/architecture.md) for failure recovery. A [Docker Compose](compose.yml) deployment is included; use a persistent database volume and a TLS reverse proxy for production. Container builds must be verified on your target platform.

## Conservative by default

- **Connect with Google** starts automatic filtering when AI and account write access are enabled. Accounts without write access remain in review mode.
- `ENABLE_MAILBOX_WRITES=false` is an independent, installation-wide gate.
- Automatic filtering requires an explicit connection/start action and the installation/account write gate. Legacy connections and in-flight OAuth attempts preserve their mode. Pause and undo remain available.
- Existing conversations, known recipients, starred messages, organization mail and clear operational notices are protected.
- AI explicitly chooses keep, review or move based on meaning and your preferences. Confidence is informational; sender authentication and enabled categories still constrain moves.
- Signup follow-ups and newsletters are separate, opt-in categories.
- Gmail reads stay unread. No send, delete, spam or unsubscribe operations are implemented.
- Messages go to `Sotto/Cold` or `Sotto/Reading`, remain searchable and can be restored.
- The initial scan covers the last seven days of Inbox, then continues with newly arriving messages. Reconnecting preserves existing decisions and history.

## Data and permissions

Direct Google connections request `gmail.modify`, which also grants sending capability. Composio managed connections may request full Gmail access, including permanent deletion. Sotto exposes only fixed reading and label operations; this is an application restriction, not a narrower Google permission guarantee. Review the actual consent screen.

Direct Google refresh tokens are encrypted in Sotto. With Composio, Google credentials are held by Composio and Sotto stores connection identifiers; Gmail data passes through that provider. The database contains account details, sender/subject metadata and decision history, but no full message bodies. Selected email text and account preferences are sent directly to OpenAI with `store:false`; this does not guarantee zero provider retention. See [security](SECURITY.md) and the installation's privacy page before connecting work email.

## Development

```sh
npm run typecheck
npm test
npm run build
```

Tests cover deterministic protections, opt-in categories, MIME normalization, account-bound encryption, pagination, duplicate events, expired history recovery, crash recovery, sender exceptions and message-level undo. PostgreSQL advisory locks and real provider integrations require separate integration validation.

Built with Next.js, React, PostgreSQL, Google APIs and shadcn/Radix primitives. Read [DESIGN.md](DESIGN.md) before changing the interface. Contributions are welcome; use fictional `.example` addresses in fixtures and screenshots.

## License

[MIT](LICENSE). shadcn/ui components are used under their MIT license; Geist and Instrument Serif are used under their bundled SIL Open Font Licenses.
