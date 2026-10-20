import { base } from '@pypr/eslint-config/base';
import { globalIgnores } from 'eslint/config';

export default [
  globalIgnores(['src/generated/**']),
  ...base,
  {
    languageOptions: {
      parserOptions: {
        // Lets consistent-type-imports keep value imports that Nest needs for dependency injection.
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
    rules: {
      // Nest modules are empty classes configured by decorators.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
];
