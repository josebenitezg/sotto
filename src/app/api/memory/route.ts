import { errorResponse, HttpError, requireSession } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { coldMemory, memoryMarkdown } from "@/lib/server/cold-memory";

export async function GET(request: Request) {
  try {
    const workspaceId = await requireSession();
    const accountId = new URL(request.url).searchParams.get("accountId");
    const [account] = await query(
      "SELECT id FROM accounts WHERE id=$1 AND workspace_id=$2",
      [accountId, workspaceId],
    );
    if (!account) throw new HttpError(404, "We could not find that account.");
    return new Response(memoryMarkdown(await coldMemory(account.id)), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="memory.md"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
