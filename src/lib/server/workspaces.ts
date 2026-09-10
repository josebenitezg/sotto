import { randomUUID } from "node:crypto";
import { hosted } from "./config";
import { transaction } from "./db";
import { HttpError } from "./auth";
import { seal } from "./crypto";

// A verified Google identity can sign in to its existing workspace. Linking a
// second inbox requires a browser-bound OAuth intent from that workspace.
export async function connectIdentity(
  identity: { sub: string; email: string },
  refreshToken: string | undefined,
  linkedWorkspace: string | null,
  authorizationStartedAt?: Date | string,
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
      "SELECT workspace_id,token_cipher,connected FROM accounts WHERE id=$1",
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
        "Esa cuenta ya pertenece a otro espacio de Sotto.",
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
        "Los datos de Gmail se eliminaron después de iniciar esta conexión. Volvé a conectar Google para autorizarla de nuevo.",
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
        throw new HttpError(409, "El plan incluye hasta dos cuentas Gmail.");
    }
    if (!refreshToken && !existing?.token_cipher)
      throw new Error("Offline access missing");
    const cipher = refreshToken
      ? seal(refreshToken, `gmail:${identity.sub}`)
      : existing.token_cipher;
    await db.query(
      `INSERT INTO accounts(id,email,name,token_cipher,workspace_id,start_at)
      VALUES($1,$2,$3,$4,$5,now()-interval '7 days')
      ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,token_cipher=excluded.token_cipher,connected=true,last_error=NULL`,
      [
        identity.sub,
        identity.email.toLowerCase(),
        identity.email.endsWith("@gmail.com") ? "Personal" : "Trabajo",
        cipher,
        workspaceId,
      ],
    );
    return workspaceId as string;
  });
}
