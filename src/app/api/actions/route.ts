import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  errorResponse,
  HttpError,
  requireOrigin,
  requireSession,
} from "@/lib/server/auth";
import { isDemo, writesEnabled } from "@/lib/server/config";
import { query } from "@/lib/server/db";
import { Gmail } from "@/lib/server/google";
import { classifierConfigured } from "@/lib/server/ai";
import { enqueueAccount } from "@/lib/server/queue";
import {
  withAccountLock,
  moveDecision,
  restoreDecision,
  AccountBusy,
} from "@/lib/server/engine";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mode"),
    accountId: z.string(),
    mode: z.enum(["review", "automatic", "paused"]),
  }),
  z.object({
    action: z.literal("policy"),
    accountId: z.string(),
    marketing: z.boolean(),
    newsletters: z.boolean(),
    instructions: z.string().max(1500).optional(),
  }),
  z.object({ action: z.literal("reviewed"), accountId: z.string() }),
  z.object({ action: z.literal("sync"), accountId: z.string() }),
  z.object({ action: z.literal("disconnect"), accountId: z.string() }),
  z.object({
    action: z.literal("allow"),
    accountId: z.string(),
    sender: z.email().max(254),
  }),
  z.object({ action: z.literal("removeRule"), ruleId: z.string() }),
  z.object({
    action: z.enum(["keep", "move", "restore"]),
    decisionId: z.string(),
  }),
]);
export async function POST(request: Request) {
  try {
    if (isDemo()) throw new HttpError(400, "La demo no modifica Gmail.");
    requireOrigin(request);
    await requireSession();
    const raw = await request.text();
    if (raw.length > 4096)
      throw new HttpError(413, "La solicitud es demasiado grande.");
    const parsed = actionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new HttpError(400, "Revisá los datos del cambio.");
    const action = parsed.data;
    let accountId = "accountId" in action ? action.accountId : "";
    if ("decisionId" in action) {
      const [decision] = await query(
        "SELECT account_id FROM decisions WHERE id=$1",
        [action.decisionId],
      );
      if (!decision)
        throw new HttpError(404, "Ese correo ya no está en Sotto.");
      accountId = decision.account_id;
    }
    if (action.action === "removeRule") {
      const [rule] = await query(
        "SELECT account_id FROM sender_rules WHERE id=$1",
        [action.ruleId],
      );
      if (!rule) throw new HttpError(404, "Esa regla ya no existe.");
      accountId = rule.account_id;
    }
    await withAccountLock(accountId, async () => {
      const [account] = await query("SELECT * FROM accounts WHERE id=$1", [
        accountId,
      ]);
      if (!account) throw new HttpError(404, "No encontramos esa cuenta.");
      if (action.action === "mode") {
        if (!account.connected)
          throw new HttpError(409, "Conectá de nuevo esta cuenta.");
        if (
          action.mode === "automatic" &&
          (!writesEnabled() || !account.reviewed_at || !classifierConfigured())
        )
          throw new HttpError(
            409,
            "Revisá las propuestas y habilitá el procesamiento antes de activar el filtro.",
          );
        await query(
          "UPDATE accounts SET mode=$2,auto_after=CASE WHEN $2='automatic' THEN now() ELSE auto_after END WHERE id=$1",
          [accountId, action.mode],
        );
      } else if (action.action === "policy") {
        await query(
          "UPDATE accounts SET policy=jsonb_set(jsonb_set(policy,'{marketing}',$2::jsonb),'{newsletters}',$3::jsonb) WHERE id=$1",
          [
            accountId,
            JSON.stringify(action.marketing),
            JSON.stringify(action.newsletters),
          ],
        );
        if (action.instructions !== undefined)
          await query(
            "UPDATE accounts SET policy=jsonb_set(policy,'{instructions}',$2::jsonb) WHERE id=$1",
            [accountId, JSON.stringify(action.instructions)],
          );
      } else if (action.action === "reviewed") {
        const [count] = await query(
          "SELECT count(*)::int AS n FROM decisions WHERE account_id=$1",
          [accountId],
        );
        if (!count.n)
          throw new HttpError(409, "Esperá a tener propuestas para revisar.");
        await query("UPDATE accounts SET reviewed_at=now() WHERE id=$1", [
          accountId,
        ]);
      } else if (action.action === "sync") {
        await query(
          "INSERT INTO mailbox_events(id,account_id,history_id) VALUES($1,$2,'0')",
          [`manual:${randomUUID()}`, accountId],
        );
        await query(
          "UPDATE jobs SET state='pending',attempts=0,available_at=now() WHERE account_id=$1 AND state='failed'",
          [accountId],
        );
      } else if (action.action === "allow") {
        const sender = action.sender.toLowerCase();
        await query(
          "INSERT INTO sender_rules(id,account_id,sender) VALUES($1,$2,$3) ON CONFLICT(account_id,sender) DO NOTHING",
          [randomUUID(), accountId, sender],
        );
        await query(
          "UPDATE decisions SET state='kept',reason='Este remitente está permitido.',updated_at=now() WHERE account_id=$1 AND sender=$2 AND state='suggested'",
          [accountId, sender],
        );
      } else if (action.action === "removeRule") {
        await query("DELETE FROM sender_rules WHERE id=$1", [action.ruleId]);
      } else if (action.action === "disconnect") {
        if (account.connected) {
          const gmail = await Gmail.forAccount(accountId);
          try {
            await gmail.stop();
          } catch {
            /* Local disconnect still stops processing. */
          }
          try {
            await gmail.revoke();
          } catch {
            /* Google permissions can also be revoked at myaccount.google.com. */
          }
        }
        await query(
          "UPDATE accounts SET connected=false,mode='paused',token_cipher='',watch_expires=NULL WHERE id=$1",
          [accountId],
        );
      } else if (action.action === "keep") {
        await query(
          "UPDATE decisions SET state='kept',reason='Elegiste conservar este correo.',updated_at=now() WHERE id=$1 AND state='suggested'",
          [action.decisionId],
        );
      } else if (action.action === "move" || action.action === "restore") {
        if (!writesEnabled())
          throw new HttpError(
            409,
            "El movimiento de correos todavía está desactivado en esta instalación.",
          );
        const gmail = await Gmail.forAccount(accountId);
        if (action.action === "move")
          await moveDecision(action.decisionId, gmail);
        else await restoreDecision(action.decisionId, gmail);
      }
      if ("decisionId" in action) {
        const [current] = await query(
          "SELECT state FROM decisions WHERE id=$1",
          [action.decisionId],
        );
        const expected =
          action.action === "move"
            ? "moved"
            : action.action === "restore"
              ? "restored"
              : "kept";
        if (current?.state !== expected)
          throw new HttpError(
            409,
            "El correo cambió de estado o quedó protegido. Revisá la decisión actual antes de continuar.",
          );
      }
    });
    if (
      action.action === "sync" ||
      (action.action === "mode" && action.mode !== "paused")
    )
      await enqueueAccount(accountId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AccountBusy)
      return errorResponse(
        new HttpError(
          409,
          "Esta cuenta se está sincronizando. Intentá de nuevo en un momento.",
        ),
      );
    return errorResponse(error);
  }
}
