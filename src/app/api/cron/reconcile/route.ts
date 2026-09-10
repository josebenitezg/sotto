import { timingSafeEqual } from "node:crypto";
import { query } from "@/lib/server/db";
import { enqueueAccount } from "@/lib/server/queue";
import { isDemo } from "@/lib/server/config";
import { classify } from "@/lib/server/classifier";
import {
  ClassifierRateLimit,
  processingErrorCode,
} from "@/lib/server/processing-error";
import { defaultPolicy } from "@/lib/types";

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response(null, { status: 401 });
  if (isDemo() || process.env.QUEUE_DRIVER !== "vercel")
    return new Response(null, { status: 404 });
  // Operator-only provider check using synthetic mail, never a user's inbox.
  if (new URL(request.url).searchParams.get("probe") === "classifier") {
    try {
      const result = await classify(
        {
          id: "probe",
          threadId: "probe",
          from: "sales@vendor.example",
          subject: "Unsolicited sales pitch",
          text: "We have never spoken. Would you buy our outbound lead generation service?",
          labels: ["INBOX"],
          receivedAt: Date.now(),
          headers: {
            "authentication-results":
              "mx.google.com; dmarc=pass header.from=vendor.example",
          },
        },
        {
          accountEmail: "owner@studio.example",
          policy: defaultPolicy,
          allowedSenders: [],
          hasReply: false,
          previouslyContacted: false,
        },
      );
      return Response.json({
        ok: true,
        category: result.category,
        decision: result.decision,
      });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          code: processingErrorCode(error),
          ...(error instanceof ClassifierRateLimit
            ? {
                retryAfterSeconds: error.retryAfterSeconds,
                source: error.source,
              }
            : {}),
        },
        { status: 502 },
      );
    }
  }
  // A production-origin probe exercises queue auth without a Gmail account.
  if (new URL(request.url).searchParams.get("probe") === "queue") {
    await enqueueAccount("sotto-installation-probe");
    return Response.json({ queued: 1, probe: true });
  }
  const accounts = await query(
    "SELECT id FROM accounts WHERE connected=true AND mode<>'paused' ORDER BY created_at",
  );
  for (const account of accounts) await enqueueAccount(account.id);
  await query("DELETE FROM sessions WHERE expires_at<now()");
  await query("DELETE FROM oauth_states WHERE expires_at<now()");
  await query(
    "DELETE FROM mailbox_events WHERE processed_at<now()-interval '7 days'",
  );
  return Response.json({ queued: accounts.length });
}
