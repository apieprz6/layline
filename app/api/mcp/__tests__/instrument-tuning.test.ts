/**
 * @jest-environment node
 */

import { POST } from '../route'
import { tuningSeason } from '@/components/boat/instrument-tuning/__tests__/fixtures'
import { authenticateMcpRequest } from '@/lib/mcp/auth'
import { readCalibrationLog, readInstrumentTuning } from '@/services/analysis/readInstrumentTuning'
import { instrumentTuningRaceAnswer, instrumentTuningSeasonAnswer } from '@/services/mcp/instrument-tuning'
import { readRace } from '@/services/races/readRace'
import { readRaces } from '@/services/races/readRaces'
import type { RaceDetail, RaceListEntry } from '@/types'

/**
 * `instrument_tuning` through the endpoint: who may call it, which client its reads go through,
 * and what a refusal looks like. What each answer states is
 * `services/mcp/__tests__/instrument-tuning.test.tsx`'s.
 *
 * The reads are stubbed at the reader, because each has its own suite; what is asserted here is
 * that the tool hands them the caller's client and states what they return.
 */

jest.mock('@/lib/mcp/auth', () => ({ authenticateMcpRequest: jest.fn() }))
jest.mock('@/services/analysis/readInstrumentTuning', () => ({
  readInstrumentTuning: jest.fn(),
  readCalibrationLog: jest.fn(),
}))
jest.mock('@/services/races/readRace', () => ({ readRace: jest.fn() }))
jest.mock('@/services/races/readRaces', () => ({ readRaces: jest.fn() }))

const authenticate = authenticateMcpRequest as jest.MockedFunction<typeof authenticateMcpRequest>
const tuning = readInstrumentTuning as jest.MockedFunction<typeof readInstrumentTuning>
const calibrationLog = readCalibrationLog as jest.MockedFunction<typeof readCalibrationLog>
const race = readRace as jest.MockedFunction<typeof readRace>
const races = readRaces as jest.MockedFunction<typeof readRaces>

/** The client built from the caller's own token: RLS reads as them, never as the service role. */
const CALLERS_CLIENT = { caller: 'crew' } as never

const SEASON = tuningSeason()
const RACE_REFS = [
  { race_id: 'race-1', title: 'Beer-can 3', window_start: '2026-06-03T18:00:00' },
  { race_id: 'race-2', title: null, window_start: '2026-06-10T18:00:00' },
]

const RACE: Pick<RaceDetail, 'id' | 'title' | 'window_start' | 'instruments'> = {
  id: 'race-2',
  title: null,
  window_start: '2026-06-10T18:00:00',
  instruments: {
    heading: { ok: false, race_id: 'race-2', window_start: '2026-06-10T18:00:00', reason: 'too-few-rows', row_count: 2 },
    heading_swing_deg: null,
    asymmetry: { ok: false, race_id: 'race-2', window_start: '2026-06-10T18:00:00', reason: 'too-few-rows', row_count: 2 },
    speed: { fitted: false, reason: 'no-points' },
  },
}

const LISTED = RACE_REFS.map((ref) => ({ id: ref.race_id, title: ref.title, window_start: ref.window_start })) as RaceListEntry[]

function call(args: object): Request {
  return new Request('https://layline.example/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      authorization: 'Bearer t',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'instrument_tuning', arguments: args },
    }),
  })
}

interface ToolResult {
  isError?: boolean
  content: { type: string; text: string }[]
  structuredContent?: Record<string, unknown>
}

async function result(args: object): Promise<ToolResult> {
  const response = await POST(call(args))
  return (await response.json()).result
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  authenticate.mockResolvedValue({
    supabase: CALLERS_CLIENT,
    authInfo: { token: 't', clientId: 'claude', scopes: [] },
  })
  tuning.mockResolvedValue({ ok: true, season: SEASON, log: [], races: RACE_REFS })
  calibrationLog.mockResolvedValue([])
  race.mockImplementation(async (id) => (id === RACE.id ? (RACE as RaceDetail) : null))
  races.mockResolvedValue(LISTED)
})

afterEach(() => jest.restoreAllMocks())

describe('instrument_tuning', () => {
  it('is not answered, or even listed, to a caller with no Account', async () => {
    authenticate.mockResolvedValue(null)

    const response = await POST(call({}))

    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain('instrument_tuning')
    expect(tuning).not.toHaveBeenCalled()
  })

  it("answers the season through the caller's own client", async () => {
    const answer = await result({})

    expect(tuning).toHaveBeenCalledWith(CALLERS_CLIENT)
    expect(answer.isError).toBeFalsy()
    expect(answer.structuredContent).toEqual(instrumentTuningSeasonAnswer(SEASON, RACE_REFS))
    expect(JSON.parse(answer.content[0].text)).toEqual(answer.structuredContent)
  })

  it('answers one channel of the season', async () => {
    const answer = await result({ channel: 'STW' })

    expect(answer.structuredContent).toEqual(
      instrumentTuningSeasonAnswer(SEASON, RACE_REFS, 'STW')
    )
  })

  it("answers one Race's check through the caller's own client, with its Calibration Log", async () => {
    const answer = await result({ race: RACE.id, channel: 'HDG' })

    expect(race).toHaveBeenCalledWith(RACE.id, CALLERS_CLIENT)
    expect(calibrationLog).toHaveBeenCalledWith(CALLERS_CLIENT)
    expect(answer.structuredContent).toEqual(instrumentTuningRaceAnswer(RACE, [], 'HDG'))
  })

  it('refuses an unknown channel, naming the three there are', async () => {
    const answer = await result({ channel: 'AWS' })

    expect(answer.isError).toBe(true)
    expect(answer.content[0].text).toMatch(/HDG.*AWA.*STW/)
    expect(tuning).not.toHaveBeenCalled()
  })

  it('refuses an unknown Race, naming the ones there are', async () => {
    const answer = await result({ race: 'race-9' })

    expect(answer.isError).toBe(true)
    expect(races).toHaveBeenCalledWith(CALLERS_CLIENT)
    expect(answer.content[0].text).toContain('race-9')
    for (const listed of LISTED) expect(answer.content[0].text).toContain(listed.id)
    // Each named as the charts name it, so Claude can tell the sailor which is which.
    expect(answer.content[0].text).toContain('3 Jun · Beer-can 3')
    expect(answer.content[0].text).toContain('(10 Jun)')
  })

  it('says so when the archive holds no Race, which is an answer and not a failure', async () => {
    tuning.mockResolvedValue({ ok: false, reason: 'no-races' })

    const answer = await result({})

    expect(answer.isError).toBeFalsy()
    expect(answer.structuredContent).toMatchObject({ scope: 'season', races: 0, channels: [] })
  })

  it.each([
    ['the season', {}, () => tuning.mockResolvedValue({ ok: false, reason: 'unreadable' })],
    ['a Race’s Calibration Log', { race: RACE.id }, () => calibrationLog.mockResolvedValue(null)],
  ])('makes a failed read of %s an error, never a figure over part of it', async (_name, args, fail) => {
    fail()

    const answer = await result(args)

    expect(answer.isError).toBe(true)
    expect(answer.structuredContent).toBeUndefined()
    expect(answer.content[0].text).toMatch(/could not be read/)
  })
})
