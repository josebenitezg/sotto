import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GoogleMark } from "@/components/brand";
import { InboxPreview } from "@/components/inbox-preview";
import { GoogleDataNotice } from "@/components/google-data-notice";
import { configured, isDemo } from "@/lib/server/config";
import { sessionWorkspace } from "@/lib/server/auth";

const steps = [
  ["Connect Gmail", "Work, personal, or both."],
  [
    "Sotto filters",
    "The last 7 days, then new mail. Uncertain messages stay in your inbox.",
  ],
  ["Check Sotto/Cold when you like", "Pause anytime. Undo any move."],
];

const questions = [
  [
    "Does Sotto replace Gmail?",
    "No. Cold sales emails move to a label in Gmail. Everything else is untouched.",
  ],
  [
    "How does it decide?",
    "AI reads the message, the conversation, and your preferences. When in doubt, the email stays.",
  ],
  [
    "What if it moves something important?",
    "Every move shows its reason. Return the email to your inbox and allow the sender in one step. Sotto never deletes or marks as read.",
  ],
  [
    "What happens to my data?",
    "Sotto reads what it needs to classify and sends a limited portion to the AI provider. Full bodies and attachments are not stored. See the privacy policy.",
  ],
];

export default async function LandingPage() {
  const ready = configured() && !isDemo();
  const signedIn = ready && !!(await sessionWorkspace());
  return (
    <main id="content" className="mx-auto w-full max-w-[1120px] px-6">
      <section className="grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="max-w-[520px]">
          <h1 className="text-[clamp(40px,5vw,60px)] leading-[1.02] font-semibold tracking-[-0.04em]">
            Your inbox,
            <br />
            <span className="text-muted-foreground">a little quieter.</span>
          </h1>
          <p className="mt-6 max-w-[42ch] text-base leading-6 text-muted-foreground">
            Sotto moves cold sales emails out of your Gmail inbox and shows you
            why. Everything else stays.
          </p>
          {signedIn ? (
            <Link
              href="/review"
              className="pressable mt-8 inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85"
            >
              Open Sotto
              <ArrowRight size={16} />
            </Link>
          ) : (
            <form
              action="/api/google/connect"
              method="post"
              className="mt-8 max-w-[420px]"
            >
              <input type="hidden" name="intent" value="filter" />
              <button
                type="submit"
                className="pressable inline-flex h-10 items-center gap-2.5 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-[120ms] hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50"
                disabled={!ready}
                aria-describedby="hero-permission hero-status"
              >
                <GoogleMark />
                Connect with Google
              </button>
              <p
                id="hero-status"
                className="mt-3 text-xs text-muted-foreground"
              >
                {ready
                  ? "For Gmail and Google Workspace."
                  : "Google sign-in is coming soon."}
              </p>
              <div className="mt-4">
                <GoogleDataNotice id="hero-permission" />
              </div>
            </form>
          )}
        </div>
        <InboxPreview />
      </section>

      <section aria-labelledby="how" className="py-16 md:py-24">
        <h2 id="how" className="text-2xl leading-8 font-semibold">
          How it works
        </h2>
        <ol className="hairline mt-6 rounded-md border">
          {steps.map(([title, detail], index) => (
            <li
              key={title}
              className="grid gap-1 px-4 py-4 sm:grid-cols-[40px_1fr_1.4fr] sm:items-baseline sm:gap-4"
            >
              <span className="mono text-xs text-muted-foreground">
                0{index + 1}
              </span>
              <span className="font-medium">{title}</span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {detail}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="faq" className="pb-24">
        <h2 id="faq" className="text-2xl leading-8 font-semibold">
          Questions
        </h2>
        <div className="hairline mt-6 border-y">
          {questions.map(([question, answer]) => (
            <details key={question} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-sm marker:hidden [&::-webkit-details-marker]:hidden">
                {question}
                <span
                  aria-hidden="true"
                  className="text-muted-foreground transition-transform duration-150 ease-(--ease-out) group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-[64ch] pb-5 text-[13px] leading-5 text-muted-foreground">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
