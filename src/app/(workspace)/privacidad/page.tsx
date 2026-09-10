import Link from "next/link";
export default function PrivacyPage() {
  return (
    <article className="max-w-[65ch] space-y-6">
      <Link
        href="/ajustes"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        Volver a ajustes
      </Link>
      <h1 className="text-[28px] leading-8 font-semibold tracking-tight">
        Tu correo es tuyo.
      </h1>
      <p className="text-muted-foreground">
        Sotto es una herramienta de código abierto que se instala en una cuenta
        de infraestructura controlada por su operador. No hay un servicio
        central de Sotto que reciba el correo de todas las instalaciones.
      </p>
      <h2 className="text-base font-semibold">Qué se consulta</h2>
      <p className="text-muted-foreground">
        Remitente, asunto, texto, etiquetas y contexto de conversación. También
        se consulta si ya le escribiste al remitente. Los adjuntos, enlaces e
        imágenes remotas no se abren.
      </p>
      <h2 className="text-base font-semibold">Qué se guarda</h2>
      <p className="text-muted-foreground">
        La conexión cifrada con Google, las reglas, los identificadores de
        correo, remitente, asunto y el registro de decisiones. Sotto no guarda
        el cuerpo completo de tus correos. Los registros de decisiones se
        conservan hasta que el operador los elimine conforme a su política de
        retención.
      </p>
      <h2 className="text-base font-semibold">
        Cuándo se usa inteligencia artificial
      </h2>
      <p className="text-muted-foreground">
        Los correos que las reglas de protección no resuelven se envían al
        proveedor configurado. Esta versión utiliza modelos de OpenAI,
        directamente o a través de AI Gateway de Vercel según la instalación.
        Reciben el remitente, asunto, tus preferencias y un fragmento acotado
        del texto. Solicitamos no almacenar la respuesta en el servicio; esto no
        equivale a una garantía de retención cero del proveedor. Revisá su
        política y la de tu organización antes de conectar correo de trabajo.
      </p>
      <h2 className="text-base font-semibold">Qué permiso pide Google</h2>
      <p className="text-muted-foreground">
        Google agrupa lectura, modificación y envío en el permiso necesario para
        cambiar etiquetas. Sotto usa ese acceso para leer y organizar mensajes;
        no implementa funciones para enviar, eliminar o marcar mensajes como
        leídos.
      </p>
      <h2 className="text-base font-semibold">Pausar o desconectar</h2>
      <p className="text-muted-foreground">
        Podés pausar una cuenta, desconectarla o revocar el permiso desde tu
        Cuenta de Google. Desconectarla detiene el procesamiento y borra su
        credencial local; no elimina los correos, etiquetas o decisiones
        anteriores.
      </p>
      <p className="text-xs text-muted-foreground">
        Última actualización: septiembre de 2026. El operador de cada
        instalación es responsable de su configuración y tratamiento de datos.
      </p>
    </article>
  );
}
