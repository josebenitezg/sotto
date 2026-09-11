import { randomUUID } from "node:crypto";
import { hosted, writesEnabled } from "./config";
import { classifierConfigured } from "./ai";
import { startFiltering } from "./filtering";
import { transaction } from "./db";
import { HttpError } from "./auth";
import { seal } from "./crypto";
import type { ComposioConnection } from "./composio";

// A verified Google identity can sign in to its existing workspace. Linking a
// second inbox requires a browser-bound OAuth intent from that workspace.
export async function connectIdentity(
  identity: { sub: string; email: string },
  refreshToken: string | undefined,
  linkedWorkspace: string | null,
  authorizationStartedAt?: Date | string,
  filteringRequested = false,
  composio?: ComposioConnection,
) {
  return transaction(async (db) => {
    // Same key/order as mailbox actions and workers. A reconnect must not
    // replace credentials while deletion is purging data or revoking access.
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `sotto:${identity.sub}`,
    ]);
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `identity:${identity.sub}`,
    ]);
    const {
      rows: [access],
    } = await db.query(
      "SELECT workspace_id,gmail_deleted_at FROM workspace_identities WHERE id=$1",
      [identity.sub],
    );
    const {
      rows: [existing],
    } = await db.query(
      "SELECT workspace_id,token_cipher,connected,mode_changed_at,mail_provider,composio_account_id FROM accounts WHERE id=$1",
      [identity.sub],
    );
    if (
      (linkedWorkspace &&
        (access?.workspace_id || existing?.workspace_id) &&
        (access?.workspace_id || existing?.workspace_id) !== linkedWorkspace) ||
      (access && existing && access.workspace_id !== existing.workspace_id)
    )
      throw new HttpError(
        409,
        "That account already belongs to another Sotto workspace.",
      );
    if (
      access?.gmail_deleted_at &&
      (!authorizationStartedAt ||
        !Number.isFinite(new Date(authorizationStartedAt).getTime()) ||
        new Date(authorizationStartedAt).getTime() <=
          new Date(access.gmail_deleted_at).getTime())
    )
      throw new HttpError(
        409,
        "Gmail data was deleted after this connection started. Connect Google again to authorize it.",
      );
    // Isolation is independent of paid plans. Only an existing identity or
    // a browser-bound linking session can select an existing workspace.
    const workspaceId =
      linkedWorkspace ||
      access?.workspace_id ||
      existing?.workspace_id ||
      randomUUID();
    await db.query(
      "INSERT INTO workspaces(id,email) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
      [workspaceId, identity.email],
    );
    // Serializes simultaneous connections so the two-account limit is real.
    await db.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [
      workspaceId,
    ]);
    await db.query(
      "INSERT INTO workspace_identities(id,workspace_id) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
      [identity.sub, workspaceId],
    );
    if (hosted() && !existing?.connected) {
      const {
        rows: [count],
      } = await db.query(
        "SELECT count(*)::int AS n FROM accounts WHERE workspace_id=$1 AND connected=true",
        [workspaceId],
      );
      if (count.n >= 2)
        throw new HttpError(409, "The plan includes up to two Gmail accounts.");
    }
    if (!composio && !refreshToken && !existing?.token_cipher)
      throw new Error("Offline access missing");
    const cipher = composio
      ? ""
      : refreshToken
        ? seal(refreshToken, `gmail:${identity.sub}`)
        : existing.token_cipher;
    await db.query(
      `INSERT INTO accounts(id,email,name,token_cipher,workspace_id,start_at)
      VALUES($1,$2,$3,$4,$5,now()-interval '7 days')
      ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,token_cipher=excluded.token_cipher,connected=true,last_error=NULL`,
      [
        identity.sub,
        identity.email.toLowerCase(),
        identity.email.endsWith("@gmail.com") ? "Personal" : "Work",
        cipher,
        workspaceId,
      ],
    );
    await db.query(
      `UPDATE accounts SET mail_provider=$2,composio_account_id=$3,composio_user_id=$4,
        composio_trigger_id=CASE WHEN composio_account_id IS NOT DISTINCT FROM $3 THEN composio_trigger_id ELSE NULL END,
        last_watch=CASE WHEN mail_provider=$2 AND composio_account_id IS NOT DISTINCT FROM $3 THEN last_watch ELSE NULL END,
        watch_expires=CASE WHEN mail_provider=$2 THEN watch_expires ELSE NULL END WHERE id=$1`,
      [
        identity.sub,
        composio ? "composio" : "google",
        composio?.id ?? null,
        composio?.userId ?? null,
      ],
    );
    if (
      existing?.composio_account_id &&
      existing.composio_account_id !== composio?.id
    )
      await db.query(
        "INSERT INTO composio_cleanup(connection_id) VALUES($1) ON CONFLICT DO NOTHING",
        [existing.composio_account_id],
      );
    const intentIsCurrent =
      !existing?.mode_changed_at ||
      (authorizationStartedAt &&
        new Date(authorizationStartedAt).getTime() >=
          new Date(existing.mode_changed_at).getTime());
    if (
      filteringRequested &&
      intentIsCurrent &&
      writesEnabled(identity.sub) &&
      classifierConfigured()
    )
      await startFiltering(db, identity.sub);
    return workspaceId as string;
  });
}
