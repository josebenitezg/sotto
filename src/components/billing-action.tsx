"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

export function BillingAction({
  action,
  children,
  disabled = false,
  secondary = false,
}: {
  action: "checkout" | "portal" | "refresh";
  children: React.ReactNode;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setError(null);
        try {
          const response = await fetch(`/api/billing/${action}`, {
            method: "POST",
            headers: { accept: "application/json" },
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(
              result.error || "We could not open your subscription.",
            );
          if (result.url) window.location.assign(result.url);
          else router.refresh();
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "Please try again.",
          );
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <Button
        size="lg"
        variant={secondary ? "outline" : "default"}
        disabled={disabled || busy}
        type="submit"
      >
        {busy ? "One moment…" : children}
      </Button>
      {error && (
        <p role="alert" className="mt-3 max-w-[55ch] text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function RefreshAfterCheckout() {
  const router = useRouter();
  const done = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    fetch("/api/billing/refresh", {
      method: "POST",
      headers: { accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        router.refresh();
      })
      .catch(() => setError(true));
  }, [router]);
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {error
        ? "Confirmation is pending. Use Refresh status to check again."
        : "We check your subscription directly with Stripe."}
    </p>
  );
}
