import Link from "next/link";

export function GoogleDataNotice({ id }: { id: string }) {
  return (
    <p id={id} className="text-xs leading-5 text-muted-foreground">
      Sotto reads your Gmail to organize it. When AI is needed, it sends OpenAI
      the sender, subject, up to 16,000 characters of text, your email address,
      and your preferences. It does not open attachments or links, send emails,
      or delete them. By continuing, you authorize this use; you can pause or
      disconnect your account.{" "}
      <Link href="/privacy" className="underline underline-offset-4">
        How we use your data
      </Link>
      .
    </p>
  );
}
