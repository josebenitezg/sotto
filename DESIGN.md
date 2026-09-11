# Sotto design principles

Sotto is the quiet place where you decide what belongs in your inbox. The interface should feel like a well-made settings surface. It is not a marketing dashboard, a metrics wall, or a replacement email client.

## The job

Help someone connect their work inbox, understand the proposed decisions, and keep control. Start with work; adding a personal account is a secondary step. Explain why a message would move. Make uncertainty and connection state explicit.

## Voice

English throughout the product. Short verbs, sentence case, no infrastructure jargon. Prefer “Connect with Google”, “Start filtering”, “Keep”, “Undo”, and “Open in Gmail”. A button and its feedback use the same language. No uppercase eyebrows or filler. Errors explain the next useful step.

## Appearance

- Warm off-white canvas, white surfaces, near-black green-cast ink.
- A deep teal accent for primary actions, focus and active state. Muted amber means review or pause; red means an actionable error. Pair every color with text.
- All color values belong in global tokens, except official brand marks.
- Geist Sans. Page titles 28/32 semibold; section titles 16/24; row titles 14/20 medium; body 14/22; metadata 13/18; captions 12/16.
- Desktop sidebar 240px, content up to 880px. Real routes, mobile bottom navigation.
- Lists with hairline dividers are the primary composition. No nested cards, metric tiles, gradients, ornamental shadows or glass.
- Spacing: 4, 8, 12, 16, 24, 32, 48. Card radius 12px; controls 10px.

## Public pages

The landing and login extend the quiet application with an editorial scale: locally served Instrument Serif display type paired with Geist Sans, a warm cream canvas, deep green panels and generous space. The hero explains the product through a visibly fictional, interactive inbox. Public pages use horizontal navigation; the private workspace retains its sidebar. No invented customer logos, metrics, testimonials, or active-service claims. Google readiness is explicit on the login page.

## Interaction

- Accessible shadcn/Radix controls. One primary action per surface.
- Details and forms open in a sheet. Destructive transitions use a confirmation dialog. Connecting with the visible automatic-filtering notice starts filtering directly; existing accounts use one Start filtering button with the same scope explained inline.
- Settings save on change with inline “Guardado” feedback. Errors persist near the control.
- Press feedback is subtle, 120ms. Only transform and opacity animate. No animation on navigation; no movement with reduced motion. Nothing exceeds 300ms.
- Empty states show what happens next. Demo mode is visibly synthetic and cannot touch Gmail.

## Honesty

Never label sample data as a connected inbox. “Connected” means credentials were accepted; show the last sync separately. A configured hook is not proof that a worker is healthy. Counts describe the loaded view, not an unmeasured mailbox total. Never display model confidence as a measured accuracy guarantee.

These principles follow the requested calm settings aesthetic. Sotto's implementation and mark are independent; no private project code or assets are included.
