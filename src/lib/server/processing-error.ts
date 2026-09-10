// Only fixed diagnostic codes may leave the worker. Provider bodies and mail
// content can contain private data and must never appear in application logs.
export class ClassifierRateLimit extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    readonly source: "gateway" | "provider" | "unknown" = "unknown",
  ) {
    super("Classifier HTTP 429");
  }
}
export function retryAfterSeconds(header: string | null, now = Date.now()) {
  if (!header?.trim()) return 300;
  const seconds = Number(header);
  const delay =
    Number.isFinite(seconds) && seconds >= 0
      ? seconds
      : (Date.parse(header) - now) / 1000;
  return Number.isFinite(delay) && delay >= 0
    ? Math.max(60, Math.min(86400, Math.ceil(delay)))
    : 300;
}
export function retryPlan(error: unknown, attempts: number) {
  if (error instanceof ClassifierRateLimit)
    return {
      state: "pending",
      delay: error.retryAfterSeconds,
      deferMailbox: true,
    };
  return {
    state: attempts >= 8 ? "failed" : "pending",
    delay: Math.min(3600, 30 * 2 ** attempts),
    deferMailbox: false,
  };
}
export function processingErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "processing_failed";
  if (error.name === "TimeoutError" || error.name === "AbortError")
    return "provider_timeout";
  const http = /^Classifier HTTP (\d{3})$/.exec(error.message);
  if (http) return `classifier_http_${http[1]}`;
  if (error.message === "Incomplete classification")
    return "classifier_incomplete";
  if (error.message === "Missing classification") return "classifier_empty";
  if (error.name === "ZodError" || error instanceof SyntaxError)
    return "classifier_invalid_output";
  return "processing_failed";
}
