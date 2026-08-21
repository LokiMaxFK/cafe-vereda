# Despliegue en Hostinger / cPanel

## Build de producción

1. Crea `.env.production` a partir de `.env.example`.
2. Define `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_AUTH_EMAIL_DOMAIN`.
3. Usa solamente la publishable key. Nunca agregues una secret key o `service_role` al frontend.
4. Ejecuta `npm ci` y `npm run build`.
5. Sube **el contenido** de `dist/` a `public_html/`, incluida la carpeta `assets` y `.htaccess`.

Activa el certificado SSL desde Hostinger y fuerza HTTPS desde el panel. Las rutas de React, la política de caché y los encabezados básicos ya están configurados en `public/.htaccess`.

## Base de datos: paso manual obligatorio tras aplicar las migraciones

Las migraciones de `supabase/migrations/` **no bastan por sí solas**. Hay una política que el rol de
migraciones no puede crear, porque `realtime.messages` pertenece a `supabase_realtime_admin`. Sin
ella, el canal `branch:main` —que la aplicación abre como privado— nunca llega a suscribirse, y el
punto de venta se queda **sin actualizaciones en vivo**: la barra no ve entrar una comanda nueva, el
salón no ve liberarse una mesa y quien cobra no ve que un plato ya salió. No aparece ningún error;
el indicador sigue diciendo «Todo sincronizado». Así se detectó en la revisión previa a la entrega (hallazgo **F16-05**): el proyecto llevaba
funcionando sin tiempo real desde la migración inicial, y nadie se había dado cuenta.

Tras aplicar las migraciones a un proyecto nuevo, ejecuta esto **una vez** desde el **SQL Editor**
del panel de Supabase:

```sql
create policy "authenticated receive branch broadcasts" on realtime.messages
  for select to authenticated using ((select realtime.topic()) = 'branch:main');
```

Para comprobar que quedó bien, abre la aplicación en dos ventanas con sesión iniciada y cambia algo
en una: debe reflejarse en la otra sin recargar. Para revertirlo,
`drop policy "authenticated receive branch broadcasts" on realtime.messages;`.

## Actualización manual

Genera un nuevo `dist/`, respalda el contenido actual de `public_html` y reemplázalo por el nuevo build. Los assets tienen nombres versionados; `index.html` no queda cacheado de forma persistente.

## Actualización mediante repositorio

Conecta el repositorio desde el panel de despliegue de Hostinger, configura las tres variables como secretos del build y usa:

- Comando de instalación: `npm ci`
- Comando de build: `npm run build`
- Directorio de publicación: `dist`

## Alternativa VPS

`deploy/nginx.conf.example` conserva la misma estrategia de SPA y caché para una migración posterior a Nginx.
