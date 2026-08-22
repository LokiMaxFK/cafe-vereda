import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Sello de build visible en la app: permite comprobar de un vistazo si una estación
  // ya cargó el despliegue nuevo o sigue con el bundle viejo en caché.
  define: { __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")) },
  build: { sourcemap: true },
  server: { host: true }
});
