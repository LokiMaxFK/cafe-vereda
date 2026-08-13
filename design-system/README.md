# Vereda UI — kit extraído de Proyecto Virtud

Este directorio es una copia portátil del lenguaje visual y del layout de la aplicación. No importa Supabase, React Router, Zustand ni dominio del POS. Se puede copiar entero al próximo proyecto y adaptar la marca sin arrastrar lógica de negocio.

## Qué se extrajo

- Paleta cálida de 36 roles semánticos, basada en superficies Material 3.
- Plus Jakarta Sans en pesos 400, 500, 600 y 700.
- Escala espacial de 8 px, objetivo táctil mínimo de 44 px y radios de 12/16 px.
- Sombras suaves marrones, estados de foco y movimiento reducido.
- Primitivas React: botones, páginas, paneles, encabezados, formularios, badges, métricas, filtros y estados de feedback.
- Shell responsive: sidebar de 280 px en desktop; header y navegación inferior en móvil; desborde de navegación dentro de “Más”.

No se extrajeron el logo de Vereda Café, rutas, roles, permisos, estado de sincronización ni cierre de sesión. El shell recibe esos datos mediante props.

## Instalación en un proyecto React + Tailwind 3

1. Copiar `design-system/` al nuevo repositorio, por ejemplo como `src/design-system/`.
2. Instalar React, Tailwind 3, PostCSS y Plus Jakarta Sans:

```bash
npm install react react-dom @fontsource/plus-jakarta-sans
npm install -D tailwindcss@^3 postcss autoprefixer @tailwindcss/forms @tailwindcss/container-queries
```

3. Usar el preset y agregar el kit al escaneo de Tailwind:

```js
// tailwind.config.js
import veredaPreset from "./src/design-system/tailwind.preset.js";

export default {
  presets: [veredaPreset],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/design-system/react/**/*.{ts,tsx}"
  ]
};
```

4. Cargar la fuente y los estilos una sola vez en el entrypoint:

```ts
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-500.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "./design-system/styles.css";
```

## Uso mínimo

```tsx
import { AppShell, Button, Page, PageHeader, Panel } from "./design-system/react";

export function Home() {
  return (
    <AppShell
      brand={{ name: "Nuevo producto", subtitle: "Panel operativo", fallback: "N" }}
      user={{ name: "Jordan Cruz", role: "Administrador" }}
      currentPath="/inicio"
      navItems={[
        { href: "/inicio", label: "Inicio", icon: "⌂", group: "Operación", exact: true },
        { href: "/reportes", label: "Reportes", icon: "↗", group: "Gestión" }
      ]}
      onLogout={() => undefined}
    >
      <Page size="wide">
        <PageHeader
          eyebrow="Operación"
          title="Resumen"
          description="Estado actual del negocio."
          action={<Button variant="primary">Nueva acción</Button>}
        />
        <Panel className="p-5">Contenido</Panel>
      </Page>
    </AppShell>
  );
}
```

Los iconos son `ReactNode`: el proyecto consumidor puede usar Lucide, Heroicons o SVG propios. Esto evita acoplar el kit a nombres de iconos o a una librería concreta.

### Adaptador para React Router

`AppShell` usa enlaces HTML por defecto. Para navegación SPA, pasar `renderLink`:

```tsx
import { Link } from "react-router-dom";

<AppShell
  // ...props
  renderLink={({ item, className, children, active, onNavigate }) => (
    <Link
      to={item.href}
      className={className}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      {children}
    </Link>
  )}
/>
```

## Reglas de composición

- Fondo general: `background`; contenido principal: `on-background`.
- Paneles: `surface-container-lowest`, borde `outline-variant/35`, radio `rounded-2xl`, sombra `shadow-panel`.
- Acción principal: `primary`; éxito operativo: `tertiary`; errores y acciones destructivas: `error`.
- No usar el color primario como decoración masiva. Funciona mejor en acciones, valores, ítems activos y pequeños acentos.
- Página: 16 px en móvil, 24 px en tablet, 32 px en desktop. Anchos: 768 px compacto, 1152 px normal, 1400 px ancho.
- Grillas: una columna por defecto; dos desde `sm` o `md`; tres/cuatro solo cuando el contenido lo admite.
- Toda acción táctil debe medir al menos 44×44 px.
- En móvil, mantener 24 px inferiores libres para el nav persistente; `AppShell` ya aplica `pb-24`.
- Formularios: etiqueta visible, campo de 44 px mínimo, error cercano y foco `primary`.
- Estados vacíos deben explicar qué ocurrió y, cuando sea posible, ofrecer una acción siguiente.

## Anatomía del layout

```text
Desktop (>= 1024 px)                 Móvil (< 1024 px)
┌──────── 280 px ────────┬───────┐  ┌──────────────────────┐
│ Marca                  │ Page  │  │ Header: marca/usuario│
│                        │       │  ├──────────────────────┤
│ Grupo de navegación    │       │  │                      │
│ Grupo secundario       │       │  │ Page                 │
│                        │       │  │                      │
│ Estado                 │       │  ├──────────────────────┤
│ Usuario + logout       │       │  │ 3 rutas + “Más”      │
└────────────────────────┴───────┘  └──────────────────────┘
```

El corte estructural es `lg` (1024 px). El contenido puede usar cortes `sm`, `md`, `xl` y `2xl` para sus propias grillas.

El kit extraído es únicamente claro. Aunque el preset conserva `darkMode: "class"` por compatibilidad con el proyecto de origen, no incluye todavía una segunda paleta para modo oscuro.

## Personalización de marca

Cambiar primero estos roles en `tailwind.preset.js`, manteniendo el contrato semántico:

- `primary`, `primary-container`, `primary-fixed`, `on-primary*`.
- `tertiary`, `tertiary-container`, `tertiary-fixed`, `on-tertiary*`.
- `background`, `surface*`, `on-surface*`, `outline*`.
- `error*` solo si la nueva marca exige otra semántica de peligro.

Después reemplazar Plus Jakarta Sans en `fontFamily.sans` y los imports del entrypoint. No conviene renombrar los tokens: componentes y pantallas dependen de su significado, no de su color literal.

## Qué adaptar en el siguiente proyecto

- Marca y logo.
- Navegación y agrupación de rutas.
- Adaptador del router.
- Usuario, permisos, logout y estado online/offline.
- Iconos.
- Copys y tono del producto.

El shell es deliberadamente presentacional. La autorización real debe seguir viviendo en el router y en el backend; ocultar un ítem del menú no es control de acceso.
