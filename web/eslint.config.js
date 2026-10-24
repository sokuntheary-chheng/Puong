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
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  {
    rules: {
      // The entry component is legitimately called App.vue.
      'vue/multi-word-component-names': 'off',
    },
  },
);
