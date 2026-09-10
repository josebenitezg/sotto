import { getVercelOidcToken } from "@vercel/oidc";

export function classifierConfigured() {
  return process.env.AI_PROVIDER === "vercel"
    ? !!(
        process.env.AI_GATEWAY_API_KEY ||
        process.env.VERCEL_OIDC_TOKEN ||
        process.env.VERCEL
      )
    : !!process.env.OPENAI_API_KEY;
}

export async function aiConnection() {
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  if (process.env.AI_PROVIDER === "vercel") {
    const token =
      process.env.AI_GATEWAY_API_KEY || (await getVercelOidcToken());
    return {
      url: "https://ai-gateway.vercel.sh/v1/responses",
      token,
      model: model.startsWith("openai/") ? model : `openai/${model}`,
    };
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("Classifier not configured");
  return {
    url: "https://api.openai.com/v1/responses",
    token: process.env.OPENAI_API_KEY,
    model,
  };
}
