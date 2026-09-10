import Link from "next/link";
export default function PrivacyPage() {
  return (
    <main id="contenido" className="public-document space-y-6">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        Volver al inicio
      </Link>
      <h1 className="text-[28px] leading-8 font-semibold tracking-tight">
        Tu correo es tuyo.
      </h1>
      <p className="text-muted-foreground">
        Sotto es una herramienta de código abierto para organizar Gmail. El
        servicio de sotto.email es operado por Perception Technologies Inc. y
        procesa los datos en la infraestructura de esta instalación. Si instalás
        tu propia copia, vos elegís y controlás los proveedores. Cada
        instalación mantiene su propia base de datos.
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
        Los correos que las protecciones no resuelven se clasifican con OpenAI.
        En sotto.email, la conexión con OpenAI es directa. Recibe el remitente,
        el asunto, la dirección de la cuenta destinataria, tus preferencias y
        hasta 16.000 caracteres de texto normalizado. Solicitamos no almacenar
        la respuesta en el servicio; esto no equivale a una garantía de
        retención cero del proveedor. Si instalás tu propia copia, revisá qué
        proveedor configuraste. Revisá también la política de tu organización
        antes de conectar correo de trabajo.
      </p>
      <h2 className="text-base font-semibold">Suscripciones y pagos</h2>
      <p className="text-muted-foreground">
        Cuando la suscripción está habilitada, Stripe procesa los pagos y recibe
        tu correo de cuenta y un identificador de tu espacio. No enviamos a
        Stripe tus mensajes. Sotto guarda los identificadores y el estado de la
        suscripción; no guarda los datos de tu tarjeta.
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
        credencial local, incluso si Google no responde al intento de revocar el
        acceso. Podés comprobar o revocar ese permiso directamente en{" "}
        <a
          href="https://myaccount.google.com/connections"
          className="underline underline-offset-4"
        >
          las conexiones de tu Cuenta de Google
        </a>
        . Desconectar no elimina los correos, las etiquetas ni el registro de
        decisiones de Sotto.
      </p>
      <p className="text-xs text-muted-foreground">
        Última actualización: septiembre de 2026. El operador de cada
        instalación es responsable de su configuración y tratamiento de datos.
      </p>
    </main>
  );
}
