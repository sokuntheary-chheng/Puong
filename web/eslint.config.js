import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  // .vue single-file components: vue-eslint-parser reads the template,
  // typescript-eslint parses the <script setup> block.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },

  {
    // The application runs in the browser...
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  {
    // ...but the build config and scripts/check-generations.mjs run in Node.
    // Without this the seed checker is reported as `process is not defined`.
    files: ['*.config.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  {
    rules: {
      // The entry component is legitimately called App.vue.
      'vue/multi-word-component-names': 'off',
    },
  },
);
