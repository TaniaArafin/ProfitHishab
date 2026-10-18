// next/core-web-vitals brings eslint-plugin-react, react-hooks (Rules of Hooks, exhaustive deps)
// and jsx-a11y, as the Next.js production checklist recommends.
import { FlatCompat } from '@eslint/eslintrc';
import { baseConfig } from '../../eslint.base.mjs';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'jsx-a11y/no-autofocus': 'off',
    },
  },
];
