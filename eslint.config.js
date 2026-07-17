import js from "@eslint/js";
import globals from "globals";

export default [
    {
        ignores: ["dist/**", "node_modules/**", "data/**"]
    },
    js.configs.recommended,
    {
        files: ["app.js", "src/**/*.js", "tests/e2e/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.es2024
            }
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }]
        }
    },
    {
        files: ["scripts/**/*.mjs", "*.config.js", "tests/unit/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.es2024
            }
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }]
        }
    }
];
