import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  // The sandbox is 4 vCPU / 8 GB with no swap and often has several agent
  // sessions running suites at once. Jest's default of one worker per core
  // (less one) at 400–700 MB each OOM-killed sshd. Half the cores still scales
  // on a bigger CI runner; recycling a worker past 512 MB stops jsdom heaps
  // from growing over a long run.
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    // Browser tests: Playwright's runner, not Jest's. `testMatch` above would
    // otherwise collect `e2e/*.spec.ts` and fail on the Playwright imports.
    '<rootDir>/e2e/',
    // Throwaway agent worktrees hold full copies of the repo, so leaving them
    // in makes `npm test` run every suite once per worktree.
    //
    // Anchored to <rootDir> on purpose. A bare '/\.claude/' is matched against
    // each file's absolute path, and a worktree *lives* at
    // .claude/worktrees/<name>/ — so running jest from inside one ignored every
    // test it had and reported "No tests found". Anchoring excludes the
    // worktrees when run from the main checkout and nothing when run from one.
    '<rootDir>/.claude/',
  ],
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'services/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    // A suite's own helpers live beside it — `services/recordings/__tests__/archive.ts` is one —
    // and coverage of a fixture is not a figure about this application.
    '!**/__tests__/**',
  ],
}

export default createJestConfig(config)
