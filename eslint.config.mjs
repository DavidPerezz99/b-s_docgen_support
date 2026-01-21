// @ts-check

import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import eslintPluginSimpleImportSort from "eslint-plugin-simple-import-sort";
import noUnusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Recommended configurations
  // Replaces "extends" field
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.stylistic,
  eslintConfigPrettier,
  {
    // Linting configurations for non "out of the box" solutions
    languageOptions: {
      // TypeScript parser for Eslint
      parser: tseslint.parser,
      // Use the tsconfig file for TypeScript compilation config
      parserOptions: {
        sourceType: "module",
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    // Plugins must be named as directed by their documentation
    // Otherwise the parser won't recognize custom names
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "simple-import-sort": eslintPluginSimpleImportSort,
      "unused-imports": noUnusedImports,
      ...eslintPluginPrettierRecommended.plugins
    }
  },
  {
    // Files to include in the linting process
    files: ["src/**/*.ts", "config/jest/mocks/**/*.ts", "api-tests/**/*.ts"]
  },
  {
    // Files to exclude from the linting process
    // Currently ignores all generated files
    ignores: ["src/**/generated.*", "**/dist/*", "**/coverage/*", "**/node_modules/*", "**/compiled_tests/*"]
  },
  {
    // Linting rules
    rules: {
      "@typescript-eslint/array-type": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/class-literal-property-style": "error",
      "@typescript-eslint/consistent-generic-constructors": ["error", "type-annotation"],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "never"
        }
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-array-delete": "error",
      "@typescript-eslint/no-duplicate-enum-values": "error",
      "@typescript-eslint/no-duplicate-type-constituents": "error",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          allowInterfaces: "with-single-extends"
        }
      ],
      // TODO:: This rule should be set to warn in the future
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-for-in-array": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-unsafe-declaration-merging": "error",
      "@typescript-eslint/no-unused-vars": ["error", { caughtErrors: "none" }],
      "@typescript-eslint/prefer-reduce-type-parameter": "warn",
      "@typescript-eslint/prefer-regexp-exec": "warn",
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/return-await": ["error", "error-handling-correctness-only"],
      "@typescript-eslint/require-array-sort-compare": "error",
      "default-param-last": "error",
      "no-async-promise-executor": "error",
      "no-await-in-loop": "warn",
      "no-console": "warn",
      "no-promise-executor-return": "error",
      "prefer-promise-reject-errors": "error",
      "require-atomic-updates": "error",
      "simple-import-sort/imports": "error",
      "unused-imports/no-unused-imports": "error",
      ...eslintPluginPrettierRecommended.rules
    }
  }
);
