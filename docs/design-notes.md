# Design notes

The 2026-09 redesign moved Sotto to a single dark theme, one typeface family, and roughly half the words. The rules live in [DESIGN.md](../DESIGN.md); this file records where they came from and what was consciously dropped.

## Sources

- [Vercel design.md](https://vercel.com/design.md) and the [blog post on how agents use it](https://vercel.com/blog/how-our-agents-build-on-brand-pages-with-design-md). Borrowed: a priority order, observable rules instead of adjectives, a hard-reject list, and the split between judgment (markdown) and mechanics (CSS tokens).
- [Vercel web interface guidelines](https://vercel.com/design/guidelines). Borrowed: hit targets, `:focus-visible`, `touch-action: manipulation`, `color-scheme: dark`, theme color meta, tabular numerals, ellipsis on in-progress labels, links are links.
- [Geist colors](https://vercel.com/geist/colors). Borrowed: the 10-step gray scale and its role mapping (100 to 300 component backgrounds, 400 to 600 borders, 900 and 1000 text). Hex values are Sotto's own; they are not copied from Vercel.
- [Emil Kowalski's skills](https://github.com/emilkowalski/skills), `emil-design-eng`, `animate`, and `review-animations`. Borrowed: the frequency test for whether to animate, duration table, `cubic-bezier(0.23, 1, 0.32, 1)` as the default ease-out, `scale(0.97)` press feedback, never `scale(0)`, exits faster than enters, hover gated to `(hover: hover)`, reduced motion keeps opacity and drops transforms.
- [Ryo Lu](https://x.com/ryolu_): design as seeing the structure under the surface. Applied as: fewer surfaces, each one earned by a list, an overlay, or the demo.

## What was removed

- The light theme, the warm paper palette, the teal accent, and Instrument Serif.
- The sidebar and the mobile bottom bar. Navigation is one tab row under a 56px header on every viewport.
- The landing trust strip, manifesto, plan card, italic margin note, eyebrow, and discover link.
- The login aside panel.
- Description sentences under page titles, the "Always under your control" settings section, footnotes under lists, and the sidebar blurb.
- Avatar squares and icon tiles in lists and empty states.

## What was kept on purpose

- The Google data notice next to every Connect button and the full privacy page. These are disclosures for Google's verification; they were restyled, not shortened.
- The billing terms on the pricing page.
- The landing demo and its toggle were kept in the first pass and removed on 2026-09-12: a seven-lens audit and a three-proposal panel agreed that a static list of two sample decisions, labeled Demo, proves the same thing with no client code and no motion.
- The `Start filtering` label and the "Moving emails is disabled for this account." message, which the write-gate test asserts.
