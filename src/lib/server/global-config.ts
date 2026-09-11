import { allowedEmail } from "./config";
import { query } from "./db";

// No process/CDN cache: grants and revocations take effect on the next request.
export async function pilotAdmission(
  email: string,
  linkedWorkspace: string | null,
) {
  if (allowedEmail(email)) return true;
  const [result] = await query<{ allowed: boolean }>(
    `SELECT sotto_full_access($1) OR EXISTS (
      SELECT 1 FROM workspaces WHERE id=$2 AND sotto_full_access(email)
    ) AS allowed`,
    [email, linkedWorkspace],
  );
  return result?.allowed === true;
}
