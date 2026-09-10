import { readFile } from "node:fs/promises";
import { pool } from "../src/lib/server/db";
const db = pool();
try {
  await db.query(
    await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8"),
  );
  console.log("Database ready.");
} finally {
  await db.end();
}
