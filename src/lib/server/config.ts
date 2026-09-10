export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
export function appUrl() {
  const url = new URL(required("APP_URL"));
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("APP_URL requires HTTPS");
  return url.origin;
}
export function configured() {
  return [
    "DATABASE_URL",
    "APP_URL",
    "ENCRYPTION_KEY",
    "ALLOWED_GOOGLE_EMAILS",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ].every((key) => !!process.env[key]?.trim());
}
export const isDemo = () => process.env.DEMO_MODE === "true";
export const hosted = () => process.env.BILLING_ENABLED === "true";
export const publicSignup = () =>
  hosted() && process.env.PUBLIC_SIGNUP === "true";
export function writesEnabled(accountId?: string) {
  if (process.env.ENABLE_MAILBOX_WRITES !== "true" || isDemo()) return false;
  const configuredIds = process.env.MAILBOX_WRITE_ACCOUNT_IDS;
  // Unset preserves the explicit installation-wide opt-in. A configured but
  // empty/malformed restriction must never turn into permission for everyone.
  if (configuredIds === undefined) return true;
  if (configuredIds.length > 4096) return false;
  const ids = configuredIds.split(",").map((id) => id.trim());
  if (ids.some((id) => !/^[a-zA-Z0-9_-]{1,255}$/.test(id))) return false;
  return !!accountId && ids.includes(accountId);
}
export function allowedEmail(email: string) {
  return (process.env.ALLOWED_GOOGLE_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .includes(email.toLowerCase());
}
