import { z } from "zod";
import { pool } from "../src/lib/server/db";

const [action = "list", input] = process.argv.slice(2);
if (!["list", "add", "remove"].includes(action))
  throw new Error("Use: npm run access -- list|add email|remove email");
const email =
  action === "list" ? undefined : z.email().parse(input?.trim().toLowerCase());
const db = pool();
try {
  if (action === "list") {
    const { rows } = await db.query(
      "SELECT value FROM global_config WHERE key='full_access_emails'",
    );
    console.log(JSON.stringify(rows[0]?.value ?? [], null, 2));
  } else {
    // One SQL update prevents concurrent operator changes from overwriting each other.
    // Only this operator CLI writes the store; it has no public HTTP endpoint.
    const { rows } = await db.query(
      action === "add"
        ? `UPDATE global_config SET value=CASE WHEN value ? $1 THEN value ELSE value || jsonb_build_array($1::text) END,updated_at=now()
           WHERE key='full_access_emails' AND jsonb_typeof(value)='array' RETURNING key`
        : `UPDATE global_config SET value=value - $1::text,updated_at=now()
           WHERE key='full_access_emails' AND jsonb_typeof(value)='array' RETURNING key`,
      [email],
    );
    if (rows.length !== 1)
      throw new Error(
        "Full access configuration is missing or invalid. Run migrations or repair the store.",
      );
    console.log(
      `Full access ${action === "add" ? "granted to" : "removed from"} ${email}.`,
    );
    if (action === "add")
      console.log(
        "This does not cancel an existing Stripe subscription; manage cancellation through Stripe if needed.",
      );
  }
} finally {
  await db.end();
}
