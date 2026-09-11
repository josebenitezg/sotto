import { query, transaction } from "./db";
import { ComposioError, deleteComposioConnection } from "./composio";

export async function queueComposioCleanup(id: string) {
  await query(
    "INSERT INTO composio_cleanup(connection_id) VALUES($1) ON CONFLICT DO NOTHING",
    [id],
  );
}
export async function cleanupComposioConnections() {
  if (!process.env.COMPOSIO_API_KEY) return;
  await transaction(async (db) => {
    await db.query(`WITH expired AS (DELETE FROM composio_states WHERE expires_at<now() RETURNING connection_id)
      INSERT INTO composio_cleanup(connection_id) SELECT connection_id FROM expired ON CONFLICT DO NOTHING`);
  });
  const retired =
    await query(`SELECT c.connection_id FROM composio_cleanup c WHERE NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.composio_account_id=c.connection_id AND a.connected=true
  ) ORDER BY c.created_at LIMIT 10`);
  for (const row of retired) {
    try {
      await deleteComposioConnection(row.connection_id);
    } catch (error) {
      if (!(error instanceof ComposioError && error.status === 404)) continue;
    }
    await query("DELETE FROM composio_cleanup WHERE connection_id=$1", [
      row.connection_id,
    ]);
  }
}
