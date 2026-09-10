import { readFile, readdir } from "node:fs/promises";
import { pool } from "../src/lib/server/db";
const db = pool();
const client = await db.connect();
try {
  const directory = new URL("../db/", import.meta.url);
  await client.query("BEGIN");
  for (const file of (await readdir(directory))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort())
    await client.query(await readFile(new URL(file, directory), "utf8"));
  await client.query("COMMIT");
  console.log("Database ready.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await db.end();
}
