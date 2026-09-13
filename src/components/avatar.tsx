import { User } from "lucide-react";
import type { Viewer } from "@/lib/types";
import { cn } from "@/lib/utils";

/* 28px circle. Google picture when we have one, otherwise the first letter. */
export function Avatar({
  viewer,
  className,
}: {
  viewer: Pick<Viewer, "email" | "name" | "picture">;
  className?: string;
}) {
  // Array.from keeps an emoji or accented first character whole.
  const initial = Array.from(viewer.name || viewer.email || "")[0] ?? "";
  return viewer.picture ? (
    // Google avatar URLs are not on an allowlisted next/image host; a plain
    // img with no referrer is what Google expects for these.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={viewer.picture}
      alt=""
      width={28}
      height={28}
      referrerPolicy="no-referrer"
      className={cn(
        "size-7 shrink-0 rounded-full bg-gray-100 object-cover",
        className,
      )}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-medium text-foreground uppercase",
        className,
      )}
    >
      {initial || <User size={14} strokeWidth={1.75} />}
    </span>
  );
}
