import { pool, query } from "./lib/server/db";
import { workAccount, AccountBusy } from "./lib/server/engine";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
console.log("Sotto worker started.");
while (!stopping) {
  try {
    const accounts =
      await query(`SELECT a.id FROM accounts a WHERE connected=true AND (
      last_sync IS NULL OR last_sync<now()-interval '15 minutes' OR last_watch<now()-interval '20 hours' OR
      EXISTS(SELECT 1 FROM mailbox_events e WHERE e.account_id=a.id AND processed_at IS NULL) OR
      EXISTS(SELECT 1 FROM jobs j WHERE j.account_id=a.id AND state IN ('pending','running') AND available_at<=now()) OR
      EXISTS(SELECT 1 FROM decisions d WHERE d.account_id=a.id AND state IN ('moving','restoring'))
    ) ORDER BY CASE WHEN name='Trabajo' THEN 0 ELSE 1 END,created_at`);
    for (const account of accounts) {
      if (stopping) break;
      try {
        await workAccount(account.id);
      } catch (error) {
        if (error instanceof AccountBusy) continue;
        await query(
          "UPDATE accounts SET last_error='No pudimos sincronizar. Revisá tu conexión con Google.' WHERE id=$1",
          [account.id],
        );
      }
    }
    await query("DELETE FROM sessions WHERE expires_at<now()");
    await query("DELETE FROM oauth_states WHERE expires_at<now()");
    await query(
      "DELETE FROM mailbox_events WHERE processed_at<now()-interval '7 days'",
    );
  } catch {
    console.error(
      "Worker cycle failed; retrying without exposing provider details.",
    );
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5000));
}
await pool().end();
