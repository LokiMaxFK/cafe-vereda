import containerQueries from "@tailwindcss/container-queries";
import forms from "@tailwindcss/forms";

/**
 * Portable Tailwind 3 preset extracted from Proyecto Virtud.
 *
 * Usage:
 *   import veredaPreset from "./design-system/tailwind.preset.js";
 *   export default { presets: [veredaPreset], content: [...] };
 */
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "outline-variant": "#ddc1b3",
        "inverse-on-surface": "#ffedea",
        "surface-container": "#ffe9e5",
        "inverse-primary": "#ffb68d",
        "on-error-container": "#93000a",
        "on-secondary": "#ffffff",
        "surface-variant": "#ffdad4",
        "on-secondary-fixed": "#1c1c18",
        "on-primary-fixed": "#321200",
        secondary: "#605e59",
        primary: "#974400",
        "on-tertiary": "#ffffff",
        "secondary-fixed-dim": "#c9c6c0",
        "secondary-fixed": "#e6e2db",
        "on-surface-variant": "#564338",
        "on-primary-container": "#fffbff",
        tertiary: "#536229",
        "tertiary-fixed": "#d9eaa3",
        "on-tertiary-fixed": "#161f00",
        "primary-container": "#bb5808",
        "tertiary-container": "#6b7b3f",
        "on-primary-fixed-variant": "#763400",
        "surface-container-high": "#ffe2dd",
        "on-tertiary-container": "#fbffe4",
        "secondary-container": "#e6e2db",
        outline: "#8a7266",
        error: "#ba1a1a",
        "surface-bright": "#fff8f6",
        "on-surface": "#2b1613",
        "on-secondary-fixed-variant": "#484742",
        surface: "#fff8f6",
        "primary-fixed-dim": "#ffb68d",
        "on-tertiary-fixed-variant": "#3e4c16",
        "on-background": "#2b1613",
        "error-container": "#ffdad6",
        "inverse-surface": "#422a26",
        "on-secondary-container": "#66645f",
        "on-primary": "#ffffff",
        "surface-container-highest": "#ffdad4",
        "surface-container-low": "#fff0ee",
        "primary-fixed": "#ffdbc9",
        background: "#fff8f6",
        "surface-dim": "#f8d1cb",
        "surface-container-lowest": "#ffffff",
        "surface-tint": "#9a4600",
        "on-error": "#ffffff",
        "tertiary-fixed-dim": "#bdce89"
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px"
      },
      spacing: {
        gutter: "16px",
        "sidebar-width": "280px",
        "margin-edge": "24px",
        "touch-target-min": "44px",
        unit: "8px"
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-md": ["Plus Jakarta Sans", "sans-serif"],
        "label-caps": ["Plus Jakarta Sans", "sans-serif"],
        "body-lg": ["Plus Jakarta Sans", "sans-serif"],
        "headline-lg": ["Plus Jakarta Sans", "sans-serif"],
        "display-price": ["Plus Jakarta Sans", "sans-serif"],
        "headline-lg-mobile": ["Plus Jakarta Sans", "sans-serif"],
        "body-md": ["Plus Jakarta Sans", "sans-serif"]
      },
      fontSize: {
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "label-caps": ["12px", { lineHeight: "16px", letterSpacing: "0", fontWeight: "700" }],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "500" }],
        "headline-lg": ["32px", { lineHeight: "40px", fontWeight: "700" }],
        "display-price": ["48px", { lineHeight: "56px", letterSpacing: "0", fontWeight: "700" }],
        "headline-lg-mobile": ["24px", { lineHeight: "32px", fontWeight: "700" }],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }]
      },
      boxShadow: {
        panel: "0 8px 24px rgba(62, 39, 35, 0.07)",
        "panel-hover": "0 12px 28px rgba(62, 39, 35, 0.11)",
        "bottom-nav": "0 -8px 24px rgba(62, 39, 35, 0.08)",
        brand: "0 10px 24px rgba(151, 68, 0, 0.22)"
      }
    }
  },
  plugins: [forms, containerQueries]
};
