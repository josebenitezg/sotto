# Sotto

**A quieter inbox.** Open-source Gmail triage that puts unsolicited sales emails aside and leaves uncertain messages in your inbox.

Connect your work and personal Google accounts, review the proposed decisions, then choose when to enable automatic filtering. Sotto labels messages instead of deleting them. Each move has a reason and an undo action.

## Status

Early implementation, intended for **one owner with multiple accounts** per installation. The interface is in Spanish. It includes OAuth connection, conservative classification, Pub/Sub event ingestion, a durable worker, per-account rules, review mode, label changes and undo.

Local checks use synthetic messages, mocked Gmail calls and an embedded PostgreSQL engine. They do **not** certify live Google OAuth, Pub/Sub delivery, real-mail classification accuracy or deployment reliability. Run a review pilot on your installation before enabling writes. There is no hosted Sotto service or public signup.

## Try the interface

Node.js 22.13+ is required.

```sh
npm ci
DEMO_MODE=true npm run dev
```

Open [localhost:3000](http://localhost:3000). Demo messages are fictional, controls only change local browser state, and refreshing resets the demo. No Google account or API key is needed.

## Run with Gmail

You need PostgreSQL, a Google OAuth web client, Gmail API access and an OpenAI API key. Pub/Sub is optional for a polling pilot and required for push delivery.

```sh
cp .env.example .env.local
# Fill in the settings described in docs/setup.md.
npm ci
npm run db:migrate
npm run dev
# In another terminal:
npm run worker
```

Both web and worker use the same dedicated PostgreSQL database. For production, use HTTPS and run the worker as a supervised, continuously running process. Do not rely on work continuing after a serverless HTTP response.

See [setup](docs/setup.md) for Google configuration and [architecture](docs/architecture.md) for failure recovery. A [Docker Compose](compose.yml) deployment is included; use a persistent database volume and a TLS reverse proxy for production. Container builds must be verified on your target platform.

## Conservative by default

- New accounts start in **review mode**. Read the proposed decisions first.
- `ENABLE_MAILBOX_WRITES=false` is an independent, installation-wide gate.
- Automatic mode requires a reviewed sample and an explicitly enabled write gate.
- Existing conversations, known recipients, starred messages, organization mail and clear operational notices are protected.
- A high score alone is insufficient; the sender must pass the authentication check and the category must be enabled.
- Signup follow-ups and newsletters are separate, opt-in categories.
- Gmail reads stay unread. No send, delete, spam or unsubscribe operations are implemented.
- Messages go to `Sotto/Cold` or `Sotto/Lectura`, remain searchable and can be restored.
- Automatic activation applies to newly arriving messages. It does not bulk-clean your old inbox.

## Data and permissions

Google's required `gmail.modify` scope also grants sending capability. Sotto does not implement sending, but this is a limitation of the granted scope, not a narrower permission guarantee.

Credentials are encrypted at rest. The database contains account details, sender/subject metadata and decision history, but no full message bodies. Selected email text is sent to the configured OpenAI API with `store:false`; this does not guarantee zero provider retention. See [security](SECURITY.md) and the installation's privacy page before connecting work email.

## Development

```sh
npm run typecheck
npm test
npm run build
```

Tests cover deterministic protections, opt-in categories, MIME normalization, account-bound encryption, pagination, duplicate events, expired history recovery, crash recovery, sender exceptions and message-level undo. PostgreSQL advisory locks and real provider integrations require separate integration validation.

Built with Next.js, React, PostgreSQL, Google APIs and shadcn/Radix primitives. Read [DESIGN.md](DESIGN.md) before changing the interface. Contributions are welcome; use fictional `.example` addresses in fixtures and screenshots.

## License

[MIT](LICENSE). shadcn/ui components are used under their MIT license; Geist is used under its bundled SIL Open Font License.
