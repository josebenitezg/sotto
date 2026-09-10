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
        el cuerpo completo de tus correos. Podés eliminar los datos de una
        conexión Gmail desde Cuentas, como se explica más abajo.
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
      <h2 className="text-base font-semibold">Uso limitado de tus datos</h2>
      <p className="text-muted-foreground">
        Usamos los datos de Google únicamente para conectar tu cuenta,
        clasificar y organizar el correo que elegís, mostrar las decisiones y
        permitirte corregirlas. El uso y la transferencia de información
        obtenida de las APIs de Google cumplen la{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="underline underline-offset-4"
        >
          Política de Datos de Usuario de los Servicios API de Google
        </a>
        , incluidos sus requisitos de uso limitado (Limited Use).
      </p>
      <p className="text-muted-foreground">
        No vendemos tus datos ni los usamos para publicidad, evaluación
        crediticia o entrenamiento de modelos de IA de propósito general. La
        clasificación usa un modelo existente; no entrena uno con tus correos.
        La compartición de entradas y salidas de la API con OpenAI para
        entrenamiento está desactivada en esta instalación. El acceso humano a
        contenido requiere tu autorización específica, salvo cuando sea
        necesario por seguridad o para cumplir la ley.
      </p>
      <h2 className="text-base font-semibold">Proveedores y conservación</h2>
      <p className="text-muted-foreground">
        Google gestiona el acceso a Gmail y sus avisos de cambios. Vercel aloja
        Sotto y su cola de procesamiento; Neon almacena las conexiones cifradas
        y los registros de la aplicación; OpenAI recibe los datos necesarios
        para clasificar. Estos proveedores procesan información para prestar el
        servicio. No enviamos cuerpos de correo a la cola ni al sistema de
        pagos.
      </p>
      <p className="text-muted-foreground">
        Conservamos la credencial hasta que desconectás o eliminás los datos de
        Gmail. El historial, las preferencias y los identificadores de trabajos
        se conservan hasta que los eliminás: permiten revisar decisiones,
        deshacer movimientos y evitar procesar dos veces un mensaje. Desconectar
        conserva ese historial; eliminar los datos de Gmail lo borra de la base
        activa. La identidad de acceso y el plan se conservan hasta que
        solicites eliminar tu cuenta de Sotto mediante el contacto de
        privacidad.
      </p>
      <p className="text-muted-foreground">
        Las sesiones vencen a los siete días y los intentos de conexión a los
        diez minutos. La limpieza diaria retira las sesiones e intentos vencidos
        y los avisos de Gmail procesados hace más de siete días. Los trabajos
        pendientes de la cola de Vercel contienen sólo un identificador de
        cuenta y vencen en un máximo de 24 horas; después de eliminar la
        conexión no pueden acceder a ese Gmail.
      </p>
      <p className="text-muted-foreground">
        OpenAI puede conservar registros de prevención de abuso durante un
        máximo habitual de 30 días, con las excepciones legales y de seguridad
        indicadas en sus{" "}
        <a
          href="https://developers.openai.com/api/docs/guides/your-data"
          className="underline underline-offset-4"
        >
          controles de datos
        </a>
        . Solicitar que no se almacene la respuesta no elimina esa retención.
        Las copias de seguridad y los registros operativos de los proveedores
        pueden persistir tras el borrado de la base activa conforme a sus
        condiciones de conservación; una solicitud de eliminación completa
        también se revisa respecto de esos datos.
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
        <strong>Eliminar datos de Gmail.</strong> En Cuentas, esta acción pide
        confirmar la dirección y elimina de la base de datos activa la conexión,
        credencial, preferencias, remitentes permitidos, decisiones, trabajos y
        eventos de esa cuenta. Detiene su procesamiento aunque falle la
        revocación en Google. Los correos y etiquetas quedan como están en
        Gmail; al borrar el historial ya no se pueden deshacer movimientos desde
        Sotto. Se conserva la identidad mínima que vincula tu acceso con tu
        espacio, la fecha de este borrado para impedir reconexiones iniciadas
        antes de la solicitud, el correo de tu espacio y los datos del plan.
        Otras cuentas no se eliminan. Volver a conectar Google autoriza una
        nueva revisión. Esta función no solicita el borrado de registros que los
        proveedores puedan conservar conforme a sus propias políticas.
      </p>
      <p className="text-xs text-muted-foreground">
        Para soporte, consultas de privacidad o solicitudes de eliminación de
        datos de sotto.email, escribí a{" "}
        <a
          href="mailto:support@sotto.email"
          className="underline underline-offset-4"
        >
          support@sotto.email
        </a>
        .
      </p>
      <p className="text-xs text-muted-foreground">
        Última actualización: septiembre de 2026. El operador de cada
        instalación es responsable de su configuración y tratamiento de datos.
      </p>
    </main>
  );
}
