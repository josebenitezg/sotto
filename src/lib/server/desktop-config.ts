import { query } from "./db";
import { HttpError } from "./auth";
export const desktopEnabled = () => process.env.DESKTOP_ENABLED === "true";
export function requireDesktop() {
  if (!desktopEnabled())
    throw new HttpError(
      503,
      "Sotto Local is not available on this server yet.",
    );
}
export async function usesDesktop(accountId: string) {
  // A feature rollback must never send a locally configured mailbox to cloud AI.
  // Policy exists before the desktop migration, so this guard is safe during rollout.
  const [account] = await query(
    "SELECT policy->>'processingLocation' AS location FROM accounts WHERE id=$1",
    [accountId],
  );
  return account?.location === "desktop";
}
export const desktopReturnCookie = "sotto_desktop_return";
export function desktopReturnPath(id: string | undefined) {
  return desktopEnabled() && id && /^[a-f0-9-]{36}$/.test(id)
    ? `/desktop/connect?id=${id}`
    : null;
}
