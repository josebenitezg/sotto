import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { required } from "./config";
const globalDb = globalThis as unknown as { sottoPool?: Pool };
export function pool() {
  const url = new URL(
    process.env.DATABASE_URL_UNPOOLED || required("DATABASE_URL"),
  );
  if (url.searchParams.get("sslmode") === "require")
    url.searchParams.set("sslmode", "verify-full");
  globalDb.sottoPool ??= new Pool({
    // Account advisory locks require a session, not a transaction pooler.
    connectionString: url.toString(),
    max: 8,
    idleTimeoutMillis: 20000,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 8000,
    statement_timeout: 15000,
  });
  return globalDb.sottoPool;
}
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
) {
  return (await pool().query<T>(sql, values)).rows;
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
