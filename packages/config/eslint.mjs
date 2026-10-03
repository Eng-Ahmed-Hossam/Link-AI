import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Hard-coded hex colours are banned in components (tokens only); strings go through i18n.
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/storybook-static/**', '**/.expo/**', '**/*.d.ts', '**/public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['packages/tokens/**', '**/*.stories.tsx', '**/*.test.*'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]", message: 'No raw hex in components: use tokens.' },
      ],
    },
  },
);
