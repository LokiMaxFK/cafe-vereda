# Despliegue en Hostinger / cPanel

## Build de producción

1. Crea `.env.production` a partir de `.env.example`.
2. Define `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_AUTH_EMAIL_DOMAIN`.
3. Usa solamente la publishable key. Nunca agregues una secret key o `service_role` al frontend.
4. Ejecuta `npm ci` y `npm run build`.
5. Sube **el contenido** de `dist/` a `public_html/`, incluida la carpeta `assets` y `.htaccess`.

Activa el certificado SSL desde Hostinger y fuerza HTTPS desde el panel. Las rutas de React, la política de caché y los encabezados básicos ya están configurados en `public/.htaccess`.

## Actualización manual

Genera un nuevo `dist/`, respalda el contenido actual de `public_html` y reemplázalo por el nuevo build. Los assets tienen nombres versionados; `index.html` no queda cacheado de forma persistente.

## Actualización mediante repositorio

Conecta el repositorio desde el panel de despliegue de Hostinger, configura las tres variables como secretos del build y usa:

- Comando de instalación: `npm ci`
- Comando de build: `npm run build`
- Directorio de publicación: `dist`

## Alternativa VPS

`deploy/nginx.conf.example` conserva la misma estrategia de SPA y caché para una migración posterior a Nginx.
