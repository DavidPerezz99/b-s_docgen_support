/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
  "src/**/*.ts": "eslint --fix",
  "src/**/*.{js,mjs,cjs,mts,cts,json,md,yaml,yml}": "prettier --write",
  "api-tests/**/*.ts": 'eslint --fix --parser-options=project:api-tests/tsconfig.json "api-tests/**/*.ts"',
  "api-tests/**/*.{js,mjs,cjs,mts,cts,json,md,yaml,yml}": "prettier --write"
};
