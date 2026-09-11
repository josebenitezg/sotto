"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-[28px] leading-8 font-semibold">
        We could not open your workspace.
      </h1>
      <p className="mt-3 text-muted-foreground">
        Check this installation's connection and try again.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
