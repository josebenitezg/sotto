import { cookies } from "next/headers";
import { appUrl } from "./config";
import { hash, opaque } from "./crypto";
import { query } from "./db";
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
export async function createSession(workspaceId = "installation") {
  const value = opaque();
  await query(
    "INSERT INTO sessions(token_hash,expires_at,workspace_id) VALUES($1,now()+interval '7 days',$2)",
    [hash(value), workspaceId],
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
