/**
 * The flow's sections, and the two ways it walks them.
 *
 * One flow, two modes (ADR 0010 Amendment 1, ADR 0014). Uploading a race is a sequence — a file, then
 * the window, then what the sailor said, then a look at the whole thing — because none of those
 * questions can be answered before the one above it. Amending one is not a sequence at all: the
 * Transcription is already stored, so every question is answerable immediately and in any order, and
 * the race's page links straight into the section a chip belongs to.
 *
 * `file` is absent from `AMEND_SECTIONS`, and that absence is the whole shape of the amendment. There
 * is no file input on the amend path, no bytes are read or hashed or moved, and the duplicate-content
 * question cannot arise — the flow's rows come from a Transcription rather than from a parse, which
 * puts the parse boundary outside the flow.
 *
 * `review` is absent for a different reason: an amendment is one save with no gate in front of it, so
 * there is nothing for a Review step to hold back. `setup` and `title` are present for the mirror of
 * that reason — upload asks both on Review, and with Review gone they need somewhere of their own to
 * live and a chip of their own to be reached from.
 *
 * This module holds no JSX and is not a client module, so a Server Component can read a `?section=`
 * against it without pulling the flow into its own graph.
 */

export type Section = 'file' | 'window' | 'sails' | 'sea' | 'setup' | 'title' | 'review'

/** What each section is called, wherever it is named — a tab, the mode line, a chip on the race. */
export const SECTION_LABELS: Record<Section, string> = {
  file: 'File',
  window: 'Window',
  sails: 'Sails',
  sea: 'Sea state',
  setup: 'Boat Setup',
  title: 'Title',
  review: 'Review',
}

/** ADR 0014's five, in the one order they can be asked in. */
export const UPLOAD_STEPS: readonly Section[] = ['file', 'window', 'sails', 'sea', 'review']

/**
 * The five an amendment offers, in the order they are *listed* and in no order they are answered in.
 *
 * Listed in the order the race's own page states them, so the tab row and the page read the same way
 * down. Every one of them is reachable from every other, and from the page, at any point.
 */
export const AMEND_SECTIONS: readonly Section[] = ['window', 'sails', 'sea', 'setup', 'title']

/**
 * Which section a link asked for, defaulting to the window.
 *
 * A `?section=` is whatever the address bar holds, so an unknown one — or a `file`, or a `review`,
 * neither of which the amendment has — lands on the window rather than on a section that is not
 * drawn. The window is the default because it is the answer the other four are stated against.
 */
export function amendSection(value: string | undefined): Section {
  const wanted = AMEND_SECTIONS.find((section) => section === value)
  return wanted ?? 'window'
}
