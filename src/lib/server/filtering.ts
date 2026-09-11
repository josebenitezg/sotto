import type { PoolClient } from "pg";
import { writesEnabled } from "./config";
import { classifierConfigured } from "./ai";
import { HttpError } from "./auth";

// Call inside a transaction while holding the mailbox's advisory lock.
// Activation and its durable work request must succeed together.
export async function startFiltering(
  db: Pick<PoolClient, "query">,
  accountId: string,
) {
  if (!writesEnabled(accountId) || !classifierConfigured())
    throw new HttpError(
      409,
      "Filtering is not available for this account yet.",
    );
  const {
    rows: [account],
  } = await db.query(
    `UPDATE accounts SET mode='automatic',
       auto_after=GREATEST(start_at,now()-interval '7 days'),
       automatic_authorized_at=now(),mode_changed_at=now(),history_id=NULL,last_error=NULL
     WHERE id=$1 AND connected=true AND mode<>'automatic' RETURNING id`,
    [accountId],
  );
  // Repeating an activation must not broaden its original scan boundary.
  if (!account) return;
  await db.query(
    `INSERT INTO jobs(account_id,message_id)
       SELECT account_id,message_id FROM decisions WHERE account_id=$1 AND state='suggested'
     ON CONFLICT(account_id,message_id) DO UPDATE
       SET state='pending',attempts=0,available_at=now(),last_error=NULL`,
    [accountId],
  );
  await db.query(
    `INSERT INTO mailbox_events(id,account_id,history_id)
     VALUES($1,$2,'0')`,
    [`activate:${crypto.randomUUID()}`, accountId],
  );
}
