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
) {
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `identity:${identity.sub}`,
    ]);
    const {
      rows: [existing],
    } = await db.query(
      "SELECT workspace_id,token_cipher,connected FROM accounts WHERE id=$1",
      [identity.sub],
    );
    if (
      existing &&
      linkedWorkspace &&
      existing.workspace_id !== linkedWorkspace
    )
      throw new HttpError(
        409,
        "Esa cuenta ya pertenece a otro espacio de Sotto.",
      );
    const workspaceId = hosted()
      ? linkedWorkspace || existing?.workspace_id || randomUUID()
      : "installation";
    await db.query(
      "INSERT INTO workspaces(id,email) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
      [workspaceId, identity.email],
    );
    // Serializes simultaneous connections so the two-account limit is real.
    await db.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [
      workspaceId,
    ]);
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
