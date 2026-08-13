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
        "outline-variant": "#D2C6A8",
        "inverse-on-surface": "#F7F0DE",
        "surface-container": "#EEE5CF",
        "inverse-primary": "#D7B58A",
        "on-error-container": "#93000a",
        "on-secondary": "#ffffff",
        "surface-variant": "#E6DCC2",
        "on-secondary-fixed": "#1c1c18",
        "on-primary-fixed": "#321200",
        secondary: "#605e59",
        primary: "#5A3A1B",
        "on-tertiary": "#ffffff",
        "secondary-fixed-dim": "#C8C2AD",
        "secondary-fixed": "#E6DCC2",
        "on-surface-variant": "#655D4E",
        "on-primary-container": "#fffbff",
        tertiary: "#626A3E",
        "tertiary-fixed": "#DCE3B5",
        "on-tertiary-fixed": "#161f00",
        "primary-container": "#76502B",
        "tertiary-container": "#7E8657",
        "on-primary-fixed-variant": "#5A3A1B",
        "surface-container-high": "#E9DFC7",
        "on-tertiary-container": "#fbffe4",
        "secondary-container": "#E6DCC2",
        outline: "#817866",
        error: "#ba1a1a",
        "surface-bright": "#FBF8F0",
        "on-surface": "#29261F",
        "on-secondary-fixed-variant": "#484742",
        surface: "#fff8f6",
        "primary-fixed-dim": "#ffb68d",
        "on-tertiary-fixed-variant": "#3e4c16",
        "on-background": "#29261F",
        "error-container": "#ffdad6",
        "inverse-surface": "#37342C",
        "on-secondary-container": "#66645f",
        "on-primary": "#ffffff",
        "surface-container-highest": "#E6DCC2",
        "surface-container-low": "#F2EAD8",
        "primary-fixed": "#E2C8A6",
        background: "#F6F0E2",
        "surface-dim": "#DED3B8",
        "surface-container-lowest": "#FFFDF8",
        "surface-tint": "#5A3A1B",
        "on-error": "#ffffff",
        "tertiary-fixed-dim": "#C2CB93"
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
        panel: "0 8px 24px rgba(65, 49, 28, 0.07)",
        "panel-hover": "0 12px 28px rgba(65, 49, 28, 0.12)",
        "bottom-nav": "0 -8px 24px rgba(65, 49, 28, 0.08)",
        brand: "0 10px 24px rgba(90, 58, 27, 0.22)"
      }
    }
  },
  plugins: [forms, containerQueries]
};
