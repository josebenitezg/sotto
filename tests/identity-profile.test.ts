import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: null as unknown as PGlite,
  cookie: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (h.cookie ? { value: h.cookie } : undefined),
  }),
}));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) =>
    (await h.db.query(sql, params)).rows,
  transaction: async (fn: (client: any) => Promise<unknown>) =>
    h.db.transaction((tx) =>
      fn({
        query: (sql: string, params: unknown[] = []) => tx.query(sql, params),
      }),
    ),
}));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: vi.fn() }));
import { createSession, sessionViewer } from "../src/lib/server/auth";
import { profileFromClaims } from "../src/lib/server/profile";
import { connectIdentity } from "../src/lib/server/workspaces";

beforeAll(async () => {
  h.db = new PGlite();
  for (const file of (await readdir("db"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await h.db.exec(await readFile(`db/${file}`, "utf8"));
});
afterAll(() => h.db.close());
beforeEach(() => {
  h.cookie = undefined;
  for (const [key, value] of Object.entries({
    DEMO_MODE: "false",
    BILLING_ENABLED: "false",
    APP_URL: "https://sotto.example",
    ENCRYPTION_KEY: "11".repeat(32),
  }))
    vi.stubEnv(key, value);
});

it("keeps only https pictures served by Google and trims the name", () => {
  expect(
    profileFromClaims({
      name: "  Ana   Martínez ",
      picture: "https://lh3.googleusercontent.com/a/photo=s96-c",
    }),
  ).toEqual({
    name: "Ana Martínez",
    picture: "https://lh3.googleusercontent.com/a/photo=s96-c",
  });
  expect(
    profileFromClaims({ picture: "http://lh3.googleusercontent.com/a/x" }),
  ).toEqual({});
  expect(
    profileFromClaims({
      picture: "https://evil.example/googleusercontent.com",
    }),
  ).toEqual({});
  expect(profileFromClaims({ name: "   ", picture: 42 })).toEqual({});
});

it("shows the signed-in identity's name and picture, and falls back to the address", async () => {
  const workspace = await connectIdentity(
    {
      sub: "id-work",
      email: "owner@studio.example",
      name: "Owner",
      picture: "https://lh3.googleusercontent.com/a/owner",
    },
    "refresh",
    null,
  );
  await connectIdentity(
    { sub: "id-personal", email: "owner@gmail.example" },
    "refresh",
    workspace,
  );
  h.cookie = await createSession(workspace, "id-personal");
  expect(await sessionViewer()).toEqual({
    email: "owner@gmail.example",
    name: null,
    picture: null,
  });
  h.cookie = await createSession(workspace, "id-work");
  expect(await sessionViewer()).toEqual({
    email: "owner@studio.example",
    name: "Owner",
    picture: "https://lh3.googleusercontent.com/a/owner",
  });
  // Sessions created before this change carry no identity: use the workspace address.
  h.cookie = await createSession(workspace);
  expect((await sessionViewer())?.email).toBe("owner@studio.example");
  h.cookie = undefined;
  expect(await sessionViewer()).toBeNull();
});

it("does not erase a stored profile when a later connection has none", async () => {
  const workspace = await connectIdentity(
    {
      sub: "id-keep",
      email: "keep@studio.example",
      name: "Keep",
      picture: "https://lh3.googleusercontent.com/a/keep",
    },
    "refresh",
    null,
  );
  await connectIdentity(
    { sub: "id-keep", email: "keep@studio.example" },
    "refresh",
    workspace,
  );
  h.cookie = await createSession(workspace, "id-keep");
  expect((await sessionViewer())?.name).toBe("Keep");
});
