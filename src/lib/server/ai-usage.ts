import { query } from "./db";

export async function recordAiUsage(
  accountId: string | undefined,
  model: string,
  usage: unknown,
) {
  if (!accountId || !usage || typeof usage !== "object") return;
  const values = usage as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  const input = values.input_tokens;
  const output = values.output_tokens;
  const cached = values.input_tokens_details?.cached_tokens ?? 0;
  if (
    ![input, output, cached].every(
      (n) => Number.isSafeInteger(n) && Number(n) >= 0,
    ) ||
    cached > Number(input)
  )
    return;
  try {
    await query(
      "INSERT INTO ai_usage(account_id,model,input_tokens,cached_input_tokens,output_tokens) VALUES($1,$2,$3,$4,$5)",
      [accountId, model, input, cached, output],
    );
  } catch {
    console.warn(JSON.stringify({ event: "ai_usage_record_failed" }));
  }
}
