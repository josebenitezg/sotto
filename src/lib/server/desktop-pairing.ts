import { randomUUID, randomBytes } from "node:crypto";
import { query, transaction } from "./db";
import { hash, opaque } from "./crypto";
import { appUrl } from "./config";
import { HttpError } from "./auth";

export async function createPairing(challenge: string) {
  if (!/^[a-f0-9]{64}$/.test(challenge))
    throw new HttpError(400, "Invalid device challenge.");
  await query("DELETE FROM desktop_pairings WHERE expires_at<now()");
  const [count] = await query(
    "SELECT count(*)::int AS n FROM desktop_pairings",
  );
  if (count.n >= 1000)
    throw new HttpError(429, "Try connecting again in a few minutes.");
  const id = randomUUID(),
    code = randomBytes(4).toString("hex").toUpperCase();
  const [pair] = await query(
    "INSERT INTO desktop_pairings(id,challenge,user_code) VALUES($1,$2,$3) ON CONFLICT(challenge) DO UPDATE SET challenge=excluded.challenge RETURNING id,user_code",
    [id, challenge, `${code.slice(0, 4)}-${code.slice(4)}`],
  );
  return {
    id: pair.id,
    code: pair.user_code,
    url: `${appUrl()}/desktop/connect?id=${pair.id}`,
  };
}
export async function approvePairing(
  id: string,
  workspaceId: string,
  code: string,
) {
  const [pair] = await query(
    "UPDATE desktop_pairings SET workspace_id=$2 WHERE id=$1 AND user_code=$3 AND workspace_id IS NULL AND expires_at>now() RETURNING id",
    [id, workspaceId, code],
  );
  if (!pair)
    throw new HttpError(
      409,
      "This connection expired or was already approved. Start again in Sotto Local.",
    );
}
export async function exchangePairing(id: string, secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw new HttpError(400, "Invalid device proof.");
  return transaction(async (db) => {
    const {
      rows: [pair],
    } = await db.query(
      "SELECT * FROM desktop_pairings WHERE id=$1 AND challenge=$2 AND expires_at>now() FOR UPDATE",
      [id, hash(secret)],
    );
    if (!pair)
      throw new HttpError(
        410,
        "This connection expired. Start again in Sotto Local.",
      );
    if (!pair.workspace_id) return { pending: true };
    const token = opaque();
    await db.query(
      "INSERT INTO sessions(token_hash,workspace_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
      [hash(token), pair.workspace_id],
    );
    await db.query("DELETE FROM desktop_pairings WHERE id=$1", [id]);
    return { pending: false, token };
  });
}
