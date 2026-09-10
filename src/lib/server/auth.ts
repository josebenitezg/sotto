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
export async function authenticated() {
  const value = (await cookies()).get(sessionCookie)?.value;
  if (!value) return false;
  return (
    (
      await query(
        "SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>now()",
        [hash(value)],
      )
    ).length > 0
  );
}
export async function requireSession() {
  if (!(await authenticated()))
    throw new HttpError(401, "Ingresá con tu cuenta para continuar.");
}
export function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== appUrl())
    throw new HttpError(403, "Volvé a abrir Sotto e intentá de nuevo.");
}
export async function createSession() {
  const value = opaque();
  await query(
    "INSERT INTO sessions(token_hash,expires_at) VALUES($1,now()+interval '7 days')",
    [hash(value)],
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
    { error: "No pudimos completar el cambio. Intentá de nuevo." },
    { status: 500 },
  );
}
