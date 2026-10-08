import { test as teardown } from '@playwright/test'

import { archiveWriter, removeFixture } from './fixtures/synthetic-race'

/**
 * Removes the synthetic Race again, so a local archive is the developer's own between runs.
 *
 * A teardown rather than only the setup's own delete-before-insert, because the fixture is a Race
 * in the archive: leaving one titled "E2E fixture" sitting on `/boat-performance` after a test run
 * is a thing somebody would eventually read as testimony.
 */
teardown('remove the synthetic Instrument Tuning race', async () => {
  await removeFixture(archiveWriter())
})
