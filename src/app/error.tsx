"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-[360px] px-6 py-24">
      <h1 className="text-2xl leading-8 font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">
        Sotto could not open. Try again in a moment.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
