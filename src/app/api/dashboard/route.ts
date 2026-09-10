import { dashboard } from "@/lib/server/dashboard";
import { errorResponse } from "@/lib/server/auth";
export async function GET() {
  try {
    return Response.json(await dashboard(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
