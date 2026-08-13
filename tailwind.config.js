import veredaPreset from "./design-system/tailwind.preset.js";

export default {
  presets: [veredaPreset],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", "./design-system/react/**/*.{ts,tsx}"]
};
