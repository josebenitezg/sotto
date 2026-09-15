import { errorResponse, HttpError } from "@/lib/server/auth";
import { requireDesktop } from "@/lib/server/desktop-config";
import { createPairing, exchangePairing } from "@/lib/server/desktop-pairing";
export async function POST(request: Request) {
  try {
    requireDesktop();
    const text = await request.text();
    if (text.length > 1024) throw new HttpError(413, "Request too large.");
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Invalid pairing request.");
    }
    if (!body || typeof body !== "object")
      throw new HttpError(400, "Invalid pairing request.");
    const result =
      body.action === "start"
        ? await createPairing(String(body.challenge ?? ""))
        : body.action === "poll" && typeof body.id === "string"
          ? await exchangePairing(body.id, String(body.secret ?? ""))
          : (() => {
              throw new HttpError(400, "Invalid pairing request.");
            })();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
