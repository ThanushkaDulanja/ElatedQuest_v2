const nodeGlobals = {
  Buffer: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  fetch: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
};

const browserGlobals = {
  document: "readonly",
  window: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "public/css/site.css", "public/vendor/**", "uploads/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: {
      "array-callback-return": "error",
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
      "no-alert": "error",
      "no-eval": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      globals: browserGlobals,
    },
  },
];
