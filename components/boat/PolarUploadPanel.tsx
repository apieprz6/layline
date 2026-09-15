'use client'

import { useRef, useState, useTransition, type CSSProperties, type ReactElement } from 'react'
import PolarGrid from '@/components/boat/PolarGrid'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { spacing } from '@/lib/utils/design'
import {
  commitPolarVersion,
  previewPolarUpload,
} from '@/app/(app)/boat-management/polar/actions'
import type { PolarParseWarningCode, PolarUploadPreview } from '@/types'

/**
 * Uploading a **Polar**, in two steps: read the file, then commit it.
 *
 * The first step writes nothing. The admin drops a `.pol`, the server parses it, and the grid it
 * parsed comes back and is drawn — so what is confirmed is what was read, not what was hoped
 * for. The confirm posts the *same file* again, along with the SHA-256 of the bytes that were
 * shown; the server re-parses from the bytes and refuses if they are not those bytes. The grid
 * held in this component is never sent anywhere.
 *
 * A Client Component, because the two steps are one screen: the preview has to survive between
 * them, and the file cannot be re-read from a form once it has been submitted once.
 *
 * `accept` on the input is a convenience for the file chooser and nothing more. A browser types
 * a `.pol` as `text/plain`, as `application/octet-stream`, or as nothing at all depending on the
 * machine, so a MIME check would refuse good files and admit bad ones. Parsing is the gate
 * (ADR 0009), and the gate is on the server.
 */
export default function PolarUploadPanel(): ReactElement {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PolarUploadPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  function reset(): void {
    setFile(null)
    setPreview(null)
    setMessage(null)
    if (input.current) input.current.value = ''
  }

  function onChoose(chosen: File | null): void {
    setPreview(null)
    setMessage(null)
    setSaved(null)
    setFile(chosen)

    if (!chosen) return

    const body = new FormData()
    body.set('file', chosen)

    startTransition(async () => {
      const result = await previewPolarUpload(body)

      if (!result.ok) {
        setMessage(result.message)
        return
      }

      setPreview(result.preview)
    })
  }

  function onConfirm(form: HTMLFormElement): void {
    if (!file || !preview) return

    const body = new FormData(form)
    // The file itself, again. The server parses the bytes rather than trusting the grid the
    // preview produced, so it needs the bytes.
    body.set('file', file)
    body.set('content_sha256', preview.content_sha256)

    startTransition(async () => {
      const result = await commitPolarVersion(body)

      if (!result.ok) {
        setMessage(result.message)
        return
      }

      setSaved(`Saved as v${result.version_number}.`)
      reset()
    })
  }

  return (
    <section data-testid="polar-upload-panel" style={PANEL_STYLE}>
      <div style={EYEBROW_STYLE}>Upload a Polar</div>

      <label htmlFor="polar-file" style={FIELD_LABEL_STYLE}>
        The `.pol` from the certificate or the router, exactly as it came.
      </label>
      <input
        ref={input}
        id="polar-file"
        data-testid="polar-file-input"
        type="file"
        accept=".pol,.txt,.csv,text/plain"
        disabled={pending}
        onChange={(event) => onChoose(event.target.files?.[0] ?? null)}
        style={INPUT_STYLE}
      />

      {pending && preview === null && (
        <p data-testid="polar-upload-reading" style={MUTED_STYLE}>
          Reading the file…
        </p>
      )}

      {message !== null && (
        <p data-testid="polar-upload-error" role="alert" style={ERROR_STYLE}>
          {message}
        </p>
      )}

      {saved !== null && (
        <p data-testid="polar-upload-saved" role="status" style={SAVED_STYLE}>
          {saved}
        </p>
      )}

      {preview !== null && (
        <div data-testid="polar-upload-preview" style={{ marginTop: spacing(4) }}>
          <p style={FILE_LINE_STYLE}>
            <span data-testid="polar-preview-filename">{preview.filename}</span>
            {' · '}
            {formatBytes(preview.byte_length)}
            {' · sha256 '}
            {/* The first twelve characters: enough to tell two files apart by eye, and the whole
                hash is stored on the row for anything that needs to be sure. */}
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {preview.content_sha256.slice(0, 12)}
            </span>
          </p>

          <p style={MUTED_STYLE}>
            {preview.payload.twa_axis.length} wind angles ×{' '}
            {preview.payload.tws_axis.length} wind speeds, read as written. Nothing in the file was
            rounded, reordered or filled in.
          </p>

          {preview.warnings.length > 0 && (
            <ul data-testid="polar-upload-warnings" style={WARNING_LIST_STYLE}>
              {/* Said out loud rather than quietly handled. A file that was tolerated without
                  anybody being told is a file nobody knows was odd. */}
              {preview.warnings.map((warning, index) => (
                <li key={`${warning.code}-${warning.line ?? index}`} style={WARNING_STYLE}>
                  {WARNING_COPY[warning.code]}
                  {warning.line !== undefined && ` (line ${warning.line})`}
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: spacing(3) }}>
            <PolarGrid payload={preview.payload} />
          </div>

          <form
            style={{ marginTop: spacing(4) }}
            onSubmit={(event) => {
              event.preventDefault()
              onConfirm(event.currentTarget)
            }}
          >
            <label htmlFor="polar-effective-from" style={{ ...EYEBROW_STYLE, display: 'block' }}>
              Effective from
            </label>
            <input
              id="polar-effective-from"
              data-testid="polar-effective-from"
              name="effective_from"
              type="date"
              required
              disabled={pending}
              style={TEXT_INPUT_STYLE}
            />
            {/* The sailor's date, with no default. Today would be a guess, and a Version's
                effective date is the day the polar started being true of the boat, which is
                rarely the day somebody got round to uploading it. */}
            <p style={HINT_STYLE}>
              The day this polar started being true of the boat — not today, unless it is.
            </p>

            <label
              htmlFor="polar-note"
              style={{ ...EYEBROW_STYLE, display: 'block', marginTop: spacing(3) }}
            >
              Note (optional)
            </label>
            <textarea
              id="polar-note"
              data-testid="polar-note"
              name="note"
              rows={2}
              disabled={pending}
              style={{ ...TEXT_INPUT_STYLE, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: spacing(3), marginTop: spacing(4) }}>
              <button
                type="submit"
                data-testid="polar-confirm"
                disabled={pending}
                style={CONFIRM_STYLE}
              >
                {pending
                  ? 'Saving…'
                  : `Confirm and save v${preview.next_version_number}`}
              </button>
              <button
                type="button"
                data-testid="polar-cancel"
                disabled={pending}
                onClick={reset}
                style={CANCEL_STYLE}
              >
                Choose another file
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

/**
 * What each tolerated oddity is, in a sentence. Every one of these was seen in the corpus
 * surveyed in `docs/research/orc-polar-file-formats.md`, so all of them are accepted — and all of
 * them are stated, because the point of tolerating a shape is not to hide it.
 */
const WARNING_COPY: Record<PolarParseWarningCode, string> = {
  'bom-stripped': 'The file starts with a byte-order mark. Stepped over, not removed from the file.',
  'crlf-line-endings': 'Windows line endings. Read as lines regardless; the stored file keeps them.',
  'blank-line-skipped': 'A blank line inside the grid. Skipped.',
  'comment-line-skipped': 'A comment line. Skipped.',
  'description-line-skipped': 'A line of free text before the header — usually the boat. Skipped.',
  'trailing-empty-field':
    'Every line ends with a delimiter, so each reads one field wider than it is. Allowed for.',
  'unexpected-header-token':
    'The header does not say twa/tws. Kept exactly as written, and recorded with the Version.',
  'bare-twa-header': 'The header names TWA only, leaving the wind speeds unlabelled.',
  'decimal-comma-normalised': 'Decimal commas, read as decimal points.',
}

/** A file size a person recognises their own file by, and nothing more precise than that. */
function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`
}

const PANEL_STYLE: CSSProperties = {
  padding: spacing(4),
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-md)',
}

const FIELD_LABEL_STYLE: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  marginBottom: spacing(2),
}

const INPUT_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  maxWidth: '100%',
}

const TEXT_INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '9px 10px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--text-primary)',
  background: 'var(--page-bg)',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-sm)',
}

const MUTED_STYLE: CSSProperties = {
  margin: `${spacing(2)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

const HINT_STYLE: CSSProperties = {
  ...MUTED_STYLE,
  fontSize: 'var(--text-xs)',
}

const FILE_LINE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  overflowWrap: 'anywhere',
}

const WARNING_LIST_STYLE: CSSProperties = {
  margin: `${spacing(2)} 0 0`,
  padding: `0 0 0 ${spacing(4)}`,
}

const WARNING_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

const ERROR_STYLE: CSSProperties = {
  margin: `${spacing(2)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--wind-storm)',
}

const SAVED_STYLE: CSSProperties = {
  ...MUTED_STYLE,
  color: 'var(--text-primary)',
}

const CONFIRM_STYLE: CSSProperties = {
  padding: '11px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: '#FFFFFF',
  background: 'var(--blue-500)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
}

const CANCEL_STYLE: CSSProperties = {
  padding: '11px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--text-primary)',
  background: 'transparent',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
}
