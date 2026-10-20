import nextPlugin from '@next/eslint-plugin-next';
import { base } from '@pypr/eslint-config/base';
import { globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';

// eslint-config-next is not used: its bundled react, jsx-a11y and import plugins
// do not support ESLint 10 yet. The Next.js and React Hooks plugins do.
export default [
  globalIgnores(['.next/**', '.next-e2e/**', 'out/**', 'next-env.d.ts']),
  ...base,
  nextPlugin.configs['core-web-vitals'],
  reactHooks.configs.flat.recommended,
];
