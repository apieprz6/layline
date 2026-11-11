# ADR 0044: A Phone Recording Stores the Streams It Received, and Everything Else Is Rebuilt from Them

## Status

Accepted. Resolves LAY-201, on the map *iOS companion app* (LAY-196). **Amends ADR 0008** for a
second **Recording Format**; every ruling of 0008 stands for the qtVlm VDR export.

Decided without a capture of this boat's bus: the boat was hauled and unpowered when this was
written (2026-11). The assumptions that rest on published manuals and public sample logs rather than
on this boat are listed at the end, and the spring capture checks them.

Rests on four research notes, each on a throwaway branch that is never merged:
`docs/research/lay-197-ydnr-protocols.md` (`research/lay-197-ydnr-protocols`),
`docs/research/lay-198-nke-bus-contents.md` (`research/lay-198-nke-bus-contents`),
`docs/research/lay-199-canboatjs-and-sockets-in-expo.md` (`research/lay-199-canboatjs-expo`) and
`docs/research/lay-200-ios-background-recording.md` (`research/lay-200-ios-background-recording`).

## Context

ADR 0008 was written for one kind of **Recording**: a qtVlm VDR export, a table of rows the
navigation software computed and wrote at its own cadence. Its premise was that "the masthead
reading never reaches us" — the export keeps neither apparent wind nor heading, and everything in it
had passed through settings that are not recorded.

A phone on the boat's YDNR-02 router changes what reaches us. On this boat:

- The NKE instruments (Aluwind HR, paddlewheel, fluxgate, TL25) sit on NKE's Topline bus. An NKE box
  sends their channels as **NMEA 0183** sentences into the router, which **converts** them to NMEA
  2000 messages under its own source address. The TL25, as master display, computes true wind from
  calibrated apparent wind, STW and heading — water-referenced, never ground.
- A Garmin GPSMAP 943 is a native NMEA 2000 device and the source of position and AIS.
- The router serves NMEA 2000 as **RAW** — one text line per CAN frame, `hh:mm:ss.ddd R <id> <bytes>`,
  every message including proprietary ones — and can separately serve an 0183 port's sentences.

So the phone receives apparent wind and heading *as the instruments sent them*, and true wind as the
TL25 computed it rather than as qtVlm recomputed it. It still never receives the sensor's
uncorrected reading: every coefficient, offset, filter and deviation curve is applied inside the NKE
sensors and is never transmitted (ADR 0005's hand-kept record stays necessary). But it is one step
from the sensors, where the VDR export was three.

Three further facts shape the format:

- **Volume.** This bus is quiet — every NKE value arrives over a 4800-baud 0183 link — but a guessed
  50 frames a second is about 540,000 lines and 26 MB for a three-hour race. canboat's real B&G
  sample runs at 365 a second. Neither fits as database rows, for one boat on a free tier or for many
  boats on any tier: the cross-race screens load every row they read into a phone browser.
- **Clocks.** The router's timestamp has no date and is UTC only if something on the bus supplies the
  time, with nothing in the line saying which; it wraps at 00:00 UTC, which is 19:00 CDT, mid-race.
- **Identity.** An NMEA 2000 source address is negotiated at power-up and can change between days.
  A device announces its permanent identity at power-up or when asked, and a recorder that never
  transmits cannot ask.

## Decision

**A Layline phone recording stores the Streams it received, byte for byte, stamped with the phone's
receive time. That is its Transcription. Everything readable — decoded values, events, summaries —
is a product rebuilt from the Streams, and is never the record.**

### 1. A phone recording is a set of Streams, named by protocol

A **Stream** is one source's output in arrival order. A **Frame Stream** is NMEA 2000 frames from a
gateway; a **Sentence Stream** is NMEA 0183 sentences from a gateway; a **Fix Stream** is the phone's
own GPS. A Recording holds any number of each and is *incomplete*, not broken, when one is missing.

Streams are named by protocol and never by instrument maker, so another boat's equipment fits
without a format change. On this boat the phone takes two gateway Streams: RAW from one router
server, and the NKE port's 0183 sentences from a second, transmit-only server with no routing from
the NMEA 2000 side, so nothing the router converts is mixed in. The second keeps what NKE actually
sent; the first is the router's translation of it plus everything native to NMEA 2000.

Each gateway Stream records its **wire format** (YD RAW and NMEA 0183 are built; Actisense ASCII,
SeaSmart `$PCDIN` and others are added later, at decode time) and its connection (host, port, TCP).
**The recorder never translates between formats.** Supporting a new gateway changes the decoder,
never what is stored.

The phone **never transmits** to the bus. It connects to transmit-only servers, records, and does
not even request device identities.

### 2. Each line is stored in an envelope, verbatim

A Stream is an append-only file written as data arrives, because iOS may end the process at any time
(LAY-200). Each line is a Layline envelope: the phone's receive time, a monotonic count since the
Recording began, then the received line exactly as it arrived, byte for byte, line ending included.
The phone frames on the line ending of the TCP byte stream; a fragment left by a dropped connection
is kept and flagged as partial, never discarded.

**Events are lines too.** Connect, disconnect, reconnect, location authorisation changing, the app
going to the background or being relaunched — each is an envelope line of Layline's own type in the
Stream it concerns. A gap in a phone recording is therefore something the recording *states*. The
VDR export's **Dropout**, where the timeline looked continuous while the feed was dead, cannot occur
silently.

**GPS fixes are stored exactly as iOS delivers them**: latitude, longitude, horizontal accuracy, MSL
and ellipsoidal altitude, vertical accuracy, speed and speed accuracy, course and course accuracy,
the fix timestamp, and the simulated/accessory flags. Apple's sentinels — `−1` for an invalid speed
or course — are stored as given and interpreted at read, never turned into null and never replaced by
a plausible number. This needs a thin Swift location module, because `expo-location` drops three of
these fields (LAY-200).

### 3. The phone's clock is the timeline

A phone recording's timeline is the phone's receive time, in wall-clock UTC, with the monotonic count
beside it so a clock adjustment cannot reorder lines. The router's own timestamp, inside each RAW
line, and each fix's own timestamp are kept as received and may be *compared* against the phone's
clock; neither is ever substituted for it. A **Race Window** over a phone recording is in phone
receive time.

### 4. The Streams are the Transcription, and they are not in the database

ADR 0008 ruling 1 made the Transcription database rows, because a VDR export is a table. A phone
recording's Transcription is its **Stream files in object storage**, compressed only losslessly.
Ruling 2's line — only a pure function of its own row may join a Transcription — would keep decoding
off it anyway: an NMEA 2000 fast-packet message spans several lines, so no decoded value is a
function of one line.

What is readable is built in tiers, each rebuilt from the one before and none authoritative:

| Tier | Holds | Lives in | Rebuilt when |
| -- | -- | -- | -- |
| **Streams** | The Transcription | Object storage, write once | Never |
| **Decoded Series** | Every quantity decoded at one-second resolution, one column per quantity *per source*, each cell the latest value at or before that second with its age; never interpolated, two sources never merged or averaged | Object storage, one file per Recording, built by a server job on upload | The decoder or the series derivation changes |
| **Facts** | Small, queryable results: a per-Recording summary, events, and per-Recording aggregates for the cross-race screens | Postgres | The Series, the derivations, or a Race's Testimony changes |

**No per-line or per-second rows ever go into Postgres.** Single-race screens read the Decoded
Series directly; cross-race screens and MCP read Facts. Full resolution — the live display, AIS, finer
maneuver analysis — reads the Streams. Each tier records the decoder and derivation versions that
built it, so a stale product is detectable and rebuilding is mechanical.

Facts are keyed to the **Recording**, never to the **Race**. A maneuver is a fact about what was
recorded; a Race is an editable window over a Recording (ADR 0010), and keying events to it would
mean rewriting them on every amendment. A Race reads its Recording's facts through its window.

This ADR fixes only the contract between the tiers. The shape of Facts — the events table, the
aggregate cells, how the six-dimension filter reads them — is analysis-side work and is left open.

### 5. Only what the boat sent is decoded; what Layline calculates is computed at read

The Decoded Series holds decoded values and nothing else. Where the boat sent no value for a
quantity — true wind on a bus that carries only apparent — Layline may calculate one, at read, and
labels it as Layline's, as ADR 0008 ruling 5 already requires for `AWA (calc)`. Layline never writes a
value it calculated where a reader could take it for the instrument's.

Where two sources report the same quantity — the Garmin's position and the phone's, or two true
winds — both are kept, and ADR 0008 ruling 5 applies per boat: the **Device Inventory** names one
authoritative, and the other is stored and available but not read by default.

### 6. Provenance is per source and quantity, held in a Device Inventory

ADR 0008 ruling 6 held Provenance once per column of the format. In a phone recording the same
message — wind, PGN 130306 — may be one instrument's computation re-encoded by the router, another's
measurement, or a chartplotter's own calculation, so a column cannot carry it.

The **Device Inventory** becomes a fifth **Boat Setup** artifact. Each Version maps a source — an
NMEA 2000 source address, an NMEA 0183 talker and port, or the phone's GPS — to a device, and for
each quantity that source sends gives its Provenance class (Measured, Computed or Position-Derived,
unchanged) and a **via** chain: the devices the value passed through, for example *computed by
TL25 → converted by YDNR-02*. The via chain is an attribute, not a fifth class. A phone Recording
points at the Device Inventory Version current when it was recorded, as a Race points at its Polar
and Crossover Chart Versions, so adding a box never changes what an old recording says it heard.

The Inventory is built from a setup screen that connects and **listens**: it lists every source it
hears with the messages it sends and a sample value, fills in any identity a device announces on its
own, and the owner names the rest. It never asks the bus. Identification is by lookup in the
Inventory alone; reading identities out of each Recording's own Streams is added only if the spring
capture shows this boat's source addresses actually changing between power-ups.

### 7. Non-destruction is a test

Three tests make this mechanical, as ADR 0008 ruling 1 did for the VDR export:

1. **Bytes.** Replaying a captured gateway stream through a fake socket that splits it at random
   points, then stripping the envelopes, gives back exactly the original bytes — including a partial
   line at a cut connection.
2. **Envelope.** Reading and rewriting a Stream file is the identity.
3. **Rebuild.** Rebuilding the Decoded Series from the Streams reproduces the stored Series exactly,
   for the decoder version it records.

Until a capture of this boat exists, tests 1 and 3 run in CI against public fixtures: canboat's real
YDWG-02 capture `samples/merrimac-ydwg-2020.raw` (a B&G sailboat, Apache-2.0) for a Frame Stream, and a
Signal K NMEA 0183 log for a Sentence Stream. Neither is from a YDNR-02 or this boat's instruments.

### Rejected alternatives

- **Record RAW only.** Simpler — one socket — but it keeps only the router's translation of every NKE
  value, when the sentences NKE actually sent are one router setting away.
- **One database row per received line.** The literal reading of ADR 0008 ruling 1. About 540,000
  rows a race on this quiet bus; it fills a free tier in a season and cannot scale past one boat.
- **One-second, then ten-second, rows in Postgres as the analysis view.** Ten-second rows are about
  20 MB a season for one boat and still about 1.4 million rows a week for a thousand recordings. The
  view's density was never the point; keeping the database to small facts is.
- **Let the UI decode the Streams on view.** Decoding half a million lines with a 320 KB library on a
  phone, on every page view, is the cost the Decoded Series pays once.
- **Maneuver timestamps in one column on the Race.** Not queryable across races, and keyed to the
  editable thing rather than the recorded one.
- **Timestamps in a separate index file beside a pure byte file.** Cleaner in principle, but two files
  that must stay aligned, where an envelope cannot drift from its line.
- **Identify sources from what devices announce in each Recording.** Correct on a busy, changing bus,
  but a device powered before the phone connected never announces, so the Inventory is needed anyway;
  the announcement-based layer is deferred until it is shown to be needed.
- **Ask the bus for identities (PGN 59904) during setup.** Fills in product names automatically, at
  the price of a router server that writes to the bus and an exception to "the phone never
  transmits".

## Consequences

- The thin Swift location module is a requirement, not an optimisation.
- The router needs a second server configured for the 0183 Stream, and the phone holds two TCP
  connections — within the router's three per server.
- A server job decodes each phone recording after upload; canboatjs runs there, and on the phone only
  for the live display.
- Single-race screens gain a second reading path — the Decoded Series file — beside the VDR rows they
  read today. Folding the qtVlm recordings into the same tiers is left open, as is the shape of Facts.
- The **Maneuver Window** is counted in rows (one before a flip, three after), which is about two
  minutes at qtVlm's cadence and means something else at any other. It must be restated in seconds
  before maneuvers are detected on a phone recording.
- A gap in a phone recording is an event in its Stream. **Dropout** detection by repeated position is a
  VDR-export concern and does not apply.
- **Row Quality**, **Water-Referenced** and **Gap Seconds** are defined over VDR rows; their phone
  counterparts are Facts and are not specified here.

## Assumptions the spring capture must check

1. The router's 0183 server passes the NKE port's sentences through unchanged.
2. The router does not recompute the true wind that reaches the RAW Stream (the YDNR manual's §XII.2
   says it computes only on NMEA 2000 → 0183 conversion; a passage on p.26 seems to say otherwise).
3. Source addresses stay the same across power-ups on this bus.
4. RAW timestamps are UTC once the Garmin is on, and wrap at 00:00 UTC.
5. One TCP RAW connection keeps up with the bus alongside qtVlm's session.
6. The actual frame rate, which tests the volume figures above.
7. Which messages the Garmin sends, and whether AIS reaches the bus.
8. The TCP connection survives a multi-hour session with the phone in the background.
