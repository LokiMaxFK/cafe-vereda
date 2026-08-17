# Impresora térmica por estación

La pantalla **Configuración → Configurar y probar** conecta el POS a QZ Tray y a las impresoras que Windows tenga instaladas. La impresora seleccionada se guarda por estación; el diseño del ticket se comparte para todo el café cuando Supabase está configurado.

## Preparar la Suzwip de 58 mm en Windows

1. Conecta la impresora por USB y enciéndela.
2. Instala **58MM Thermal Printer Driver & Tools** y confirma que Windows muestre una impresora en *Configuración → Bluetooth y dispositivos → Impresoras y escáneres*.
3. Desde Windows, imprime una página de prueba y configura el tamaño de papel de 58 mm cuando el driver lo permita.
4. Instala y abre [QZ Tray](https://qz.io/download) en la misma computadora.
5. En el POS, entra a **Configuración → Configurar y probar**, pulsa **Conectar QZ Tray**, selecciona la impresora encontrada, confirma el ancho útil de 48 mm para papel de 58 mm y guarda.
6. Imprime una comanda y un ticket de prueba. Confirma que los acentos, las notas y los importes se lean completos.

## QZ Tray sin avisos de permiso

### Solución inmediata por estación

Cuando aparezca el cuadro de QZ Tray, marca **Remember this decision** y presiona **Allow**. QZ recordará el permiso para esa computadora e impresora.

### Impresión silenciosa segura para producción

La aplicación incluye soporte para firmar los trabajos de QZ y quitar el estado `Anonymous / Untrusted`. Esto requiere un certificado de QZ Tray y no se debe resolver guardando la llave privada en el navegador.

1. Obtén `digital-certificate.txt` y `private-key.pem` (PKCS#8 de 2048 bits) desde el portal de QZ Tray. Para certificados confiables en producción, QZ requiere un plan que permita generar el certificado. El certificado público puede estar en el frontend; la llave privada no.
2. Agrega el contenido completo de `digital-certificate.txt` en `VITE_QZ_CERTIFICATE` de `.env.production`, usando `\n` para los saltos de línea.
3. Guarda la llave PEM únicamente como secreto `QZ_PRIVATE_KEY` de Supabase.
4. Despliega la función `qz-sign` y aplica las migraciones de Supabase, incluidas `branch_settings` y sus políticas.
5. Publica una nueva compilación del frontend. Cada trabajo será firmado por la Edge Function solo para personal autenticado y activo.

Nunca agregues `QZ_PRIVATE_KEY` a `.env`, `VITE_*`, el repositorio ni Hostinger. Sin certificado/llave, QZ seguirá solicitando autorización por seguridad.

### Prueba sin compra, en una sola computadora

QZ permite crear un certificado de demostración, confiable solo en la PC donde se genera. En esa PC abre **QZ Tray → Advanced → Site Manager → + → Create New** y acepta la instalación del certificado. QZ dejará en el Escritorio una carpeta `QZ Tray Demo Cert` con `digital-certificate.txt` y `private-key.pem`. Puedes usar esos mismos dos archivos en los pasos anteriores para probar la firma; no se deben usar para otras estaciones ni como configuración de producción.

## Notas operativas

- La primera conexión de QZ Tray puede pedir autorización; esta fase usa QZ sin firma para permitir la prueba física.
- La prueba no crea órdenes ni pagos reales.
- Si el contenido se corta a la derecha, reduce el **ancho útil de impresión** de 48 mm a 47 o 46 mm; si queda demasiado pequeño, usa texto normal o grande. Si el driver ofrece 80 mm, cambia el ancho desde la pantalla y vuelve a probar.
- En **Contenido del ticket final** puedes usar el botón **Usar logo Café Vereda** o cargar una imagen PNG/JPG de hasta 500 KB, escribir el texto de despedida y elegir los datos visibles por artículo.
- En el campo **URL para código QR** escribe una dirección `https://` o `http://`. El POS genera el QR en blanco y negro y lo incrusta en el ticket para que imprima aunque no haya internet al momento de cobrar.
- El diseño guardado por gerencia se aplica a tickets en todas las estaciones conectadas. Cada estación conserva su propio nombre de impresora.
- El envío de trabajos desde móviles/tablets a la estación central se implementará en una fase posterior con una cola de impresión.
