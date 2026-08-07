import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Existing security validation intentionally matches ASCII control bytes.
      'no-control-regex': 'off',
      // Keep the lint baseline focused on correctness without creating unrelated churn.
      'prefer-const': 'off',
    },
  },
);
