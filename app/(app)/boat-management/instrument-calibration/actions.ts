'use server'

import { revalidatePath } from 'next/cache'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { CALIBRATION_CHANNELS, parseCalibrationPayload } from '@/lib/boat/calibration'
import { isCalendarDate } from '@/lib/utils/calendarDate'
import { createClient } from '@/lib/supabase/server'
import type { Account, CalibrationChannel, CalibrationEventType } from '@/types'

/**
 * The three writes on the **Instrument Calibration** screen: minting a Version,
 * correcting one in place, and adding a **Calibration Event**.
 *
 * A Server Action is a public endpoint, so each one re-checks the **Role** on the
 * server from the **Profile** — the client not rendering a form is a courtesy, not the
 * check. RLS refuses the same write a second time through `public.is_admin()`, which
 * is why a rejected write is reported rather than assumed impossible.
 *
 * Refusals are returned rather than thrown, so a form can put the reason beside the
 * fields that caused it and keep what was typed.
 *
 * What none of these do is *push anything to the instruments*. Layline cannot reach
 * the TL-25, and the mockup's "Push to instruments?" banner is a control over
 * hardware this application has no route to (ADR 0005).
 */

export type CalibrationWriteResult = { ok: true } | { ok: false; message: string }

/** What the sailor is told when the reason is ours and not theirs. */
const UNAVAILABLE = 'The change could not be saved. Try again.'

/** One field, as a trimmed string. Absent and blank are the same thing to a caller. */
function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * An optional note: prose, or nothing at all.
 *
 * A blank becomes `null` rather than `''`. An empty string in the column would read as
 * a note somebody wrote, and the diff already says what changed — ADR 0005 is explicit
 * that a note is for what the diff cannot reconstruct.
 */
function optionalNote(formData: FormData): string | null {
  const note = field(formData, 'note')
  return note === '' ? null : note
}

type Ready = { account: Account; supabase: Awaited<ReturnType<typeof createClient>> }

/**
 * The admin check and the client, or the refusal to report instead.
 *
 * Shared by all three writes because all three carry the same authorization: every
 * signed-in sailor reads the whole screen and only an `admin` writes any part of it
 * (ADR 0019).
 */
async function readyToWrite(what: string): Promise<Ready | { message: string }> {
  const account = await resolveAccount()

  // Both halves stated: `canWrite` alone narrows nothing, and a Guest — `null` — is
  // refused by the same sentence as a viewer.
  if (account === null || !canWrite(account)) {
    return { message: 'Only an admin can record calibration.' }
  }

  try {
    return { account, supabase: await createClient() }
  } catch (thrown: unknown) {
    console.error(
      `${what}: Supabase client unavailable:`,
      thrown instanceof Error ? thrown.message : thrown
    )
    return { message: UNAVAILABLE }
  }
}

/**
 * The `instrument_calibration` artifact row.
 *
 * Read on the server every time and never taken from the form: there is one boat and
 * one artifact row per kind, so an id in the request would only be an id the caller
 * chose.
 */
async function readArtifact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  what: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('boat_setup_artifacts')
    .select('id')
    .eq('kind', 'instrument_calibration')
    .maybeSingle<{ id: string }>()

  if (error || !data) {
    console.error(`${what}: no artifact row to write to:`, error?.message ?? 'no row')
    return null
  }

  return data
}

/** The four transcribed channels, read off a submitted form. */
function readPayload(formData: FormData) {
  return parseCalibrationPayload((name) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value : null
  })
}

/** Both screens that state what the calibration is, so both are refetched. */
function revalidateCalibration(): void {
  revalidatePath('/boat-management/instrument-calibration')
  // The Boat Setup list states the Version in force by number and effective date.
  revalidatePath('/boat-management')
}

/**
 * Mints a new **Instrument Calibration** Version from the four transcribed channels.
 *
 * A Version snapshots all four channels at once, so the form submits all four
 * whichever one moved. Anything that is not a figure is refused; a figure that merely
 * looks unlikely is *not* — plausibility warns and never blocks, because the display
 * is the authority on what is programmed into it.
 */
export async function recordCalibrationVersion(
  formData: FormData
): Promise<CalibrationWriteResult> {
  const ready = await readyToWrite('Calibration Version')
  if (!('account' in ready)) return { ok: false, message: ready.message }
  const { account, supabase } = ready

  const effectiveFrom = field(formData, 'effective_from')
  if (!isCalendarDate(effectiveFrom)) {
    return { ok: false, message: 'Give the date these numbers went into the display.' }
  }

  const parsed = readPayload(formData)
  if (!parsed.ok) return { ok: false, message: parsed.message }

  const artifact = await readArtifact(supabase, 'Calibration Version')
  if (!artifact) return { ok: false, message: UNAVAILABLE }

  const { data: latest, error: latestError } = await supabase
    .from('boat_setup_versions')
    .select('version_number')
    .eq('artifact_id', artifact.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle<{ version_number: number }>()

  if (latestError) {
    console.error('Calibration Version: could not read the latest version:', latestError.message)
    return { ok: false, message: UNAVAILABLE }
  }

  const versionNumber = (latest?.version_number ?? 0) + 1

  // `filename` and `content_sha256` are left to their NULL default rather than sent:
  // `file_backed_kinds_only` refuses either one on this kind, because an Instrument
  // Calibration is typed off a display and has no file behind it.
  const { data: minted, error: insertError } = await supabase
    .from('boat_setup_versions')
    .insert({
      artifact_id: artifact.id,
      kind: 'instrument_calibration',
      version_number: versionNumber,
      effective_from: effectiveFrom,
      note: optionalNote(formData),
      created_by: account.userId,
      payload: parsed.payload,
    })
    .select('id')
    .maybeSingle<{ id: string }>()

  if (insertError || !minted) {
    // `UNIQUE (artifact_id, version_number)` is what a second writer racing this one
    // would hit. One boat, one writer today — but reported rather than assumed away.
    console.error(
      'Calibration Version: insert failed:',
      insertError?.message ?? 'no row returned'
    )
    return { ok: false, message: UNAVAILABLE }
  }

  const { error: pointerError } = await supabase
    .from('boat_setup_artifacts')
    .update({ current_version_id: minted.id })
    .eq('id', artifact.id)

  if (pointerError) {
    // The Version is recorded and is not current. Both halves are said, and the cost
    // of the recovery with them: until the pointer moves, "As programmed" still
    // reports the *previous* Version as what the boat is set to, which is a worse
    // thing to leave standing than a second Version the Log will show as having moved
    // no figure. So recording again is the right advice, and the duplicate is named
    // rather than sprung on the sailor afterwards.
    console.error('Calibration Version: current pointer not moved:', pointerError.message)
    revalidateCalibration()
    return {
      ok: false,
      message: `Recorded as v${versionNumber}, but it could not be made the current Version — so this screen still reports the one before it. It is in the Calibration Log. Recording the same figures again once the connection is back will fix that, and will add a Version the Log shows as moving nothing.`,
    }
  }

  revalidateCalibration()
  return { ok: true }
}

/**
 * Corrects an existing Version in place — the one scoped exception to Version
 * immutability.
 *
 * Left uncorrectable, a mistyped figure would stand permanently as what the boat ran,
 * and every Race pointing at it would report against a number that never existed
 * (ADR 0005). Only the payload, the note and the effective date are sent: the version
 * number, the author, `recorded_at` and the kind are refused by
 * `enforce_version_immutability()` in the database, and `recorded_at` keeps meaning
 * *when this Version was first entered*.
 */
export async function correctCalibrationVersion(
  formData: FormData
): Promise<CalibrationWriteResult> {
  const ready = await readyToWrite('Calibration correction')
  if (!('account' in ready)) return { ok: false, message: ready.message }
  const { supabase } = ready

  const versionId = field(formData, 'version_id')
  if (versionId === '') return { ok: false, message: UNAVAILABLE }

  const effectiveFrom = field(formData, 'effective_from')
  if (!isCalendarDate(effectiveFrom)) {
    return { ok: false, message: 'Give the date these numbers went into the display.' }
  }

  const parsed = readPayload(formData)
  if (!parsed.ok) return { ok: false, message: parsed.message }

  // Filtered on `kind` as well as `id`: the trigger would refuse a Version of any
  // other kind, and this makes a caller-supplied id unable to reach one at all.
  const { data: corrected, error } = await supabase
    .from('boat_setup_versions')
    .update({
      payload: parsed.payload,
      note: optionalNote(formData),
      effective_from: effectiveFrom,
    })
    .eq('id', versionId)
    .eq('kind', 'instrument_calibration')
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error || !corrected) {
    console.error(
      'Calibration correction: update failed:',
      error?.message ?? 'no row matched'
    )
    return { ok: false, message: UNAVAILABLE }
  }

  revalidateCalibration()
  return { ok: true }
}

const EVENT_TYPES: readonly string[] = ['autocompensation', 'other']

/** Whether a submitted string names one of the two Calibration Event types. */
function isEventType(value: string): value is CalibrationEventType {
  return EVENT_TYPES.includes(value)
}

/** Whether a submitted string names one of the four Calibration Channels. */
function isChannel(value: string): value is CalibrationChannel {
  return (CALIBRATION_CHANNELS as readonly string[]).includes(value)
}

/**
 * Adds a **Calibration Event**: a dated act with **no value**.
 *
 * The note is required — an event with no account of itself records nothing — and
 * there is no numeric field anywhere in this function. Numbers live in Instrument
 * Calibration, and a Measured Offset is derived from a Race and never written back
 * into the Log.
 */
export async function addCalibrationEvent(formData: FormData): Promise<CalibrationWriteResult> {
  const ready = await readyToWrite('Calibration Event')
  if (!('account' in ready)) return { ok: false, message: ready.message }
  const { account, supabase } = ready

  const occurredOn = field(formData, 'occurred_on')
  if (!isCalendarDate(occurredOn)) {
    return { ok: false, message: 'Give the date this was done.' }
  }

  const type = field(formData, 'type')
  if (!isEventType(type)) {
    return { ok: false, message: 'Say whether this was an autocompensation or something else.' }
  }

  const submitted = formData
    .getAll('channels')
    .map((value) => (typeof value === 'string' ? value.trim() : ''))

  if (submitted.some((value) => !isChannel(value))) {
    return { ok: false, message: 'That is not one of the four calibration channels.' }
  }

  const channels = submitted.filter(isChannel)

  if (channels.length === 0) {
    return { ok: false, message: 'Say which channels this was performed on.' }
  }

  // Duplicates are the application's to catch: a CHECK cannot hold the subquery that
  // would find them, so the migration leaves this one rule up here deliberately.
  if (new Set(channels).size !== channels.length) {
    return { ok: false, message: 'Each channel can only be named once.' }
  }

  // An autocompensation is a compass operation by definition, so `{HDG}` is not a
  // default filled in for a caller who named something else — it is a refusal.
  // `autocompensation_is_hdg_only` refuses it in the database too.
  if (type === 'autocompensation' && (channels.length !== 1 || channels[0] !== 'HDG')) {
    return {
      ok: false,
      message: 'An autocompensation is a compass operation: it can only be performed on HDG.',
    }
  }

  const note = field(formData, 'note')
  if (note === '') {
    return { ok: false, message: 'Say what was done. An event with no note records nothing.' }
  }

  const artifact = await readArtifact(supabase, 'Calibration Event')
  if (!artifact) return { ok: false, message: UNAVAILABLE }

  const { error } = await supabase.from('calibration_events').insert({
    artifact_id: artifact.id,
    kind: 'instrument_calibration',
    occurred_on: occurredOn,
    type,
    // Stored in the vocabulary's own order, so one set has one representation.
    channels: CALIBRATION_CHANNELS.filter((channel) => channels.includes(channel)),
    note,
    created_by: account.userId,
  })

  if (error) {
    console.error('Calibration Event: insert failed:', error.message)
    return { ok: false, message: UNAVAILABLE }
  }

  revalidateCalibration()
  return { ok: true }
}
