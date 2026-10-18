import { baseConfig } from '../../eslint.base.mjs';

export default [
  ...baseConfig({ tsconfigRootDir: import.meta.dirname, project: ['./tsconfig.json'] }),
  {
    rules: {
      // Nest injects by constructor type: a type-only import would erase the metadata DI needs.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['test/**/*.ts', 'src/**/*.spec.ts'],
    rules: {
      // supertest bodies are `any` by design; assertions check their shape.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
];
