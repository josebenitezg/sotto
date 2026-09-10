# Architecture

Sotto is a single-owner, multiple-account application. A web process serves the interface, handles OAuth and validates authenticated Pub/Sub deliveries. A separate, continuously running worker synchronizes Gmail and processes durable jobs in PostgreSQL.

```mermaid
flowchart LR
  Gmail -->|watch notification| PubSub
  PubSub -->|verified OIDC| Web
  Web -->|durable event| Postgres
  Postgres --> Worker
  Worker -->|history and message reads| Gmail
  Worker --> Rules
  Rules -->|unresolved text only| Classifier
  Classifier --> Policy
  Policy -->|allowed label changes| Gmail
```

## State and concurrency

`accounts` holds encrypted credentials, per-account preferences, the Gmail cursor, watch expiration and operating mode. `mailbox_events` is the durable webhook inbox. `jobs` has a unique `(account_id,message_id)` key. `decisions` stores metadata, classification, action state and the exact label effects needed to undo. `sender_rules`, `sessions` and `oauth_states` remain separate.

Every worker and user action that changes account/mail state acquires the same PostgreSQL session advisory lock for that account. Keep the lock connection pinned throughout the operation. Use direct PostgreSQL or session pooling: transaction-pooling proxies are incompatible with these session locks. One account's failure does not intentionally advance another account's cursor.

History pagination uses the original start cursor on every page. Only after all pages arrive does a transaction persist deduplicated jobs, update the cursor, and mark the event batch processed. A failed later page leaves the old cursor intact. On an expired history cursor, a bounded scan starts from the account's initial scan boundary and acquires a fresh cursor before listing messages.

The baseline `start_at` is seven days before first connection. A long-lived account may need to scan a large interval after a history reset; this is correctness-oriented but not optimized for very large mailboxes yet. No such scan causes an automatic historical cleanup. A future release can add chunked backfill checkpoints.

## Decision and action boundaries

1. Fetch a message; skip sent, draft, spam, trash or non-Inbox messages.
2. Apply explicit sender/domain rules, own-organization checks, stars and clear operational protections.
3. Check actual SENT messages in the thread and previous outgoing correspondence, rather than trusting a `Re:` subject.
4. Classify only unresolved text with a strict schema. No tool access is given to the model.
5. Keep uncertain/protected messages. Optional categories are off by default. A high model score is only a conservative heuristic.
6. Record the decision. Automatic mode affects eligible messages received after activation.
7. Before moving, reread the message and current rules, verify sender authentication and policy, and persist a `moving` intent.
8. Add the destination label and remove `INBOX` on that individual message. Persist `moved`. Never remove `UNREAD`.

A crash after Gmail succeeds but before the database update is recovered by checking the persisted intent against current labels. Restore has an analogous `restoring` state. Undo adds Inbox only if Sotto removed it and removes the Sotto label only if Sotto originally added it. Already-present labels and unrelated user changes are retained. Messages moved into Spam/Trash require direct Gmail handling instead of overriding that decision.

A restored decision is terminal for that message; duplicate events cannot rearchive it. New messages in the same thread get their own jobs. A new reply is never automatically trusted to inherit an older classification.

## Failure behavior

An unavailable classifier throws; it does not fabricate a keep/move result. Jobs retry with bounded backoff and eventually show a pending-processing error. Provider response bodies and tokens are not logged. The mailbox remains untouched if classification or context reads fail. Account errors are shown alongside last-sync timestamps.

Watch renewals do not overwrite the last processed history cursor. Polling provides recovery when notifications are delayed or dropped. The worker must actually be running; receiving webhooks alone cannot complete jobs. Pub/Sub ingestion acknowledges only after durable storage.

## Known limits

- No public multi-tenant account model or central hosted service.
- No calibration claim, no guarantee of catching every cold email, and no guarantee against all model false positives.
- Gmail has no conditional label-write transaction coordinated with the user's UI. Rereads narrow, but cannot eliminate, the race with a simultaneous manual change.
- No Gmail connection/worker health certification until tested with live OAuth and delivery on the deployment.
- No automatic unsubscribe, delete, sending, attachment processing, CRM enrichment or full historical cleanup.
- Policy changes do not retroactively reclassify old decisions in this release.
- The dashboard shows up to 200 recent decisions, not complete mailbox statistics. Decision metadata is retained until operator-managed deletion.

## Tests

Unit and SQL-backed tests cover protections, MIME handling, crypto binding, cursor pagination, rollback, uniqueness and action recovery using synthetic data. The SQL harness uses PGlite. Actual PostgreSQL advisory locks, concurrent worker processes and provider authentication need deployment integration tests.
