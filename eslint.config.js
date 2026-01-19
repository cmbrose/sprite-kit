import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.{js,mjs,cjs,ts,mts,cts}"],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2022,
            },
        },
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
        },
    },
    {
        ignores: [
            "dist/",
            "node_modules/",
            "**/*.js.map",
            "*.config.js",
            "**/dist/**",
            "**/*.d.ts",
        ],
    }
);