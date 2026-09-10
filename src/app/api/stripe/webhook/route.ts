import { stripe, processStripeEvent } from "@/lib/server/billing";
import { hosted, isDemo, required } from "@/lib/server/config";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!hosted() || isDemo()) return new Response(null, { status: 404 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response(null, { status: 400 });
  const raw = await request.text();
  if (raw.length > 1024 * 1024) return new Response(null, { status: 413 });
  let event;
  try {
    event = stripe().webhooks.constructEvent(
      raw,
      signature,
      required("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    await processStripeEvent(event);
    return Response.json({ received: true });
  } catch {
    console.error("Stripe event reconciliation failed", {
      eventId: event.id,
      type: event.type,
    });
    return new Response(null, { status: 500 });
  }
}
