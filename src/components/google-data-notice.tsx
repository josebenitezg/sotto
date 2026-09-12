import Link from "next/link";

export function GoogleDataNotice({ id }: { id: string }) {
  return (
    <p id={id} className="text-xs leading-4 text-muted-foreground">
      <Link
        href="/privacy"
        className="underline underline-offset-2 hover:text-foreground"
      >
        How we use your data
      </Link>
    </p>
  );
}
