import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // JSX usage isn't seen by core no-unused-vars without eslint-plugin-react; ignore PascalCase imports
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      // Use src/lib/logger.js instead of console.*
      'no-console': 'error',
      // window.confirm is fine for destructive actions; use the toast (useToast) instead of alert()
      'no-restricted-globals': ['error', { name: 'alert', message: 'Use useToast().notify instead.' }],
      'no-restricted-properties': ['error', { object: 'window', property: 'alert', message: 'Use useToast().notify instead.' }],
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/lib/logger.js'],
    rules: { 'no-console': 'off' },
  },
]
