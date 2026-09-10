// Only fixed diagnostic codes may leave the worker. Provider bodies and mail
// content can contain private data and must never appear in application logs.
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
