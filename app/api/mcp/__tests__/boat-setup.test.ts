/**
 * @jest-environment node
 */

import { POST } from '../route'
import { authenticateMcpRequest } from '@/lib/mcp/auth'
import { readBoatSetup } from '@/services/boat/readBoatSetup'
import { readCrossoverChartVersionsWithCharts } from '@/services/boat/readCrossoverChartVersions'
import { readInstrumentCalibration } from '@/services/boat/readInstrumentCalibration'
import { readPolarVersions } from '@/services/boat/readPolarVersions'
import { readRigTune } from '@/services/boat/readRigTune'
import { boatSetupOverview, rigTuneVersions } from '@/services/mcp/boat-setup'
import type { BoatSetup, RigTunePage } from '@/types'

/**
 * `boat_setup` through the endpoint: who may call it, which client its reads go through, and what
 * a refusal looks like. What each answer states is `services/mcp/__tests__/boat-setup.test.tsx`'s.
 *
 * The Boat Management reads are stubbed at the reader, because each has its own suite; what is
 * asserted here is that the tool hands them the caller's client and states what they return.
 */

jest.mock('@/lib/mcp/auth', () => ({ authenticateMcpRequest: jest.fn() }))
jest.mock('@/services/boat/readBoatSetup', () => ({ readBoatSetup: jest.fn() }))
jest.mock('@/services/boat/readRigTune', () => ({ readRigTune: jest.fn() }))
jest.mock('@/services/boat/readInstrumentCalibration', () => ({ readInstrumentCalibration: jest.fn() }))
jest.mock('@/services/boat/readPolarVersions', () => ({ readPolarVersions: jest.fn() }))
jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartVersionsWithCharts: jest.fn(),
}))

const authenticate = authenticateMcpRequest as jest.MockedFunction<typeof authenticateMcpRequest>
const boatSetup = readBoatSetup as jest.MockedFunction<typeof readBoatSetup>
const rigTune = readRigTune as jest.MockedFunction<typeof readRigTune>

/** The client built from the caller's own token: RLS reads as them, never as the service role. */
const CALLERS_CLIENT = { caller: 'crew' } as never

const BOAT = {
  id: 'boat-1',
  name: 'Handsome Pete',
  model: 'J/105',
  icon_path: null,
  icon_updated_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const SETUP: BoatSetup = {
  boat: BOAT,
  artifacts: [
    { kind: 'polar', current: { version_number: 1, effective_from: '2026-04-21' } },
    { kind: 'crossover_chart', current: null },
    { kind: 'rig_tune', current: { version_number: 2, effective_from: '2026-08-02' } },
    { kind: 'instrument_calibration', current: null },
  ],
}

const RIG_TUNE: RigTunePage = {
  boat: BOAT,
  artifact_id: 'artifact-rig',
  current_version_id: 'rig-v2',
  versions: [2, 1].map((number) => ({
    id: `rig-v${number}`,
    version_number: number,
    effective_from: `2026-0${number + 3}-01`,
    recorded_at: `2026-0${number + 3}-01T12:00:00Z`,
    note: `Tune ${number}`,
    created_by: 'owner-1',
    bands: [],
  })),
  races_by_version: {},
}

function call(args: object, authorization = 'Bearer t'): Request {
  return new Request('https://layline.example/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      authorization,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'boat_setup', arguments: args },
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
  boatSetup.mockResolvedValue(SETUP)
  rigTune.mockResolvedValue(RIG_TUNE)
})

afterEach(() => jest.restoreAllMocks())

describe('boat_setup', () => {
  it('is not answered, or even listed, to a caller with no Account', async () => {
    authenticate.mockResolvedValue(null)

    const response = await POST(call({}))

    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain('boat_setup')
    expect(boatSetup).not.toHaveBeenCalled()
  })

  it("answers with no arguments with the Boat Management list, read through the caller's client", async () => {
    const answer = await result({})

    expect(boatSetup).toHaveBeenCalledWith(CALLERS_CLIENT)
    expect(answer.isError).toBeFalsy()
    expect(answer.structuredContent).toEqual(
      (boatSetupOverview(SETUP) as { answer: object }).answer
    )
    expect(JSON.parse(answer.content[0].text)).toEqual(answer.structuredContent)
  })

  it("opens one artifact's Version by number through the caller's client", async () => {
    const answer = await result({ artifact: 'rig_tune', version: 1 })

    expect(rigTune).toHaveBeenCalledWith(CALLERS_CLIENT)
    expect(answer.structuredContent).toEqual(
      (rigTuneVersions(RIG_TUNE, 1) as { answer: object }).answer
    )
  })

  it.each([
    ['polar', readPolarVersions],
    ['crossover_chart', readCrossoverChartVersionsWithCharts],
    ['instrument_calibration', readInstrumentCalibration],
  ] as const)("reads the %s through the caller's client", async (artifact, reader) => {
    await result({ artifact })

    expect(reader).toHaveBeenCalledWith(CALLERS_CLIENT)
  })

  it('refuses an unknown artifact, naming the four there are', async () => {
    const answer = await result({ artifact: 'mainsail' })

    expect(answer.isError).toBe(true)
    expect(answer.content[0].text).toMatch(/polar.*crossover_chart.*rig_tune.*instrument_calibration/)
  })

  it('refuses an unknown Version, naming the ones there are', async () => {
    const answer = await result({ artifact: 'rig_tune', version: 5 })

    expect(answer.isError).toBe(true)
    expect(answer.content[0].text).toMatch(/no Version 5.*2, 1/)
  })

  it('refuses a Version with no artifact to find it in', async () => {
    const answer = await result({ version: 1 })

    expect(answer.isError).toBe(true)
    expect(answer.content[0].text).toMatch(/polar.*crossover_chart.*rig_tune.*instrument_calibration/)
    expect(boatSetup).not.toHaveBeenCalled()
  })

  it('answers a failed read with an error, never a partial Boat Setup', async () => {
    rigTune.mockResolvedValue(null)

    const answer = await result({ artifact: 'rig_tune' })

    expect(answer.isError).toBe(true)
    expect(answer.structuredContent).toBeUndefined()
    expect(answer.content[0].text).toMatch(/could not be read/)
  })
})
