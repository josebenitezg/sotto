import Link from "next/link";

export function GoogleDataNotice({ id }: { id: string }) {
  return (
    <p id={id} className="text-xs leading-5 text-muted-foreground">
      Sotto lee tu Gmail para organizarlo. Cuando necesita IA, envía a OpenAI el
      remitente, el asunto, hasta 16.000 caracteres de texto, tu dirección de
      correo y tus preferencias. No abre adjuntos ni enlaces, ni envía o borra
      correos. Al continuar, autorizás este uso; podés pausar o desconectar tu
      cuenta.{" "}
      <Link href="/privacidad" className="underline underline-offset-4">
        Cómo usamos tus datos
      </Link>
      .
    </p>
  );
}
