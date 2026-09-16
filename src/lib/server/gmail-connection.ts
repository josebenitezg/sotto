import { HttpError } from "./auth";
import {
  ComposioError,
  composioRequest,
  type ComposioConnection,
} from "./composio";
import { query } from "./db";
import { GMAIL_RECONNECT_MESSAGE } from "../gmail-connection";

export class GmailReconnectRequired extends HttpError {
  constructor() {
    // Gmail authorization expired, not the browser or desktop Sotto session.
    super(409, GMAIL_RECONNECT_MESSAGE);
  }
}

export async function checkGmailConnection(
  error: unknown,
  accountId: string | undefined,
  connection: ComposioConnection,
) {
  if (
    !accountId ||
    !(error instanceof ComposioError) ||
    ![401, 403, 410].includes(error.status)
  )
    return;
  // A 410 can also mean a retired endpoint/trigger. Confirm expiry before
  // changing account state; transient failures must not disconnect a mailbox.
  const current = await composioRequest<{ id: string; status: string }>(
    `/connected_accounts/${encodeURIComponent(connection.id)}`,
  ).catch(() => null);
  if (current?.id !== connection.id || current.status !== "EXPIRED") return;
  const changed = await query(
    `UPDATE accounts SET connected=false,last_error=$3
     WHERE id=$1 AND mail_provider='composio' AND composio_account_id=$2
     RETURNING id`,
    [accountId, connection.id, GMAIL_RECONNECT_MESSAGE],
  );
  // A delayed response from an old connection must not invalidate a reconnect.
  if (changed.length) throw new GmailReconnectRequired();
}
