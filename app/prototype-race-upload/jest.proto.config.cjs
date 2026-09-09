/**
 * THROWAWAY — standalone jest config for the prototype's render smoke check.
 *
 * Deliberately does NOT use next/jest: in this environment Next's native binary
 * segfaults (`next build` and `npx jest --listTests` both die with a bus error),
 * and loopback HTTP is unavailable, so this ts-jest + jsdom path is the only way
 * to actually render the variants rather than merely compile them.
 *
 * Run:  npx jest -c app/prototype-race-upload/jest.proto.config.cjs
 */
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS jest config */
const path = require('path')
const root = path.resolve(__dirname, '../..')

module.exports = {
  testEnvironment: 'jsdom',
  rootDir: root,
  testMatch: ['<rootDir>/app/prototype-race-upload/*.test.tsx'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          resolveJsonModule: true,
          module: 'commonjs',
          target: 'es2020',
          strict: true,
        },
      },
    ],
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  maxWorkers: 1,
}
