import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", ".wrangler/", "db-legacy/"] },
  js.configs.recommended,
  { files: ["src/**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.serviceworker } } },
  { files: ["public/**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: { ...globals.browser } } },
  { files: ["test/**/*.js", "scripts/**/*.mjs", "eslint.config.js"], languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } } },
  {
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
