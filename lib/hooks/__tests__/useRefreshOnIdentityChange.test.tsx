import { render } from '@testing-library/react'
import { act } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { useRefreshOnIdentityChange } from '../useRefreshOnIdentityChange'

const refresh = jest.fn()
const unsubscribe = jest.fn()
let handler: ((event: AuthChangeEvent, session: Session | null) => void) | null = null

const onAuthStateChange = jest.fn((callback) => {
  handler = callback
  return { data: { subscription: { unsubscribe } } }
})

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ refresh })),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({ auth: { onAuthStateChange } })),
}))

function sessionFor(userId: string): Session {
  return { user: { id: userId } } as Session
}

function Subscriber(): null {
  useRefreshOnIdentityChange()
  return null
}

function emit(event: AuthChangeEvent, session: Session | null): void {
  act(() => {
    handler?.(event, session)
  })
}

describe('useRefreshOnIdentityChange', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    handler = null
  })

  it('subscribes once and unsubscribes on unmount', () => {
    const { unmount } = render(<Subscriber />)

    expect(onAuthStateChange).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('ignores INITIAL_SESSION — it fires on every page load', () => {
    render(<Subscriber />)

    emit('INITIAL_SESSION', sessionFor('sailor-1'))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('ignores a same-user TOKEN_REFRESHED — it fires roughly hourly', () => {
    render(<Subscriber />)

    emit('INITIAL_SESSION', sessionFor('sailor-1'))
    emit('TOKEN_REFRESHED', sessionFor('sailor-1'))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('ignores a SIGNED_IN that re-announces the sailor it already had', () => {
    render(<Subscriber />)

    emit('INITIAL_SESSION', sessionFor('sailor-1'))
    // `auth-js` emits one of these on every hidden → visible transition, from the
    // session it recovers out of storage. Switching apps is not signing in, and
    // `/` is force-dynamic.
    emit('SIGNED_IN', sessionFor('sailor-1'))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes on a TOKEN_REFRESHED that carries a different sailor', () => {
    render(<Subscriber />)

    emit('INITIAL_SESSION', sessionFor('sailor-1'))
    emit('TOKEN_REFRESHED', sessionFor('sailor-2'))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes the server-rendered chrome on sign-in', () => {
    render(<Subscriber />)

    emit('INITIAL_SESSION', null)
    emit('SIGNED_IN', sessionFor('sailor-1'))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes on sign-out', () => {
    render(<Subscriber />)

    emit('INITIAL_SESSION', sessionFor('sailor-1'))
    emit('SIGNED_OUT', null)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('takes no screen down when there is no Supabase environment', () => {
    const { createClient } = jest.requireMock('@/lib/supabase/client')
    createClient.mockImplementationOnce(() => {
      throw new Error('Missing Supabase environment variables.')
    })
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    // The hook is on every screen, and the weather half of the app is open to
    // everyone — including to a build with no `.env.local`, which is what the
    // browser suite runs against.
    expect(() => render(<Subscriber />)).not.toThrow()
    expect(onAuthStateChange).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('never reads who is signed in from the client copy — only that it changed', () => {
    render(<Subscriber />)

    // A tab receiving a multi-tab broadcast is handed the payload's session
    // rather than re-reading its own cookies, so this value can disagree with
    // the cookie. It is used as a trigger and nothing else (ADR 0018).
    emit('SIGNED_IN', sessionFor('sailor-1'))

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledWith()
  })
})
