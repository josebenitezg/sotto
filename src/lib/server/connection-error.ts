import {
  connectionErrorMessage,
  type ConnectionErrorCode,
} from "../connection-errors";

export class ConnectionError extends Error {
  constructor(
    readonly code: ConnectionErrorCode,
    readonly status = 400,
  ) {
    super(connectionErrorMessage(code));
  }
}

export function logConnectionFailure(
  provider: "google" | "composio",
  stage: string,
  code: ConnectionErrorCode,
  error: unknown,
  started: number,
) {
  const status =
    error && typeof error === "object" && "status" in error
      ? error.status
      : undefined;
  // Provider messages, URLs, identities, and tokens must never reach logs.
  console.warn(
    JSON.stringify({
      event: "gmail_connection_failed",
      provider,
      stage,
      code,
      durationMs: Date.now() - started,
      ...(typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
        ? { status }
        : {}),
    }),
  );
}
