# Learning from corrections

In Inbox → Kept, open an email and choose **Mark as cold**. Sotto adds
`Sotto/Cold`, removes `INBOX`, and preserves read state. The original AI verdict
stays in `decisions`; the explicit owner correction lives in `cold_feedback`.
This is a deliberate, message-level owner action and can override an AI keep or
review. It never creates a sender block or changes automatic safety checks.

The worker then asks the configured OpenAI model for a narrow description of
the outreach's purpose, offer and requested action. No bodies are persisted.
Extraction has no tools, treats email as untrusted data, requests no identifiers,
validates structured output and retries up to three times. Failure does not undo
the Gmail move; the email's detail shows learning status and a retry button.

Future classifications receive the most recent 20 successfully learned,
still-moved corrections from the **same Gmail account**, deduplicated and capped
at 6,000 characters. These examples inform semantic classification, including
which otherwise potentially useful outreach the owner finds unwanted. They do
not override conversation history, allowlists, starred mail, protected domains,
operational/security protections or disabled reading categories. New corrections
do not automatically reprocess old Kept emails.

**Return to inbox** removes the correction before reversing the Gmail move,
and retries remain reversible. It removes only labels Sotto itself added. Account
deletion cascades to all feedback. `GET /api/memory?accountId=…` downloads the
currently used context as private `memory.md`, with workspace ownership enforced.
In **Settings → Memory**, choose the Gmail account and use **Open memory** to
view that same Markdown in a live panel, or **Download memory.md** to save it.
The open panel refreshes every five seconds and when the tab regains focus.
Closing it stops the polling; switching accounts discards the previous view.
Each new AI classification reads the account's current memory from the database;
there is no cross-message memory cache and the UI polling does not call the LLM.
This is durable database-backed inference context, not a server filesystem file,
public GitHub data, fine-tuning, or shared model training.

Implementation: `src/lib/server/cold-memory.ts` (extraction/context),
`classifier.ts` (classification prompt), `engine.ts` (manual movement/undo),
`db/011_cold_feedback.sql` (storage). Run `npm run db:migrate` **before deploying**.
