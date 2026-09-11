import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-[28px] leading-8 font-semibold">
        This page could not be found.
      </h1>
      <Button className="mt-6" asChild>
        <Link href="/review">Back to review</Link>
      </Button>
    </main>
  );
}
