import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // src/engine/ is pure: no React, no DOM, no fetch (CLAUDE.md).
  // Enforced here so a stray import fails lint rather than review.
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/engine/ is pure TypeScript. Keep React out of it.' },
            { name: 'react-dom', message: 'src/engine/ is pure TypeScript. Keep React out of it.' },
            { name: 'next', message: 'src/engine/ is pure TypeScript. Keep Next out of it.' },
            {
              name: 'animejs',
              message: 'src/engine/ is pure TypeScript. Motion lives in src/motion/.',
            },
            {
              name: 'dexie',
              message: 'src/engine/ is pure TypeScript. Persistence lives in src/db/.',
            },
          ],
          patterns: [
            { group: ['next/*'], message: 'src/engine/ is pure TypeScript. Keep Next out of it.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/engine/ must not touch the DOM.' },
        { name: 'document', message: 'src/engine/ must not touch the DOM.' },
        { name: 'fetch', message: 'src/engine/ must not do I/O. Pass data in as arguments.' },
        { name: 'localStorage', message: 'src/engine/ must not touch storage.' },
      ],
      // Randomness is a seeded RNG passed in as an argument (CLAUDE.md).
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Engine code must take a seeded RNG as an argument so results are reproducible.',
        },
      ],
    },
  },

  // Keep prettier last so it can turn off stylistic rules that conflict.
  prettier,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'design/**',
  ]),
]);

export default eslintConfig;
