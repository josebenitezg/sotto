# Contributing

Start with an issue describing the behavior you want to improve. Small pull requests are easier to review.

1. Read `DESIGN.md`, `SECURITY.md` and `docs/architecture.md`.
2. Use synthetic email fixtures only (`.example` addresses).
3. Run `npm run check` before opening a pull request.
4. For Gmail behavior changes, cover retries, false-positive protections, account isolation and undo. UI-only changes need a desktop/mobile visual check and keyboard verification.

Keep provider credentials outside the classifier, preserve read/unread state, and fail open: uncertainty must leave a message in the inbox. Don't add automatic deletion, unsubscribe or sending as part of triage.
