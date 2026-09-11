const messages = {
  failed: "We couldn't finish connecting this account. Please try again.",
  canceled:
    "The connection was canceled. Connect Google again when you're ready.",
  expired:
    "This connection expired. Start again from Sotto in the same browser.",
  session_changed:
    "Your Sotto session changed. Sign in again before adding an account.",
  not_allowed:
    "This Google account isn't enabled for the private pilot. Ask the Sotto owner to add it.",
  account_limit:
    "Your plan includes up to two Gmail accounts. Disconnect an account before adding another.",
  workspace_conflict:
    "This Google account is already connected to another Sotto workspace.",
  data_deleted:
    "Gmail data was deleted after this connection started. Connect Google again to authorize it.",
  permissions:
    "Gmail access wasn't granted. Connect again and allow the Gmail permission.",
  provider:
    "We couldn't verify the Google connection. Try again, or contact support if this keeps happening.",
} as const;

export type ConnectionErrorCode = keyof typeof messages;
export function connectionErrorCode(value: unknown): ConnectionErrorCode {
  return typeof value === "string" && Object.hasOwn(messages, value)
    ? (value as ConnectionErrorCode)
    : "failed";
}
export function connectionErrorMessage(value: unknown) {
  return messages[connectionErrorCode(value)];
}
