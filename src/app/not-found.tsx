import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-[28px] leading-8 font-semibold">
        Esta página no está.
      </h1>
      <Button className="mt-6" asChild>
        <Link href="/revision">Volver a revisión</Link>
      </Button>
    </main>
  );
}
