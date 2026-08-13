# Vereda Café · Punto de venta

Aplicación React + TypeScript + Vite para salón, comandas, cobros, caja, catálogo, personal, insumos y reportes. Conserva las operaciones locales con IndexedDB y una cola idempotente durante cortes de conexión. El service worker sólo mantiene caché técnica: la aplicación no incluye manifest ni experiencia instalable.

## Desarrollo

```bash
cp .env.example .env.local
npm install
npm run dev
```

Sin variables reales, inicia en modo demostración:

- Gerente: `gerente` / `2468`
- Barista: `ana` / `1234`

## Supabase

Aplica `supabase/migrations/20260812000000_initial_pos.sql` en un proyecto nuevo. Después crea usuarios internos desde un entorno seguro, asigna `app_metadata.role` y agrega su fila en `staff_profiles`. El frontend transforma el usuario visible en un email interno y usa el PIN como contraseña; no existe registro público.

Consulta [docs/DEPLOY_HOSTINGER.md](docs/DEPLOY_HOSTINGER.md) para publicar el build estático.
