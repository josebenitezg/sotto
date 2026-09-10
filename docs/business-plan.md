# Sotto: plan de negocio

Fecha: 10 de septiembre de 2026. Propuesta de lanzamiento; los números son hipótesis para validar, no resultados observados.

## Producto y cliente

Sotto aparta las propuestas comerciales no solicitadas y permite seguir trabajando en Gmail. Explica cada decisión y permite deshacerla. El primer cliente es una persona con responsabilidad de compra —fundadores, ejecutivos y operadores— que recibe suficientes propuestas comerciales como para perder tiempo revisándolas todos los días.

La promesa inicial es concreta: menos interrupciones, con control sobre lo que se aparta. No prometer una precisión medida ni horas ahorradas hasta contar con evidencia de uso real. Conservar en la bandeja los mensajes inciertos y priorizar evitar falsos positivos sobre maximizar el volumen apartado.

## Oferta inicial

| Oferta         | Precio propuesto          | Incluye                                                                                   |
| -------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| Sotto alojado  | US$9 por persona al mes   | Hasta 2 cuentas Gmail, clasificación con IA, preferencias por cuenta, registro y deshacer |
| Prueba         | 3 días                    | La misma experiencia; una prueba por espacio de usuario                                   |
| Código abierto | Sin licencia de pago, MIT | Instalación propia; infraestructura, modelos y configuración a cargo del operador         |

Una sola oferta mensual al comienzo. Evitar planes anuales, descuentos permanentes y compromisos de uso ilimitado hasta conocer retención y costo de clasificación. El cobro corresponde al alojamiento y la operación del servicio; el código sigue abierto.

La cuenta de Stripe elegida por el fundador es Perception Technologies Inc. Confirmar su identidad comercial y datos públicos en Checkout antes de abrir ventas. El precio de US$9 es una propuesta, aún no un precio publicado en Stripe.

## Experiencia de prueba

1. Ingresar con Google y vincular la cuenta, con los permisos explicados antes del consentimiento.
2. Activar la prueba cuando la conexión esté lista para utilizarse. Una pantalla de precios o un registro incompleto no consume los tres días.
3. Revisar una muestra y decidir si habilitar el filtrado automático. Las decisiones inciertas siguen en la bandeja.
4. Mostrar la fecha exacta de fin y las condiciones del cobro. La opción inicial recomendada es no exigir tarjeta; está pendiente la preferencia del fundador.
5. Al vencer sin suscripción activa, detener clasificación y nuevos movimientos. Mantener consulta del historial, desconexión y restauración de mensajes disponibles.
6. Permitir gestionar pago y cancelación desde Stripe. No reiniciar pruebas por reconectar una cuenta o repetir un enlace.

El inicio y vencimiento deben comprobarse en el servidor y en los trabajadores de correo. Un botón de pago o una redirección exitosa no constituyen prueba de suscripción: se verifica el estado firmado de Stripe.

## Posicionamiento

Competir con foco y confianza: una función principal bien ejecutada, una interfaz tranquila y el código auditable. Inbox Zero publica un plan Starter de US$20 por usuario/mes y una prueba de siete días, con un conjunto más amplio de funciones. El selector de facturación puede cambiar el importe final; volver a comprobarlo al comparar ofertas comerciales. Sotto debe validar si la menor amplitud y el precio propuesto resultan atractivos, sin dar por hecho que el precio más bajo garantiza conversión. [Fuente: precios oficiales de Inbox Zero](https://www.getinboxzero.com/pricing).

## Economía por cliente

Modelo de sensibilidad, no proyección financiera. Supone una cuenta de Stripe de EE. UU., tarjeta doméstica y tarifa estándar: Payments 2,9% + US$0,30 y Billing 0,7% del volumen. Confirmar las tarifas efectivas de la cuenta; tarjetas internacionales, conversión, impuestos, disputas y condiciones particulares pueden cambiarlas. [Payments](https://stripe.com/pricing), [Billing](https://support.stripe.com/questions/billing-customer-portal).

| Variable mensual por cliente                 | Caso bajo | Caso base | Caso alto |
| -------------------------------------------- | --------: | --------: | --------: |
| Ingreso                                      |   US$9,00 |   US$9,00 |   US$9,00 |
| Payments + Billing estimados                 |  US$0,624 |  US$0,624 |  US$0,624 |
| IA e infraestructura variable, supuesto      |   US$0,50 |   US$1,50 |   US$4,00 |
| Contribución antes de costos fijos y soporte |  US$7,876 |  US$6,876 |  US$4,376 |
| Margen de contribución                       |     87,5% |     76,4% |     48,6% |

Con 100 suscriptores, el caso base produce US$900 de ingreso recurrente mensual y aproximadamente US$687,60 antes de costos fijos, soporte, impuestos y adquisición. Con 1.000, US$9.000 y US$6.876 respectivamente. No son metas de ventas ni pronósticos.

Usar un presupuesto inicial de costos fijos de US$100/mes como supuesto de planificación: requeriría unos 15 clientes del caso base para cubrirlo, excluyendo trabajo humano. Medir costo por cuenta, tokens, reintentos y percentil 95 de consumo antes de fijar límites comerciales. Una prueba que cuesta US$0,20 y convierte 10% agrega US$2 por cliente adquirido; con conversión 5%, agrega US$4. Ambos valores son escenarios hipotéticos.

## Adquisición y validación

Primer grupo: 10–20 personas invitadas con bandejas laborales saturadas. Demostración con correos ficticios, incorporación asistida y revisión explícita de los primeros resultados. No usar sus mensajes ni sus nombres como material comercial sin autorización.

Canales iniciales: red del fundador, repositorio y documentación de instalación, demostraciones cortas y contenido sobre recuperar control de la bandeja. No comprar anuncios hasta observar conversión y retención. No enviar campañas desde esta implementación.

Objetivos de aprendizaje de las primeras seis semanas:

- Al menos 20 pruebas completas y 10 conversaciones de devolución.
- Medir conexión iniciada → Gmail conectado → primera decisión útil → prueba activada → pago.
- Objetivo provisional de activación: 60% de quienes conectan Gmail revisan una decisión el primer día.
- Hipótesis de conversión: 10–20% de las pruebas activadas. Revisar precio, duración y onboarding si la muestra no apoya esta hipótesis.
- Medir cancelación a 30 días por cohorte y motivos antes de calcular valor de vida del cliente.
- Registrar restauraciones, quejas y correos relevantes apartados. Las restauraciones son una señal imperfecta, no una tasa de error completa.

## Condiciones de lanzamiento

El repositorio comenzó como una instalación para un único dueño. La versión alojada necesita separación entre usuarios, autorización en cada operación, facturación por usuario y controles de acceso en el trabajador antes de abrir registros.

Google OAuth, acceso de Gmail y entrega real de eventos deben funcionar primero. La publicación con permisos restringidos de Gmail puede requerir verificación y evaluación de seguridad; completar el proceso aplicable antes de distribuir públicamente el servicio. [Google: verificación de permisos restringidos](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

El alojamiento actual usa Vercel Hobby. Vercel limita ese plan a uso personal no comercial: pasar a un plan apto para uso comercial antes de vender el servicio. No se ha contratado una mejora de plan como parte de este documento. [Condiciones del plan Hobby](https://vercel.com/docs/plans/hobby).

Verificar en sandbox: prueba de exactamente tres días, vencimiento, pago, cancelación, reintentos y eventos duplicados; comprobar que un usuario no puede acceder al correo o la facturación de otro. Publicar términos y privacidad con la identidad real del operador. El checkout de producción debe permanecer cerrado mientras Gmail o la facturación no puedan entregar el servicio anunciado.

## Siguientes decisiones

- Confirmar precio y modalidad de tarjeta para la prueba.
- Autorizar el MCP de Stripe en Perception Technologies Inc. y verificar el entorno seleccionado.
- Terminar Google y ejecutar el piloto personal.
- Probar el ciclo completo en Stripe antes de habilitar ventas reales.
- Revisar las hipótesis con los primeros 20 usuarios, especialmente confianza, conversión y costo.
