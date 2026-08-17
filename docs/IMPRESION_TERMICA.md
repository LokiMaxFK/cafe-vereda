# Impresión térmica local

La pantalla **Configuración → Configurar y probar** utiliza la impresión nativa del navegador. No requiere QZ Tray, certificados, llaves privadas, extensiones ni un servicio local adicional.

El POS genera la comanda o el ticket dentro del navegador y abre el diálogo de impresión de Windows. El contenido no se envía a un proveedor de impresión.

## Preparar la Suzwip de 58 mm en Windows

1. Conecta la impresora por USB y enciéndela.
2. Instala el controlador **58MM Thermal Printer Driver & Tools** incluido por el fabricante.
3. Confirma que Windows muestre la impresora en **Configuración → Bluetooth y dispositivos → Impresoras y escáneres**.
4. Imprime una página de prueba desde Windows.
5. En el POS, entra a **Configuración → Configurar y probar** y conserva un ancho de papel de 58 mm y un ancho útil inicial de 48 mm.
6. Pulsa **Imprimir comanda** o **Imprimir ticket**.
7. En el diálogo del navegador, elige la Suzwip, desactiva encabezados y pies de página, usa márgenes en cero y selecciona el tamaño de papel térmico del controlador.

Chrome suele recordar la última impresora y las preferencias elegidas para las siguientes impresiones del mismo perfil de Windows.

## Limitación del navegador

Los navegadores no permiten que una página web seleccione una impresora ni imprima silenciosamente. El diálogo de impresión debe ser confirmado por el operador. Esta restricción evita que un sitio web imprima sin permiso.

La aplicación no intenta detectar las impresoras instaladas. Windows muestra las disponibles en el diálogo y entrega el trabajo al controlador seleccionado.

## Notas operativas

- La prueba no crea órdenes ni pagos reales.
- Si el contenido se corta a la derecha, reduce el **ancho útil de impresión** de 48 mm a 47 o 46 mm.
- Si el driver ofrece únicamente papel de 80 mm, cambia el ancho desde la pantalla y vuelve a probar.
- Para comandas duplicadas, cambia **Copias** a 2 en el diálogo de impresión.
- En **Contenido del ticket final** puedes usar el logo de Café Vereda o cargar una imagen PNG/JPG de hasta 500 KB.
- El código QR queda incrustado en el ticket para poder imprimirlo aunque la conexión se interrumpa después de guardar el diseño.
- El diseño guardado por gerencia se comparte entre estaciones cuando Supabase está configurado; la impresora se elige localmente en cada computadora.
