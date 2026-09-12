import { cookies } from "next/headers";
import { appUrl } from "./config";
import { hash, opaque } from "./crypto";
import { query } from "./db";
import type { Viewer } from "../types";
export const sessionCookie = "sotto_session";
export const oauthCookie = "sotto_oauth";
export const cookieOptions = () => ({
  httpOnly: true,
  secure: appUrl().startsWith("https:"),
  sameSite: "lax" as const,
  path: "/",
});
export async function sessionWorkspace(): Promise<string | null> {
  const value = (await cookies()).get(sessionCookie)?.value;
  if (!value) return null;
  const [session] = await query(
    "SELECT workspace_id FROM sessions WHERE token_hash=$1 AND expires_at>now()",
    [hash(value)],
  );
  return session?.workspace_id ?? null;
}
/**
 * Who is signed in, for the header. Sessions from before identities were
 * recorded fall back to the workspace's own address. A session whose identity
 * has since deleted its Gmail data shows no address at all, never another
 * account's.
 */
export async function sessionViewer(): Promise<Viewer | null> {
  const value = (await cookies()).get(sessionCookie)?.value;
  if (!value) return null;
  const [row] = await query(
    `SELECT s.identity_id,w.email AS workspace_email,i.name,i.picture,a.email
     FROM sessions s JOIN workspaces w ON w.id=s.workspace_id
     LEFT JOIN workspace_identities i ON i.id=COALESCE(
       s.identity_id,
       (SELECT id FROM accounts WHERE workspace_id=w.id AND email=w.email LIMIT 1))
     LEFT JOIN accounts a ON a.id=i.id
     WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [hash(value)],
  );
  if (!row) return null;
  return {
    email: row.email ?? (row.identity_id ? null : row.workspace_email),
    name: row.name ?? null,
    picture: row.picture ?? null,
  };
}
export async function authenticated() {
  return !!(await sessionWorkspace());
}
export async function requireSession() {
  const workspaceId = await sessionWorkspace();
  if (!workspaceId) throw new HttpError(401, "Sign in to continue.");
  return workspaceId;
}
export function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== appUrl())
    throw new HttpError(403, "Open Sotto again and retry.");
}
export async function createSession(
  workspaceId = "installation",
  identityId: string | null = null,
) {
  const value = opaque();
  await query(
    "INSERT INTO sessions(token_hash,expires_at,workspace_id,identity_id) VALUES($1,now()+interval '7 days',$2,$3)",
    [hash(value), workspaceId, identityId],
  );
  return value;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  // Provider bodies and request payloads may contain private email or credentials.
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    { error: "We could not complete the change. Please try again." },
    { status: 500 },
  );
}
