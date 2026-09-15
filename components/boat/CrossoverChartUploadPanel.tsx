'use client'

import {
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from 'react'
import CrossoverChartGrid from '@/components/boat/CrossoverChartGrid'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { spacing } from '@/lib/utils/design'
import {
  commitCrossoverChartVersion,
  previewCrossoverChartUpload,
} from '@/app/(app)/boat-management/crossover-chart/actions'
import type {
  CrossoverChartUploadPreview,
  CrossoverDefinitionsParseWarningCode,
  CrossoverGridParseWarningCode,
} from '@/types'

/**
 * Uploading a **Crossover Chart**, in two steps: read both files, then commit them.
 *
 * **Two files, one action.** The chart and its definitions are chosen separately and read together:
 * nothing is previewed until both are present, because half a crossover chart says nothing — a grid
 * of numbers with no definitions behind it, or definitions with no chart to place them in. The two
 * become one Version and are never versioned apart (ADR 0012), so there is no state on this panel in
 * which one half is accepted and the other is not.
 *
 * The first step writes nothing. The admin chooses both files, the server parses each and joins
 * them, and the chart it read comes back and is drawn — so what is confirmed is what was read, not
 * what was hoped for. The confirm posts the *same two files* again, along with the SHA-256 of each
 * set of bytes that was shown; the server re-parses from the bytes and refuses if they are not those
 * bytes. The chart held in this component is never sent anywhere.
 *
 * A Client Component, because the two steps are one screen: the preview has to survive between them,
 * and a file cannot be re-read from a form once it has been submitted once.
 *
 * `accept` on each input is a convenience for the file chooser and nothing more. A browser types a
 * `.sailselect` as `text/plain`, as `application/octet-stream`, or as nothing at all depending on the
 * machine, so a MIME check would refuse good files and admit bad ones. Parsing is the gate
 * (ADR 0009), and the gate is on the server.
 */
export default function CrossoverChartUploadPanel(): ReactElement {
  const [grid, setGrid] = useState<File | null>(null)
  const [definitions, setDefinitions] = useState<File | null>(null)
  const [preview, setPreview] = useState<CrossoverChartUploadPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const gridInput = useRef<HTMLInputElement>(null)
  const definitionsInput = useRef<HTMLInputElement>(null)

  function reset(): void {
    setGrid(null)
    setDefinitions(null)
    setPreview(null)
    setMessage(null)
    if (gridInput.current) gridInput.current.value = ''
    if (definitionsInput.current) definitionsInput.current.value = ''
  }

  /**
   * A file was chosen. Preview as soon as both halves are in hand, and not before — the server
   * refuses a lone half anyway, and telling the admin so after the first of two choices would be
   * an error message about something they are halfway through doing.
   */
  function onChoose(which: 'grid' | 'definitions', chosen: File | null): void {
    setPreview(null)
    setMessage(null)
    setSaved(null)

    const next = {
      grid: which === 'grid' ? chosen : grid,
      definitions: which === 'definitions' ? chosen : definitions,
    }

    if (which === 'grid') setGrid(chosen)
    else setDefinitions(chosen)

    if (!next.grid || !next.definitions) return

    const body = new FormData()
    body.set('grid', next.grid)
    body.set('definitions', next.definitions)

    startTransition(async () => {
      const result = await previewCrossoverChartUpload(body)

      if (!result.ok) {
        setMessage(result.message)
        return
      }

      setPreview(result.preview)
    })
  }

  function onConfirm(form: HTMLFormElement): void {
    if (!grid || !definitions || !preview) return

    const body = new FormData(form)
    // Both files themselves, again. The server parses the bytes rather than trusting the chart the
    // preview produced, so it needs the bytes.
    body.set('grid', grid)
    body.set('definitions', definitions)
    body.set('grid_content_sha256', preview.grid.content_sha256)
    body.set('definitions_content_sha256', preview.definitions.content_sha256)

    startTransition(async () => {
      const result = await commitCrossoverChartVersion(body)

      if (!result.ok) {
        setMessage(result.message)
        return
      }

      setSaved(`Saved as v${result.version_number}.`)
      reset()
    })
  }

  return (
    <section data-testid="crossover-chart-upload-panel" style={PANEL_STYLE}>
      <div style={EYEBROW_STYLE}>Upload a Crossover Chart</div>

      {/* No backticks around the extensions: this is a sentence a sailor reads, not markdown. */}
      <p id="crossover-chart-hint" style={FIELD_LABEL_STYLE}>
        Both files from the router: the sail chart and the definitions that name its sails. They are
        saved as one Version, so neither can drift away from the other.
      </p>

      <FileRow
        id="crossover-chart-grid-file"
        testid="crossover-chart-grid-file"
        label="Choose the sail chart"
        accept=".sailselect,.txt,.csv,text/plain"
        hint="crossover-chart-hint"
        inputRef={gridInput}
        chosen={grid}
        pending={pending}
        onChoose={(chosen) => onChoose('grid', chosen)}
      />

      <FileRow
        id="crossover-chart-definitions-file"
        testid="crossover-chart-definitions-file"
        label="Choose the sail definitions"
        accept=".saildesc,.saildef,.txt,.csv,text/plain"
        hint="crossover-chart-hint"
        inputRef={definitionsInput}
        chosen={definitions}
        pending={pending}
        onChoose={(chosen) => onChoose('definitions', chosen)}
      />

      {/* Said before it is an error: one of two files chosen is the middle of the task, not a
          mistake in it. */}
      {(grid === null) !== (definitions === null) && (
        <p data-testid="crossover-chart-upload-waiting" style={MUTED_STYLE}>
          {grid === null
            ? 'Now choose the sail chart, and both will be read together.'
            : 'Now choose the sail definitions, and both will be read together.'}
        </p>
      )}

      {pending && preview === null && (
        <p data-testid="crossover-chart-upload-reading" style={MUTED_STYLE}>
          Reading both files…
        </p>
      )}

      {message !== null && (
        <p data-testid="crossover-chart-upload-error" role="alert" style={ERROR_STYLE}>
          {message}
        </p>
      )}

      {saved !== null && (
        <p data-testid="crossover-chart-upload-saved" role="status" style={SAVED_STYLE}>
          {saved}
        </p>
      )}

      {preview !== null && (
        <div data-testid="crossover-chart-upload-preview" style={{ marginTop: spacing(4) }}>
          <p style={FILE_LINE_STYLE}>
            <span data-testid="crossover-chart-preview-grid-filename">
              {preview.grid.filename}
            </span>
            {' · '}
            {formatBytes(preview.grid.byte_length)}
            {' · sha256 '}
            {/* The first twelve characters: enough to tell two files apart by eye, and the whole
                hash is stored with the Version for anything that needs to be sure. */}
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {preview.grid.content_sha256.slice(0, 12)}
            </span>
          </p>
          <p style={FILE_LINE_STYLE}>
            <span data-testid="crossover-chart-preview-definitions-filename">
              {preview.definitions.filename}
            </span>
            {' · '}
            {formatBytes(preview.definitions.byte_length)}
            {' · sha256 '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {preview.definitions.content_sha256.slice(0, 12)}
            </span>
          </p>

          <p style={MUTED_STYLE}>
            {preview.payload.twa_axis.length} wind angles ×{' '}
            {preview.payload.tws_axis.length} wind speeds, and{' '}
            {preview.payload.sail_definitions.length} sail
            {preview.payload.sail_definitions.length === 1 ? '' : 's'}, read as written. Nothing in
            either file was renumbered, reordered or renamed.
          </p>

          {(preview.grid_warnings.length > 0 || preview.definitions_warnings.length > 0) && (
            <ul data-testid="crossover-chart-upload-warnings" style={WARNING_LIST_STYLE}>
              {/* Said out loud rather than quietly handled. A file that was tolerated without
                  anybody being told is a file nobody knows was odd. Which file it was about is
                  named, because the two are read by different rules. */}
              {preview.grid_warnings.map((warning, index) => (
                <li key={`grid-${warning.code}-${warning.line ?? index}`} style={WARNING_STYLE}>
                  The chart: {GRID_WARNING_COPY[warning.code]}
                  {warning.line !== undefined && ` (line ${warning.line})`}
                </li>
              ))}
              {preview.definitions_warnings.map((warning, index) => (
                <li
                  key={`definitions-${warning.code}-${warning.line ?? index}`}
                  style={WARNING_STYLE}
                >
                  The definitions: {DEFINITIONS_WARNING_COPY[warning.code]}
                  {warning.line !== undefined && ` (line ${warning.line})`}
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: spacing(3) }}>
            <CrossoverChartGrid payload={preview.payload} />
          </div>

          <form
            style={{ marginTop: spacing(4) }}
            onSubmit={(event) => {
              event.preventDefault()
              onConfirm(event.currentTarget)
            }}
          >
            <label
              htmlFor="crossover-chart-effective-from"
              style={{ ...EYEBROW_STYLE, display: 'block' }}
            >
              Effective from
            </label>
            <input
              id="crossover-chart-effective-from"
              data-testid="crossover-chart-effective-from"
              name="effective_from"
              type="date"
              required
              disabled={pending}
              style={TEXT_INPUT_STYLE}
            />
            {/* The sailor's date, with no default. Today would be a guess, and a Version's
                effective date is the day this chart started being how the boat is sailed, which is
                rarely the day somebody got round to uploading it. */}
            <p style={HINT_STYLE}>
              The day this chart started being how the boat is sailed — not today, unless it is.
            </p>

            <label
              htmlFor="crossover-chart-note"
              style={{ ...EYEBROW_STYLE, display: 'block', marginTop: spacing(3) }}
            >
              Note (optional)
            </label>
            <textarea
              id="crossover-chart-note"
              data-testid="crossover-chart-note"
              name="note"
              rows={2}
              disabled={pending}
              style={{ ...TEXT_INPUT_STYLE, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: spacing(3), marginTop: spacing(4) }}>
              <button
                type="submit"
                data-testid="crossover-chart-confirm"
                disabled={pending}
                style={CONFIRM_STYLE}
              >
                {pending ? 'Saving…' : `Confirm and save v${preview.next_version_number}`}
              </button>
              <button
                type="button"
                data-testid="crossover-chart-cancel"
                disabled={pending}
                onClick={reset}
                style={CANCEL_STYLE}
              >
                Choose other files
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

interface FileRowProps {
  id: string
  testid: string
  label: string
  accept: string
  hint: string
  inputRef: RefObject<HTMLInputElement | null>
  chosen: File | null
  pending: boolean
  onChoose: (chosen: File | null) => void
}

/**
 * One of the two file choosers, drawn as one control.
 *
 * The control is the file input itself, wearing a button. Its default rendering — a grey "Choose
 * File" beside the words "No file chosen" — reads as a caption rather than as a thing to do, and
 * this card asks for two of them. It is not replaced by a `button` that clicks it from JavaScript:
 * the real input stays in the page, so a click, a tap, a Space press and a dropped file all land
 * where the browser expects them to.
 */
function FileRow({
  id,
  testid,
  label,
  accept,
  hint,
  inputRef,
  chosen,
  pending,
  onChoose,
}: FileRowProps): ReactElement {
  const [focused, setFocused] = useState(false)

  return (
    <div style={CHOOSE_ROW_STYLE}>
      <label
        htmlFor={id}
        data-testid={`${testid}-button`}
        style={{
          ...CHOOSE_STYLE,
          cursor: pending ? 'progress' : 'pointer',
          opacity: pending ? 0.6 : 1,
          // The focus ring belongs on what is drawn, and the input that has the focus is
          // invisible — so the ring is moved by hand rather than by `:focus-visible`. Not
          // `--focus-ring`: it is the same blue as this button, and a blue ring drawn against
          // blue is no ring at all. The card's own surface makes the gap.
          boxShadow: focused
            ? '0 0 0 2px var(--surface-raised), 0 0 0 4px var(--blue-500)'
            : undefined,
        }}
      >
        <input
          ref={inputRef}
          id={id}
          data-testid={`${testid}-input`}
          type="file"
          accept={accept}
          aria-describedby={hint}
          disabled={pending}
          onChange={(event) => onChoose(event.target.files?.[0] ?? null)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={HIDDEN_INPUT_STYLE}
        />
        <span aria-hidden="true">↑</span>
        {label}
      </label>

      <span
        data-testid={`${testid}-chosen`}
        style={chosen === null ? NO_FILE_STYLE : CHOSEN_FILE_STYLE}
      >
        {chosen === null ? 'No file chosen yet' : chosen.name}
      </span>
    </div>
  )
}

/**
 * What each oddity tolerated in the *chart* is, in a sentence. Every text-level shape a `.pol` may
 * carry a `.sailselect` may carry too — it is the same kind of document, read by the same reader —
 * so the copy is the Polar's where the code is shared, and its own where it is not.
 */
const GRID_WARNING_COPY: Record<CrossoverGridParseWarningCode, string> = {
  'bom-stripped': 'starts with a byte-order mark. Stepped over, not removed from the file.',
  'crlf-line-endings':
    'has Windows line endings. Read as lines regardless; the stored file keeps them.',
  'blank-line-skipped': 'has a blank line inside the grid. Skipped.',
  'comment-line-skipped': 'has a comment line. Skipped.',
  'description-line-skipped':
    'has a line of free text before the header — usually the boat. Skipped.',
  'trailing-empty-field':
    'ends every line with a delimiter, so each reads one field wider than it is. Allowed for.',
  'unexpected-header-token':
    'does not say twa/tws in its header. Kept exactly as written, and recorded with the Version.',
  'bare-twa-header': 'names TWA only in its header, leaving the wind speeds unlabelled.',
  // Eight codes, one fewer than the Polar's nine: a sail id is a whole number, so there is no
  // decimal separator for a locale to disagree about and `decimal-comma-normalised` cannot be
  // raised here. The union says so, which is why this map need not.
}

/** And what each oddity tolerated in the *definitions* is. */
const DEFINITIONS_WARNING_COPY: Record<CrossoverDefinitionsParseWarningCode, string> = {
  'bom-stripped': 'start with a byte-order mark. Stepped over, not removed from the file.',
  'crlf-line-endings':
    'have Windows line endings. Read as lines regardless; the stored file keeps them.',
  'blank-line-skipped': 'have a blank line in them. Skipped.',
  'comment-line-skipped': 'have a comment line. Skipped.',
  'numbers-not-ascending':
    'are not in ascending order of sail number. Kept in the order the file gave them.',
  'label-whitespace-trimmed':
    'have a label padded with spaces. Trimmed for display; the stored file keeps them.',
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
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  margin: `0 0 ${spacing(3)}`,
}

const CHOOSE_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  // Wraps at 390px, where a long filename and the button do not share a line.
  flexWrap: 'wrap',
  gap: spacing(3),
  marginBottom: spacing(3),
}

const CHOOSE_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: spacing(2),
  // Its own line height, so each of the card's two actions is the size of a thumb on the phone
  // this is read on.
  padding: '11px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--btn-primary-fg)',
  background: 'var(--btn-primary-bg)',
  border: '1px solid var(--btn-primary-bg)',
  borderRadius: 'var(--btn-primary-radius)',
  // The input inside is absolutely positioned against this.
  position: 'relative',
}

/**
 * Out of the flow but still the focusable control: `display: none` would take the input out of the
 * tab order and out of the accessibility tree, leaving a label that only a mouse can use.
 */
const HIDDEN_INPUT_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  // Under the label it belongs to, so the browser's own focus outline — where it draws one
  // anyway — lands on the button rather than beside it.
  inset: 0,
}

const CHOSEN_FILE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  overflowWrap: 'anywhere',
  minWidth: 0,
}

const NO_FILE_STYLE: CSSProperties = {
  ...CHOSEN_FILE_STYLE,
  color: 'var(--text-muted)',
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
  color: 'var(--btn-primary-fg)',
  background: 'var(--btn-primary-bg)',
  border: '1px solid var(--btn-primary-bg)',
  borderRadius: 'var(--btn-primary-radius)',
  cursor: 'pointer',
}

const CANCEL_STYLE: CSSProperties = {
  padding: '11px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--btn-ghost-fg)',
  background: 'var(--btn-ghost-bg)',
  border: '1px solid var(--btn-ghost-border)',
  borderRadius: 'var(--btn-primary-radius)',
  cursor: 'pointer',
}
