import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BoatIdentityEditor from '../BoatIdentityEditor'
import type { Boat } from '@/types'

jest.mock('@/app/(app)/boat-management/actions', () => ({ saveBoatIdentity: jest.fn() }))

const { saveBoatIdentity } = jest.requireMock('@/app/(app)/boat-management/actions')

const BOAT: Boat = {
  id: 'boat-1',
  name: 'Handsome Pete',
  model: 'Beneteau 10R',
  icon_path: null,
  icon_updated_at: null,
  created_at: '2026-09-10T18:30:00Z',
  updated_at: '2026-09-10T18:30:00Z',
}

const WITH_ICON: Boat = {
  ...BOAT,
  icon_path: 'boat-identity/icon/pete.png',
  icon_updated_at: '2026-10-16T18:00:00Z',
}

function png(name = 'pete.png', size = 12): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' })
}

/** The FormData the last Save sent. */
function sent(): FormData {
  return saveBoatIdentity.mock.calls.at(-1)[0] as FormData
}

describe('BoatIdentityEditor — the icon', () => {
  const user = userEvent.setup({ delay: null })

  beforeEach(() => {
    jest.clearAllMocks()
    saveBoatIdentity.mockResolvedValue({ ok: true })
    // jsdom has no object URLs; the preview only needs one to point its <img> at.
    URL.createObjectURL = jest.fn(() => 'blob:preview')
    URL.revokeObjectURL = jest.fn()
  })

  async function openEditor(boat: Boat = BOAT): Promise<void> {
    render(<BoatIdentityEditor boat={boat} />)
    await user.click(screen.getByRole('button', { name: /edit the boat/i }))
  }

  it('previews a chosen icon locally, and sends it with the name and model on Save', async () => {
    await openEditor()

    await user.upload(screen.getByLabelText('Upload icon'), png())

    expect(screen.getByAltText('Icon preview')).toHaveAttribute('src', 'blob:preview')
    // Staged, not sent: nothing is saved until Save.
    expect(saveBoatIdentity).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect((sent().get('icon') as File).name).toBe('pete.png')
    expect(sent().get('name')).toBe('Handsome Pete')
    expect(sent().get('removeIcon')).toBeNull()
  })

  it('stages a removal, committed by the same Save', async () => {
    await openEditor(WITH_ICON)

    expect(screen.getByAltText('Icon preview')).toHaveAttribute(
      'src',
      expect.stringContaining('/boat/icon?v=')
    )

    await user.click(screen.getByRole('button', { name: 'Remove icon' }))

    expect(screen.queryByAltText('Icon preview')).not.toBeInTheDocument()
    expect(saveBoatIdentity).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(sent().get('removeIcon')).toBe('true')
  })

  it('discards a staged icon on Cancel', async () => {
    await openEditor(WITH_ICON)
    await user.click(screen.getByRole('button', { name: 'Remove icon' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(saveBoatIdentity).not.toHaveBeenCalled()

    // Reopened, the boat is as it was: its icon, and nothing staged against it.
    await user.click(screen.getByRole('button', { name: /edit the boat/i }))
    expect(screen.getByAltText('Icon preview')).toHaveAttribute(
      'src',
      expect.stringContaining('/boat/icon?v=')
    )
  })

  it('says at once that an icon is over a megabyte, and stages nothing', async () => {
    // A courtesy: the server refuses it too, but it should not have to travel there first.
    await openEditor()

    await user.upload(screen.getByLabelText('Upload icon'), png('huge.png', 1_048_577))

    expect(screen.getByRole('alert')).toHaveTextContent(/1 MB/)
    expect(screen.queryByAltText('Icon preview')).not.toBeInTheDocument()
  })

  it('reports a save that could not reach the server, and keeps the form open', async () => {
    saveBoatIdentity.mockRejectedValue(new Error('Body exceeded 2mb limit'))
    await openEditor()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be saved/i)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})
