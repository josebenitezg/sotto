import Link from "next/link";

export function GoogleDataNotice({ id }: { id: string }) {
  return (
    <p id={id} className="text-[13px] leading-[18px] text-muted-foreground">
      <Link
        href="/privacy"
        className="inline-block py-1 underline underline-offset-2 hover:text-foreground"
      >
        How we use your data
      </Link>
    </p>
  );
}
