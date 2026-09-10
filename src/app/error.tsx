"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-[28px] leading-8 font-semibold">
        No pudimos abrir tu espacio.
      </h1>
      <p className="mt-3 text-muted-foreground">
        Revisá la conexión de esta instalación e intentá de nuevo.
      </p>
      <Button className="mt-6" onClick={reset}>
        Volver a intentar
      </Button>
    </main>
  );
}
