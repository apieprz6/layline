import { parseIISEAGrantXML, fetchIISEAGrantXML } from '../iiseagrant'

const VALID_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<message>
  <station>45198</station>
  <date>08/02/2026 21:40:00</date>
  <met>
    <vbat>14.15</vbat>
    <atmp1>20.9</atmp1>
    <rrh>85.4</rrh>
    <dewpt1>18.37</dewpt1>
    <baro1>1011.1</baro1>
    <wspd1>8.65</wspd1>
    <gust1>11.46</gust1>
    <wdir1>356.7</wdir1>
    <wtmp1>20.37</wtmp1>
    <wvhgt>1.111</wvhgt>
    <maxwvhgt>1.675</maxwvhgt>
    <h10wvhgt>1.413</h10wvhgt>
    <dompd>6.318</dompd>
    <maxpd>4.433</maxpd>
    <mwdir>13.84</mwdir>
    <fm64ii>820</fm64ii>
  </met>
</message>`

describe('parseIISEAGrantXML', () => {
  it('parses all sensor fields from valid XML', () => {
    const result = parseIISEAGrantXML(VALID_XML)

    expect(result.timestamp).toEqual(new Date('2026-08-02T21:40:00Z'))
    expect(result.wind_speed).toBe(8.65)
    expect(result.wind_direction).toBe(357)
    expect(result.wind_gust).toBe(11.46)
    expect(result.air_temp).toBe(20.9)
    expect(result.water_temp).toBe(20.37)
    expect(result.pressure).toBe(1011.1)
    expect(result.humidity).toBe(85.4)
    expect(result.wave_height).toBe(1.111)
    expect(result.wave_period).toBe(6.318)
    expect(result.wave_direction).toBe(14)
  })

  it('handles missing optional sensor values as null', () => {
    const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<message>
  <station>45198</station>
  <date>07/15/2026 12:00:00</date>
  <met>
    <wspd1>5.0</wspd1>
    <wdir1>180</wdir1>
  </met>
</message>`

    const result = parseIISEAGrantXML(xml)

    expect(result.timestamp).toEqual(new Date('2026-07-15T12:00:00Z'))
    expect(result.wind_speed).toBe(5.0)
    expect(result.wind_direction).toBe(180)
    expect(result.wind_gust).toBeNull()
    expect(result.air_temp).toBeNull()
    expect(result.water_temp).toBeNull()
    expect(result.pressure).toBeNull()
    expect(result.humidity).toBeNull()
    expect(result.wave_height).toBeNull()
    expect(result.wave_period).toBeNull()
    expect(result.wave_direction).toBeNull()
  })

  it('throws on missing <date> element', () => {
    const xml = `<?xml version="1.0"?>
<message>
  <station>45198</station>
  <met><wspd1>5.0</wspd1></met>
</message>`

    expect(() => parseIISEAGrantXML(xml)).toThrow('Missing <date> element')
  })

  it('throws on invalid date format', () => {
    const xml = `<?xml version="1.0"?>
<message>
  <station>45198</station>
  <date>not-a-date</date>
  <met><wspd1>5.0</wspd1></met>
</message>`

    expect(() => parseIISEAGrantXML(xml)).toThrow('Invalid date format')
  })

  it('throws on unexpected station', () => {
    const xml = `<?xml version="1.0"?>
<message>
  <station>99999</station>
  <date>08/02/2026 12:00:00</date>
  <met><wspd1>5.0</wspd1></met>
</message>`

    expect(() => parseIISEAGrantXML(xml)).toThrow('Unexpected station')
  })

  it('throws on completely empty XML', () => {
    expect(() => parseIISEAGrantXML('')).toThrow()
  })

  it('throws on malformed XML with no message structure', () => {
    const xml = `<?xml version="1.0"?><garbage>stuff</garbage>`

    expect(() => parseIISEAGrantXML(xml)).toThrow()
  })

  it('handles MM sentinel values as null', () => {
    const xml = `<?xml version="1.0"?>
<message>
  <station>45198</station>
  <date>08/02/2026 12:00:00</date>
  <met>
    <wspd1>MM</wspd1>
    <wdir1>999</wdir1>
    <gust1>MM</gust1>
  </met>
</message>`

    const result = parseIISEAGrantXML(xml)
    expect(result.wind_speed).toBeNull()
    expect(result.wind_direction).toBeNull()
    expect(result.wind_gust).toBeNull()
  })
})

describe('fetchIISEAGrantXML', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns XML text on successful fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => VALID_XML,
    } as Response)

    const result = await fetchIISEAGrantXML()
    expect(result).toBe(VALID_XML)
  })

  it('throws on non-OK HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response)

    await expect(fetchIISEAGrantXML()).rejects.toThrow(
      'IISEAGrant fetch failed: 503 Service Unavailable'
    )
  })

  it('throws on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout'))

    await expect(fetchIISEAGrantXML()).rejects.toThrow('Network timeout')
  })

  it('throws on empty response body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    } as Response)

    await expect(fetchIISEAGrantXML()).rejects.toThrow(
      'IISEAGrant returned empty response'
    )
  })
})
