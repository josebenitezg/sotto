export function classifierConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

export async function aiConnection() {
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  if (!process.env.OPENAI_API_KEY) throw new Error("Classifier not configured");
  return {
    url: "https://api.openai.com/v1/responses",
    token: process.env.OPENAI_API_KEY,
    model,
  };
}
