import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-[360px] px-6 py-24">
      <h1 className="text-2xl leading-8 font-semibold">Page not found</h1>
      <Button className="mt-6" variant="outline" asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  );
}
