import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { required } from "./config";
const globalDb = globalThis as unknown as { sottoPool?: Pool };
export function pool() {
  globalDb.sottoPool ??= new Pool({
    connectionString: required("DATABASE_URL"),
    max: 8,
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
