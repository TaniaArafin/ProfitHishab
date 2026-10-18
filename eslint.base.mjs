// Shared ESLint rules for every workspace (nodebestpractices 3.1, 4.9, 6.1).
// Each workspace has its own eslint.config.mjs that extends this and points at its tsconfig.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/** @param {{ tsconfigRootDir: string, project?: string[] }} options */
export function baseConfig({ tsconfigRootDir, project }) {
  return tseslint.config(
    {
      ignores: [
        'dist/**',
        '.next/**',
        '.next-prod/**',
        'test-results/**',
        'playwright-report/**',
        'coverage/**',
        'node_modules/**',
        'next-env.d.ts',
        '**/*.config.{js,mjs,cjs,mts}',
        'playwright-report/**',
        'test-results/**',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { tsconfigRootDir, ...(project ? { project } : { projectService: true }) },
      },
      rules: {
        eqeqeq: ['error', 'always'],
        'no-var': 'error',
        'prefer-const': 'error',
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        // An un-awaited promise loses its error and its stack (nodebestpractices 2.12).
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
        '@typescript-eslint/no-require-imports': 'error',
      },
    },
    prettier,
  );
}
