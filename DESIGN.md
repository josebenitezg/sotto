# Sotto design

Sotto moves cold sales emails out of a Gmail inbox and shows why. The interface is a quiet, dark settings surface. It is not an email client, a dashboard, or a marketing site with a product attached.

Read this before touching any file under `src/app` or `src/components`. Tokens live in `src/app/globals.css`. Judgment lives here. Anything that repeats belongs in CSS, not in prose or in a component's `className`.

## Priority order

When rules conflict, the earlier one wins.

1. Never misrepresent state. "Connected" means credentials were accepted. A count describes the loaded view. A confidence value is not accuracy.
2. Keep every required disclosure. The Google data notice next to each Connect button, the privacy page, and billing terms are compliance text. Restyle them, never shorten them.
3. Fewer words. If a sentence does not change what the reader does next, delete it.
4. One primary action per surface.
5. Monochrome first. Color means state, and it is always paired with text.
6. Stillness by default. Motion explains a change or confirms an action, nothing else.

## Voice

English, sentence case, second person, active voice. Short verbs on buttons: Connect with Google, Start filtering, Pause, Keep, Undo, Open in Gmail. A button and its toast use the same words.

Word budget per surface:

| Surface          | Budget                                                         |
| ---------------- | -------------------------------------------------------------- |
| Page title       | 1 to 3 words. A noun, not a slogan.                            |
| Page description | None by default. One sentence only if the page is empty.       |
| List row         | Two lines. Primary line is the subject. Secondary is metadata. |
| Empty state      | One short title, one sentence with the next step.              |
| Error            | What happened and the next useful step, one sentence each.     |
| Toast            | 2 to 5 words.                                                  |
| Landing hero     | One headline, one sentence, one button, the notice.            |

Never write all-caps eyebrows, kickers, taglines under lists, reassurance footnotes, or a second sentence that restates the first. No em dashes. Use the ellipsis character for in-progress labels: Saving…, Checking…

## Color

Dark only. `<html class="dark">`, `color-scheme: dark`, theme color `#000000`. Do not add a light theme or a theme toggle.

Canvas and surfaces:

| Token            | Value     | Use                                        |
| ---------------- | --------- | ------------------------------------------ |
| `--background`   | `#000000` | Page canvas                                |
| `--background-2` | `#0a0a0a` | Header, sheets, popovers, the landing demo |

Gray scale (component roles):

| Token         | Value     | Role                                |
| ------------- | --------- | ----------------------------------- |
| `--gray-100`  | `#1a1a1a` | Component background                |
| `--gray-200`  | `#1f1f1f` | Component hover                     |
| `--gray-300`  | `#292929` | Component active, progress track    |
| `--gray-400`  | `#2e2e2e` | Border                              |
| `--gray-500`  | `#454545` | Border hover                        |
| `--gray-600`  | `#878787` | Focus ring, disabled foreground     |
| `--gray-900`  | `#a1a1a1` | Secondary text and icons            |
| `--gray-1000` | `#ededed` | Primary text, icons, primary button |

Status colors. Each appears only next to a text label.

| Token           | Value     | Meaning                                           |
| --------------- | --------- | ------------------------------------------------- |
| `--success`     | `#3dd68c` | Filtering on                                      |
| `--warning`     | `#f5b83d` | Paused, review mode, needs attention, unavailable |
| `--destructive` | `#ff6166` | Error the person can act on; destructive action   |

Rules:

- The primary button is `--gray-1000` on black. There is no brand accent color. The mark uses `currentColor`.
- Text never sits below `--gray-900` on `--background`. Placeholder text uses `--gray-900`.
- Disabled controls use opacity 0.5, not a new color.
- Borders are 1px `--gray-400`. Hover borders `--gray-500`. Never use borders to fix a weak hierarchy.
- No gradients, glows, blur backdrops, colored icon tiles, or shadows on flat surfaces. Overlays (sheet, dialog, select) may use one soft shadow so their edge reads against black.

## Typography

Geist Sans for everything readable. Geist Mono for email addresses, timestamps, counts, and identifiers. Nothing else.

| Role    | Size/line                | Weight | Tracking | Use                                            |
| ------- | ------------------------ | ------ | -------- | ---------------------------------------------- |
| display | 48/52 to 64/64 (`clamp`) | 600    | -0.04em  | Landing headline only                          |
| title   | 24/32                    | 600    | -0.02em  | Page title, one per page                       |
| heading | 14/20                    | 500    | 0        | Section labels, sheet titles, row primary line |
| body    | 14/20                    | 400    | 0        | Everything by default                          |
| small   | 13/18                    | 400    | 0        | Secondary line in a row, notices               |
| caption | 12/16                    | 400    | 0        | Footers, timestamps, tab counts                |
| mono    | 13/18                    | 400    | 0        | Addresses, times, counts (`tabular-nums`)      |

Headings use `text-wrap: balance`. Body uses `text-wrap: pretty`. Reading width is 60 to 68 characters; the privacy page is the only long-form surface.

## Spacing and layout

Scale: 4, 8, 12, 16, 24, 32, 48, 64. Within a group use 4 to 12. Between groups 24 to 32. Between page sections 48. Nothing else.

| Surface                | Width                      | Padding              |
| ---------------------- | -------------------------- | -------------------- |
| Workspace content      | max 880px                  | 24px, 16px on mobile |
| Public pages           | max 1120px                 | 24px                 |
| Reading page (privacy) | max 680px                  | 24px                 |
| Auth (login)           | max 360px, centered        | 24px                 |
| Sheet                  | 100% mobile, 440px desktop | 24px                 |

Header height is 56px on every surface. Workspace navigation is a horizontal tab row under the header, on every viewport. Tabs scroll horizontally on small screens with the scrollbar hidden. There is no sidebar and no bottom bar.

Radius: 6px controls (`--radius-sm`), 8px surfaces (`--radius-md`), 12px large framed objects such as the landing demo (`--radius-lg`). A child's radius is never larger than its parent's.

## Surfaces

The page is one continuous black canvas. Earn a surface only for:

- A list. Lists are the primary composition: a single 1px border around the group, hairline dividers between rows, no card per row.
- An overlay: sheet, dialog, select menu, toast.
- The landing demo.

Never nest a bordered box in a bordered box. Never place two bordered sections directly under each other without a heading or 24px between them. Never use a card to hold one paragraph.

## Components

All controls are shadcn/Radix from `src/components/ui`. Variants are fixed; do not add per-page `className` color overrides.

**Button.** Heights 32 (`sm`), 36 (default), 40 (`lg`). Radius 6px. Variants:

- `default`: white on black. One per surface.
- `outline`: transparent, 1px border, hover `--gray-100`. Secondary actions.
- `ghost`: transparent, hover `--gray-100`. Tertiary and in-row actions.
- `destructive`: transparent, `--destructive` text; the confirming action in a dialog is filled.
- Press feedback `scale(0.97)` at 160ms ease-out. Loading state keeps the label and replaces the icon with a spinner; never shrink the button.

**List row.** Height auto, min 56px, padding 16px. Layout: primary line 14/20 medium, secondary line 13/18 `--gray-900`, trailing area for status or a chevron. Rows that open a sheet are a `button` with the full row as the hit target. Rows that navigate are an `a`.

**Status.** A 6px dot plus text, 13px. Colors from the status table. The status of an account is one of: Filtering on (success), Review mode, Paused, Filtering unavailable, Needs attention (warning), Disconnected (`--gray-900`).

**Tabs and filters.** Text plus a mono count. Active item is `--gray-1000` with a 1px underline; inactive is `--gray-900`. Use `aria-current` for navigation tabs and `aria-pressed` for filter chips. No pill backgrounds.

**Sheet.** Right side, 440px, `--background-2`, 1px left border. Header: title 14/20 medium, description 13/18. Actions stack vertically, full width, primary first. Opens in 200ms ease-out, closes in 160ms.

**Dialog.** Only for destructive confirmation. Title, one sentence, optional typed confirmation, Cancel plus a filled destructive action.

**Form controls.** Inputs and selects are 36px, `--gray-400` border, transparent background, `--gray-900` placeholder ending in an ellipsis, 16px font on touch devices to avoid zoom. Labels are visible. Errors sit under the field in `--destructive` and are announced with `role="alert"`.

**Switch.** 32 by 18. Checked track `--gray-1000`, unchecked `--gray-400`. Saved feedback is the word Saved in 12px next to it for 1.5s.

**Toast.** Sonner, bottom right, `--background-2`, 1px border. 2 to 5 words, no description.

**Empty state.** Inside the list surface. Title 14/20 medium, one sentence 13/18 `--gray-900`. No icon tile.

**Progress.** 2px track `--gray-300`, fill `--gray-1000`. One line of mono text above it.

## Motion

Default to stillness. Only `transform`, `opacity`, and `clip-path` animate. Never `transition: all`. Never animate anything triggered by a keyboard shortcut or a page navigation.

| What                 | Duration | Easing                                            |
| -------------------- | -------- | ------------------------------------------------- |
| Press feedback       | 160ms    | `--ease-out` `cubic-bezier(0.23, 1, 0.32, 1)`     |
| Hover color          | 120ms    | `ease`                                            |
| Select menu, popover | 150ms    | `--ease-out`, origin at trigger                   |
| Sheet, dialog enter  | 200ms    | `--ease-out`                                      |
| Sheet, dialog exit   | 160ms    | `--ease-out`                                      |
| Landing demo rows    | 240ms    | `--ease-in-out` `cubic-bezier(0.77, 0, 0.175, 1)` |

Enter from `scale(0.97)` and `opacity: 0`, never from `scale(0)`. Exits are faster than enters. Hover motion is gated behind `@media (hover: hover) and (pointer: fine)`. Under `prefers-reduced-motion`, keep opacity and color changes and remove every transform.

## States

Every surface designs all of these before shipping:

- Empty: what appears here later and what to do now.
- Loading: the button keeps its label. Progress text uses mono. Nothing shifts layout.
- Sparse and dense: one row and forty rows both look intentional.
- Error: message next to the control that caused it, plus a retry when one exists.
- Disabled: opacity 0.5 and a 13px reason underneath when the reason is not obvious.
- Demo: the header shows Demo. Controls change local state only. Never label demo data as connected.

## Page compositions

**Landing.** Header (wordmark, Pricing, Sign in). Hero in two columns above 1024px: left, display headline, one sentence, Connect with Google, the data notice, one footnote line; right, the demo. Below, three numbered steps as one hairline list, one sentence each. Then four questions as native `details`. Footer. Nothing else: no trust strip, manifesto, testimonials, logos, or plan card.

**Login.** Centered 360px column: mark, title Sign in, one sentence, Connect with Google, the data notice, privacy link. Connection errors appear above the button.

**Pricing.** A catalog, never an account panel. Title Pricing, one sentence, one bordered card per plan with the price in display mono, bullets, and one action: Start trial, Choose, Current plan, or Switch. The required trial and billing terms follow. One line about self-hosting. Subscription state (trial dates, usage, cancel, refresh) lives in Settings, not here.

**Privacy.** Reading width. Title, then headings and paragraphs. Content is a legal record; restyle only.

**Workspace shell.** 56px header: wordmark left, Sign out or Demo right. Tab row: Inbox, Accounts, Allowlist, Settings. Pricing is reached from Settings, never from a tab. Content max 880px. Global text is limited to an error banner when an action fails, a paused-plan notice, and one allowance line.

**Inbox.** Title Inbox with account picker. One hairline list of accounts with status and controls. Filter row: Moved, Kept, Suggested with mono counts. Decision list, two lines per row, chevron. Row opens a sheet with the reason and the actions.

**Accounts.** Title Accounts. Hairline list, one row per account: address in mono, status, controls, a collapsed Options row with Check now, Only suggest, Disconnect, Delete Gmail data, and the last check time. Add account below, only while the plan has room for another mailbox. At the limit, one sentence names the limit and links to Change plan. Never show a Connect button the server will reject.

**Allowlist.** Title Allowlist, Allow sender button. List of addresses in mono with a remove button. Empty state explains what an allowed sender does.

**Settings.** Title Settings with account picker. Subscription first: plan and price, one status sentence, one mono usage line, an over-limit alert when relevant, Manage subscription and Refresh status, and a Change plan link to Pricing. Then one hairline list of three switches, the preferences textarea with Save, and a footer row with Privacy and GitHub.

## Accessibility

Native elements first. Every icon-only control has an `aria-label`. Focus is visible on everything, 2px `--gray-600` ring, and nothing sticky covers it. Hit targets are 36px minimum on desktop and 44px on touch. Status is text plus color, never color alone. Live regions are `polite`. Skip link on every page. Contrast meets WCAG AA on black; check `--gray-900` on `--background-2` when adding new text.

## Honesty

Never label sample data as a connected inbox. Show the last check time separately from the connection state. A configured notification hook is not proof that processing works. Counts describe the loaded view. Never present model confidence as measured accuracy.

## Hard rejects

These are the reflexes that make generated interfaces look generated. Remove them on sight.

- All-caps eyebrows, kickers, step numbers as decoration, italic marginalia.
- A description sentence under every title.
- Cards inside cards. Icon tiles. Metric boxes.
- A reassurance footnote under a list.
- Gradients, glass, glows, drop shadows on flat surfaces, colored backgrounds for sections.
- Pill badges for ordinary metadata.
- Serif display type, decorative arrows, emoji.
- Centered marketing hero with a three-card feature grid.
- Animation on hover, on scroll, or on route change.
- A light theme, a theme toggle, or `prefers-color-scheme` branches.
- Hard-coded colors outside `globals.css`.

## Review checklist

Before opening a pull request that touches the interface:

- Every color comes from a token. `grep -n "#[0-9a-f]\{3,6\}" src --include=*.tsx` returns only the Google mark.
- Every page has exactly one `h1` and it is 1 to 3 words.
- Every surface has one `default` button at most.
- Every status shows text next to its color.
- Every list is one bordered group with hairline rows.
- Every transition names its properties and stays under 300ms.
- The required Google data notice sits next to every Connect button, unchanged.
- `npm run check` passes.
