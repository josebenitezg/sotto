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
export const writesEnabled = () =>
  process.env.ENABLE_MAILBOX_WRITES === "true" && !isDemo();
export function allowedEmail(email: string) {
  return required("ALLOWED_GOOGLE_EMAILS")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .includes(email.toLowerCase());
}
