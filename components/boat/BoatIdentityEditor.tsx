'use client'

import { useState, type CSSProperties, type FormEvent, type ReactElement } from 'react'
import BoatIdentityHeader from '@/components/boat/BoatIdentityHeader'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { saveBoatIdentity } from '@/app/(app)/boat-management/actions'
import { spacing } from '@/lib/utils/design'
import type { Boat } from '@/types'

interface BoatIdentityEditorProps {
  boat: Boat
}

const LABEL_STYLE: CSSProperties = { ...EYEBROW_STYLE, display: 'block' }

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--input-fg)',
  // A step *below* the card it sits on rather than `--input-bg`, which is the same
  // `--surface-elevated` as the card and would leave the field with no edge of its
  // own. The mockup makes the same choice.
  background: 'var(--surface-base)',
  border: '1px solid var(--input-border)',
  borderRadius: 'var(--input-radius)',
  padding: '8px 10px',
}

const BUTTON_STYLE: CSSProperties = {
  flex: 1,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-medium)',
  padding: '8px 14px',
  cursor: 'pointer',
}

/**
 * The boat's identity, edited in place by an **admin**.
 *
 * Closed until asked for: the header reads as the boat, not as a form, and the
 * pencil is the only thing added to it. Which is also why this is the one client
 * island on the screen — everything else here is a Server Component.
 *
 * The write itself is authorized on the server, in `saveBoatIdentity`, and again by
 * RLS. This component is rendered only for an admin, but that is a courtesy to the
 * sailor rather than the check: a Server Action is a public endpoint.
 */
export default function BoatIdentityEditor({ boat }: BoatIdentityEditorProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // A plain submit handler rather than `useActionState`: the form is reachable only
  // through a button that needs JavaScript to open it, so there is no no-JS
  // submission to preserve, and the open/closed state stays the one source of truth
  // about what the header is showing.
  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    setSaving(true)
    setMessage(null)
    const result = await saveBoatIdentity(formData)
    setSaving(false)

    if (result.ok) {
      setOpen(false)
      return
    }

    // The refusal stays next to the fields that caused it, and the fields keep what
    // was typed — nothing is silently discarded.
    setMessage(result.message)
  }

  if (!open) {
    return (
      <BoatIdentityHeader
        name={boat.name}
        model={boat.model}
        action={
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Edit the boat’s name and model"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        }
      />
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(3),
        background: 'var(--surface-elevated)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        padding: spacing(3),
      }}
    >
      <div>
        <label htmlFor="boat-name" style={LABEL_STYLE}>
          Boat name
        </label>
        <input
          id="boat-name"
          name="name"
          defaultValue={boat.name}
          required
          autoComplete="off"
          style={INPUT_STYLE}
        />
      </div>

      <div>
        <label htmlFor="boat-model" style={LABEL_STYLE}>
          Model
        </label>
        <input
          id="boat-model"
          name="model"
          defaultValue={boat.model}
          required
          autoComplete="off"
          style={INPUT_STYLE}
        />
      </div>

      {message !== null && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--wind-storm)',
          }}
        >
          {message}
        </p>
      )}

      <div style={{ display: 'flex', gap: spacing(2), justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setMessage(null)
          }}
          style={{
            ...BUTTON_STYLE,
            background: 'var(--btn-ghost-bg)',
            border: '1px solid var(--btn-ghost-border)',
            borderRadius: 'var(--btn-primary-radius)',
            color: 'var(--btn-ghost-fg)',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            ...BUTTON_STYLE,
            background: 'var(--btn-primary-bg)',
            border: '1px solid var(--btn-primary-bg)',
            borderRadius: 'var(--btn-primary-radius)',
            color: 'var(--btn-primary-fg)',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving' : 'Save'}
        </button>
      </div>
    </form>
  )
}
