"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import type { PlanId } from "@/lib/plans";

export function BillingAction({
  action,
  children,
  disabled = false,
  secondary = false,
  plan,
}: {
  action: "checkout" | "portal" | "refresh";
  children: React.ReactNode;
  disabled?: boolean;
  secondary?: boolean;
  plan?: PlanId;
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
            headers: {
              accept: "application/json",
              "content-type": "application/json",
            },
            body: JSON.stringify({ plan }),
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
        aria-busy={busy}
        type="submit"
      >
        {children}
      </Button>
      {error && (
        <p role="alert" className="mt-3 max-w-[55ch] text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function RefreshAfterCheckout({ confirmed }: { confirmed: boolean }) {
  const router = useRouter();
  const done = useRef(false);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(true);
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
      .catch(() => setError(true))
      .finally(() => setChecking(false));
  }, [router]);
  if (confirmed) return null;
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-muted-foreground">
        {checking
          ? "Confirming your subscription…"
          : error
            ? "We could not confirm your subscription yet. Please try again."
            : "Your subscription confirmation is still pending. Check again in a moment."}
      </p>
      {!checking && (
        <BillingAction action="refresh" secondary>
          Check again
        </BillingAction>
      )}
    </div>
  );
}
