import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    { files: ['**/*.{js,mjs,cjs}'], languageOptions: { globals: globals.node } },
    {
        rules: {
            curly: 'error',
            'indent': ['error', 4],
            'quotes': ['error', 'single'],
            'brace-style': ['error', 'stroustrup'],
            'semi': ['error', 'always'],
            'comma-dangle': ['error', 'never'],
            'vue/multi-word-component-names': 'off',
            'no-unused-vars': ['off', { args: 'none' }],
            'padding-line-between-statements': [
                'warn',
                { blankLine: 'always', prev: '*', next: 'block' },
                { blankLine: 'always', prev: 'block', next: '*' },
                { blankLine: 'always', prev: '*', next: 'block-like' },
                { blankLine: 'always', prev: 'block-like', next: '*' }
            ]
        }
    }
]);
