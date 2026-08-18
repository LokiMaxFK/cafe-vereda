import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions corre en Deno (imports "npm:", globals distintos): fuera del alcance de este lint.
  { ignores: ["dist", "supabase/functions"] },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["vite.config.ts", "tsconfig.node.json"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs["recommended-latest"]],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser
    },
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["vite.config.ts", "tailwind.config.js", "postcss.config.js"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node }
  }
);
