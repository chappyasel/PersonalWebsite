import nextVitals from "eslint-config-next/core-web-vitals";
import drizzle from "eslint-plugin-drizzle";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...nextVitals,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.{js,jsx,ts,tsx,cjs}"],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      drizzle,
    },
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXText[value=/[\\u2190-\\u21ff\\u27f0-\\u27ff\\u2900-\\u297f\\u2b05-\\u2b07➔➜➝➞➤➧‹›«»]|->|<-/u], JSXExpressionContainer Literal[value=/[\\u2190-\\u21ff\\u27f0-\\u27ff\\u2900-\\u297f\\u2b05-\\u2b07➔➜➝➞➤➧‹›«»]|->|<-/u]",
          message:
            "Use a Phosphor icon instead of a text arrow in the interface.",
        },
        {
          selector:
            "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
          message:
            "Do not use native title attributes. They create delayed browser tooltips. Use visible UI copy or an accessible name instead.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "lucide-react",
                "lucide-react/*",
                "react-icons",
                "react-icons/*",
                "@heroicons/*",
                "@radix-ui/react-icons",
                "@fortawesome/*",
                "@tabler/icons*",
                "@mui/icons-material",
                "@mui/icons-material/*",
              ],
              message: "Use @phosphor-icons/react for interface icons.",
            },
          ],
        },
      ],
      "drizzle/enforce-delete-with-where": [
        "error",
        {
          drizzleObjectName: ["db", "ctx.db"],
        },
      ],
      "drizzle/enforce-update-with-where": [
        "error",
        {
          drizzleObjectName: ["db", "ctx.db"],
        },
      ],
      "react-hooks/config": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/gating": "off",
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/static-components": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/use-memo": "off",
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["**/*.mjs"],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
]);
