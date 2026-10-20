import globals from 'globals';
export default [
  { ignores: ['node_modules/**', 'dist/**', 'ulanzi-plugin/**/libs/**'] },
  {
    files: ['src/**/*.js', 'renderer/**/*.{js,mjs}', 'scripts/**/*.js', 'test/**/*.js', 'ulanzi-plugin/com.turnbit.spotify.ulanziPlugin/app.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-args': 'error', 'no-dupe-keys': 'error', 'valid-typeof': 'error' }
  },
  { files: ['**/*.mjs'], languageOptions: { sourceType: 'module' } },
  { files: ['src/app/**/*.js'], rules: {
    'no-restricted-modules': ['error', { paths: ['electron'], patterns: ['**/desktop/**', '**/integrations/**', '**/renderer/**'] }],
    'no-restricted-globals': ['error', 'window', 'document', 'localStorage']
  } },
  { files: ['renderer/features/**/*.mjs'], rules: {
    'no-restricted-imports': ['error', { patterns: ['**/src/desktop/**', '**/src/integrations/**'] }]
  } },
  { files: ['ulanzi-plugin/com.turnbit.spotify.ulanziPlugin/app.js'], languageOptions: { globals: { $UD: 'readonly' } } }
];
