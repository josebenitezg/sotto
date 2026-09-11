import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Github,
  Undo2,
} from "lucide-react";
import { GoogleMark, SottoMark } from "@/components/brand";
import { InboxPreview } from "@/components/inbox-preview";
import { GoogleDataNotice } from "@/components/google-data-notice";
import { configured, isDemo } from "@/lib/server/config";
import { sessionWorkspace } from "@/lib/server/auth";

const questions = [
  [
    "Does Sotto replace Gmail?",
    "No. Keep using Gmail as usual. Sotto moves unsolicited sales emails into a label you can check whenever you like.",
  ],
  [
    "How does it decide what to move?",
    "AI considers each message, the conversation, and your preferences. Connecting starts filtering the last 7 days of your inbox, then new emails. Uncertain messages stay in your inbox.",
  ],
  [
    "What if it moves something important?",
    "See the reason for each decision, return the email to your inbox, and add the sender to your allowlist. Sotto does not delete messages or mark them as read.",
  ],
  [
    "What happens to my data?",
    "Sotto reads the email data needed for classification and sends a limited portion to the AI provider. It does not store full message bodies or open attachments. Our privacy policy explains the permissions, providers, and data we store.",
  ],
];

export default async function LandingPage() {
  const ready = configured() && !isDemo();
  const signedIn = ready && !!(await sessionWorkspace());
  return (
    <main id="content">
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="quiet-dot" />
            Fewer cold emails. More calm.
          </div>
          <h1 className="display-title">
            Your inbox,
            <br />
            <em>a little quieter.</em>
          </h1>
          <p className="hero-description">
            Keep the conversations that matter in view.
            <br className="hidden lg:block" />
            Give unsolicited pitches a place of their own.
            <br />
            Let Sotto take care of the noise.
          </p>
          {signedIn ? (
            <Link href="/review" className="google-cta pressable">
              Open my inbox
              <ArrowRight size={16} />
            </Link>
          ) : (
            <form
              action="/api/google/connect"
              method="post"
              className="hero-connect"
            >
              <input type="hidden" name="intent" value="filter" />
              <div className="mb-4 max-w-md">
                <GoogleDataNotice id="hero-permission" />
              </div>
              <button
                type="submit"
                className="google-cta pressable"
                disabled={!ready}
                aria-describedby="hero-permission hero-google-status"
              >
                <span className="google-cta-icon">
                  <GoogleMark />
                </span>
                Connect with Google
                <ArrowRight size={16} />
              </button>
            </form>
          )}
          <p id="hero-google-status" className="hero-footnote">
            {ready
              ? "For Gmail and Google Workspace."
              : "Google sign-in is coming soon."}
          </p>
          <a href="#how-it-works" className="hero-discover">
            A small change to your day
            <ArrowDown size={14} />
          </a>
        </div>
        <div className="hero-product">
          <div className="product-margin-note">
            Not everything needs your attention.
            <span aria-hidden="true">↴</span>
          </div>
          <InboxPreview />
        </div>
      </section>
      <div className="landing-trust">
        <span>
          <SottoMark className="size-4" />
          AI that considers the context
        </span>
        <span>
          <Undo2 size={14} />
          Every move can be undone
        </span>
        <a href="https://github.com/josebenitezg/sotto">
          <Github size={14} />
          Open source, inside and out <ArrowUpRight size={12} />
        </a>
      </div>
      <section id="how-it-works" className="how-section">
        <div className="section-intro">
          <p className="section-kicker">Keep it simple</p>
          <h2 className="display-heading">
            A place for every email.
            <br />
            <em>A little room for you.</em>
          </h2>
        </div>
        <div className="how-grid">
          <article>
            <span className="step-number">01</span>
            <h3>Connect your Gmail.</h3>
            <p>
              Work, personal, or both. Your email stays right where it belongs.
            </p>
          </article>
          <article>
            <span className="step-number">02</span>
            <h3>Let Sotto sort it.</h3>
            <p>
              AI checks the last 7 days of your inbox and keeps watching for new
              mail. Uncertain messages stay in your inbox.
            </p>
          </article>
          <article>
            <span className="step-number">03</span>
            <h3>Get back to your day.</h3>
            <p>
              Find cold outreach under Sotto/Cold in Gmail. Pause anytime, and
              undo any move.
            </p>
          </article>
        </div>
      </section>
      <section className="quiet-manifesto">
        <SottoMark className="size-10" />
        <p>
          You already have an inbox.
          <br />
          Give yours room to
          <em>breathe.</em>
        </p>
        <span>Fewer interruptions. The same Gmail.</span>
      </section>
      <section className="landing-bottom">
        <div className="faq-section">
          <p className="section-kicker">Before you begin</p>
          <h2 className="display-heading">
            A little clarity.
            <br />
            <em>A few answers.</em>
          </h2>
          <div className="faq-list">
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
        <aside className="landing-plan">
          <SottoMark className="size-8" />
          <p className="mt-5 text-sm">One plan. More room.</p>
          <h2 className="display-heading mt-4">
            3 days
            <br />
            <em>to try it out.</em>
          </h2>
          <ul className="my-6 space-y-3 text-sm">
            {[
              "Up to two Gmail accounts",
              "Review and automatic filtering",
              "Your email, under your control",
            ].map((text) => (
              <li key={text} className="flex items-center gap-2">
                <Check size={15} />
                {text}
              </li>
            ))}
          </ul>
          <Link href="/pricing" className="plan-link pressable">
            Explore the plan
            <ArrowUpRight size={16} />
          </Link>
          <p className="mt-4 text-xs leading-5 opacity-75">
            We are getting access ready.
            <br />
            Your trial starts when you activate it.
          </p>
        </aside>
      </section>
    </main>
  );
}
