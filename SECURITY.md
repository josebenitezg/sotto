# Security

Sotto is an early, single-owner, self-hosted application. Do not expose an installation before configuring its exact Google-account allowlist, HTTPS, database access and encryption key. Publishing this repository does not publish an inbox.

Report vulnerabilities privately using GitHub's private vulnerability reporting when enabled. Do not put tokens, mailbox data or exploit payloads containing personal information in public issues.

Boundaries: OAuth credentials are encrypted using AES-256-GCM with the account identity as associated data; sessions and OAuth states use random opaque values and hashed database storage. OAuth requires PKCE, a browser-bound, single-use state, ID-token verification and an explicit owner account allowlist. All application mutations require a session and an exact Origin check. Pub/Sub requires a verified Google ID token and exact audience/service-account matching.

The classifier is data-only. It has no tools or direct mutation authority. Protected messages stay in Gmail. A model score is not a calibrated probability, and prompt instructions alone are not an absolute defense against adversarial email. Evaluate real examples before enabling automatic mode.

The `gmail.modify` scope includes send capability even though Sotto exposes no send/delete function. A compromised server or credential still has that broader Google-granted permission. Protect the server, encryption key and database accordingly.

Sotto stores decision metadata, including sender and subject. Protect backups and define a retention policy. Never commit `.env` files or real email examples. Do not put mailbox content in application logs or public demo data. Use a dedicated Google project and separate database.

This release has not undergone an independent security assessment. Public multi-user hosting and arbitrary account signups are outside its scope.
