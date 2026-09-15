/**
 * The delete confirmation, driven against a stub action.
 *
 * Two steps, like the artifact upload form: the first press only asks, and nothing is destroyed until
 * the second. What the confirmation *says* is tested as carefully as what it does — a delete with no
 * undo behind a button labelled "Delete" and nothing else is the failure this pattern exists to
 * prevent, so the sentence naming the Transcription and the stored file is a requirement rather than
 * decoration.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DeleteRaceResult } from '@/types'
import RaceDeletePanel from '../RaceDeletePanel'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push })),
}))

const RACE_ID = '9a1b2c3d-0000-4000-8000-00000000aaaa'
const FILENAME = '08-22-26-glr.csv'

function panel(result: DeleteRaceResult = { ok: true, bytes_removed: true }): jest.Mock {
  const deleteRace = jest.fn(async () => result)
  render(<RaceDeletePanel raceId={RACE_ID} filename={FILENAME} deleteRace={deleteRace} />)
  return deleteRace
}

describe('RaceDeletePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('offers one control, and asks before it destroys anything', async () => {
    const deleteRace = panel()

    expect(screen.getByTestId('race-delete-open')).toBeInTheDocument()
    expect(screen.queryByTestId('race-delete-confirm')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('race-delete-open'))

    expect(screen.getByTestId('race-delete-confirm')).toBeInTheDocument()
    // Opening the confirmation is not the delete.
    expect(deleteRace).not.toHaveBeenCalled()
  })

  it('names everything the delete takes, and says there is no undo', async () => {
    panel()
    await userEvent.click(screen.getByTestId('race-delete-open'))

    const confirmation = screen.getByTestId('race-delete-confirmation')

    // The file by name, because that is what the sailor would have to find again.
    expect(confirmation).toHaveTextContent(FILENAME)
    expect(confirmation).toHaveTextContent(/Transcription/)
    expect(confirmation).toHaveTextContent(/sail and sea-state entries/i)
    expect(confirmation).toHaveTextContent(/no undo/i)
  })

  it('keeps the race when the confirmation is dismissed', async () => {
    const deleteRace = panel()

    await userEvent.click(screen.getByTestId('race-delete-open'))
    await userEvent.click(screen.getByTestId('race-delete-cancel'))

    expect(deleteRace).not.toHaveBeenCalled()
    expect(screen.queryByTestId('race-delete-confirm')).not.toBeInTheDocument()
    expect(screen.getByTestId('race-delete-open')).toBeInTheDocument()
  })

  it('deletes the race and goes back to the races list', async () => {
    const deleteRace = panel()

    await userEvent.click(screen.getByTestId('race-delete-open'))
    await userEvent.click(screen.getByTestId('race-delete-confirm'))

    expect(deleteRace).toHaveBeenCalledWith(RACE_ID)
    // Nothing to come back to: this page's race is gone.
    expect(push).toHaveBeenCalledWith('/boat-performance')
  })

  it('shows a refusal and leaves the sailor where they are', async () => {
    panel({ ok: false, message: 'Only an admin can delete a race.' })

    await userEvent.click(screen.getByTestId('race-delete-open'))
    await userEvent.click(screen.getByTestId('race-delete-confirm'))

    expect(screen.getByTestId('race-delete-error')).toHaveTextContent(
      'Only an admin can delete a race.'
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('says so when the race went and its stored file did not', async () => {
    panel({ ok: true, bytes_removed: false })

    await userEvent.click(screen.getByTestId('race-delete-open'))
    await userEvent.click(screen.getByTestId('race-delete-confirm'))

    // ADR 0013's chosen failure. The race is deleted, so this is not an error — but the bytes are
    // still in the bucket and saying nothing would leave the admin thinking otherwise.
    expect(screen.getByTestId('race-delete-orphan')).toHaveTextContent(/stored file/i)
    // Deliberately no navigation: the note would be gone before it was read.
    expect(push).not.toHaveBeenCalled()
  })
})
