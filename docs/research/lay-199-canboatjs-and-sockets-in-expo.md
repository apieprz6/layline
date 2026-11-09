# LAY-199: Can canboatjs and TCP/UDP sockets run inside an Expo dev build?

Research for LAY-199, a child of the LAY-196 map (companion iOS app). It bears on Notes decisions
3 (Expo, locked; N2K decoding exists in JS), 5 (`apps/mobile`, Android kept cheap) and 8 (store
every frame as received). This is research only. Nothing was added to the repo's dependencies. All
probing happened in scratch directories under `/tmp`.

Each claim is tagged with where it comes from. **[source]** means a primary source says so: package
source, `package.json`, an upstream doc or an issue tracker. **[measured]** means I ran it here.
**[inferred]** means it is my reading of the sources, not something they state.

Versions inspected (2026-11-09): `@canboat/canboatjs` 3.20.0, `@canboat/ts-pgns` 1.11.18,
`react-native-tcp-socket` 6.4.3, `react-native-udp` 4.1.7, Expo SDK 58 (`expo` 58.0.23, which bundles
`react-native` 0.88.1).

## Answer in brief

- **canboatjs runs under Hermes.** Its `browser` entry has no Node built-ins beyond `events` and a
  global `Buffer`, and Expo's Metro config picks that entry for iOS and Android. It decoded canboat's
  real YDWG-02 RAW sample (`samples/merrimac-ydwg-2020.raw`) under the Hermes VM. The output matched
  Node's exactly, except for canboatjs's own wall-clock `timestamp`. Before importing it, the app must
  add `buffer` and `events` as direct dependencies and set `global.Buffer`.
- **Formats.** It parses **YD RAW** (both the timestamped `R`/`T` form the router emits and the bare
  outgoing form) and reassembles fast-packet PGNs. It does **not** parse plain NMEA 0183 sentences
  (`$IIMWV…`). It only parses N2K that has been wrapped in 0183 (`$PCDIN`, `$MXPGN`). Live 0183 would
  need a second parser such as `nmea-simple` (MIT, no dependencies).
- **Cost.** Licence is Apache-2.0, and every dependency in the bundle is MIT or ISC. The bundle is
  large but not a blocker: about 1.8 MB minified, about 320 KB gzipped, about 1.7 MB Hermes bytecode.
  About 80% of that is the PGN database in `@canboat/ts-pgns`.
- **Sockets.** **`react-native-tcp-socket`** is the TCP client to use. It is maintained (releases
  through 2026-09), covers iOS and Android, and needs no config plugin. It is a legacy-bridge module
  that runs on the New Architecture through React Native's interop layer. **`react-native-udp`** works
  the same way technically, but it is unmaintained: last release 2023-01, React Native Directory flags
  it, and its New Architecture issue has no answer. Neither library ships a TurboModule.
- **TCP also avoids an Apple entitlement.** Per Apple TN3179, an outgoing TCP connection to the router
  needs only the Local Network permission (`NSLocalNetworkUsageDescription`). **Receiving UDP
  broadcast or multicast needs the managed `com.apple.developer.networking.multicast` entitlement**,
  which Apple has to grant. A UDP unicast aimed at the phone needs neither, but the phone gets its IP
  address from DHCP. So: a dedicated YDNR TCP server in RAW mode, with UDP left out of the first build.
- **Decoding is not needed for recording.** Notes decision 8 stores frames as received, so the
  recorder needs only line framing. Minimal status ("gateway connected") needs at most a frame count,
  or a CAN-ID parse for "frames are arriving". canboatjs matters only for the future live instrument
  display, and can be loaded lazily then.

## 1. canboatjs under Hermes

### What it depends on

- **[source]** `@canboat/canboatjs/package.json` declares `"main": "dist/index.js"` and
  `"browser": "dist/browser.js"`. It has no `exports` and no `react-native` field.
- **[source]** `dist/browser.js` opens with `// Browser-safe exports only - no Node.js dependencies`.
  It re-exports `FromPgn` (the decoder), `parseN2kString`, `toPgn` and format encoders, filters, and
  enumeration lookups.
- **[source]** Expo's Metro config (`@expo/metro-config`, `build/ExpoMetroConfig.js`) sets
  `resolverMainFields: ['react-native', 'browser', 'main']`. A native Expo build therefore resolves
  `@canboat/canboatjs` to `dist/browser.js`.
- **[source]** These are all the `require`s reachable from `browser.js` (from grepping `dist/`):
  - `fromPgn.js`: `events`, `bit-buffer`, `int64-buffer`, `lodash`, `@canboat/ts-pgns`, and
    `../package.json`.
  - `stringMsg.js`: `lodash/fp`, `moment`.
  - `utilities.js`: `debug`.
  - `toPgn.js`: `n2k-actisense.js`, which pulls in only `bit-buffer`.
  - `@canboat/ts-pgns`: `canboat.json`, `canboat-lookups.json`, `camelcase`, `semver`, `minimist`.
- **[source]** No `stream`, `fs`, `net`, `dgram`, `util` or `node:events` appears on that path. Those
  live only in the Node-side modules: `ydgw02.js` (YDGW02 stream: `stream`, `util`), `n2kDevice.js`
  (`node:events`), `canbus.js`, `actisense-serial.js` and the like. Those modules are what
  `dist/index.js` exports, and the app would not import them.
- **[source]** `fromPgn.js` uses `Buffer.alloc` / `Buffer.from` 19 times, as a global (not imported).
  `FromPgn` extends `EventEmitter` from `events`.
- **[source]** Neither `buffer` nor `events` is in canboatjs's dependency tree. `npm ls` in a clean
  install shows neither. **[inferred]** React Native provides neither a `Buffer` global nor an
  `events` module. This is widely known but was not checked against React Native source here.
  `react-native-udp` and `react-native-tcp-socket` each depend on `buffer` for the same reason.

The app therefore needs:

1. `buffer` and `events` as direct dependencies of `apps/mobile`.
2. `global.Buffer = require('buffer').Buffer` in an entry module that runs before canboatjs is first
   imported.

canboatjs's own webpack build for iOS does the same thing. **[source]** `webpack.config.js` uses
`ProvidePlugin({ Buffer: ['buffer', 'Buffer'] })` with fallbacks `buffer → buffer/` and
`node:events → events`. Its `ios.js` entry exposes `parseYDGW02`, `parseString`, `parsePCDIN` and so
on as globals, built by the `build_ios` script. **[inferred]** That points to an existing iOS consumer
on a non-Node JS engine. The likely candidate is the author's WilhelmSK app on JavaScriptCore, but
nothing in the repo names it.

### Hermes probe [measured]

The goal was to check whether canboatjs's runtime behaviour, not just its syntax, works on Hermes. There
were three steps.

1. **Bundle.** esbuild bundled a probe script against canboatjs's `browser` entry (`--platform=browser`,
   `node:events → events`, `Buffer` from the `buffer` package). The probe source is in the Appendix.
2. **Compile.** The **current** `hermesc` compiled the untranspiled ES2020 bundle to bytecode with no
   errors. That compiler comes from the `hermes-compiler` 250829098.0.19 package, the one React
   Native 0.8x builds with.
3. **Run.** The only runnable Hermes VM published for Linux is the v0.13.0 CLI (2024-08). It does not
   parse untranspiled ES6 classes. The bundle was therefore lowered with `@babel/preset-env`, standing
   in for Metro's Babel transform, and run with a two-line prelude that supplies the `console` and
   `process.env` React Native provides.

Results under Hermes:

- **Single-frame PGN 129025 (Position, Rapid Update)**, from canboatjs's `test/ydgw02.js`: decoded to
  lat 33.0875728, lon -97.0205113. This matches the test's expected values.
- **Seven-frame fast-packet PGN 129029 (GNSS Position Data)**, from the same test: reassembled and
  decoded with every field as the test expects.
- **Synthetic PGN 130306 (Wind Data)**: `windSpeed 5`, `windAngle 1.5708`, `reference "Apparent"`.
- **NMEA 0183 `$IIMWV,…`**: refused, as `format: "MISSING_PARSER"`.
- **canboat's `samples/merrimac-ydwg-2020.raw`**, a real YDWG-02 RAW capture: 914 frames in, 589
  decoded messages out, 0 errors, 46 distinct PGNs. It includes 56 × 130306 Wind Data, 51 × 127250
  Vessel Heading, 38 × 129026 COG & SOG, 3 × 128259 Speed, 10 × 128267 Water Depth, 91 × 129025 and
  9 × 129029, AIS 129038/129039, and the B&G/Navico/Simnet proprietary PGNs.
- **The same bundle under Node 20**: output was **byte-identical** to the Hermes run except for one
  field, the `timestamp` canboatjs adds.

That one difference matters for provenance:

- **[source]** A YD RAW line carries only `hh:mm:ss.ddd` with no date. canboatjs sets `timestamp` to
  the wall-clock time at decode (PR #435, "fall back to current time for non-ISO timestamps"). The
  router's own time is kept separately in the `time` field (`test/ydgw02.js` expects `time:
  '16:29:27.990'`).
- **[inferred]** So canboatjs's `timestamp` is the decoder's clock, not the bus's. Under ADR 0008 and
  Notes decision 8, the stored record should be the line as received, plus the phone's receive time
  as separate provenance. It should never be canboatjs's `timestamp`.

Caveat: the runtime was Hermes 0.13. The Hermes that ships with React Native 0.88 is newer. The modern
compiler accepting the bundle untranspiled, plus 0.13 running it, is strong evidence. It is not a run
on a device. Spring's first dev build should repeat the sample decode on the phone.

### Bundle impact [measured]

| Measure | Size |
|---|---|
| esbuild bundle, minified | 1.86 MB |
| esbuild bundle, gzipped | 327 KB |
| Hermes bytecode | 1.7 MB |

By package, in minified output:

| Package | Size |
|---|---|
| `@canboat/ts-pgns` (the PGN database) | 1,472 KB |
| `lodash` | 154 KB |
| `moment` | 62 KB |
| `canboatjs` itself | 44 KB |
| `semver` | 28 KB |
| `buffer` | 25 KB |
| everything else | under 10 KB each |

**[inferred]**

- Next to a React Native app binary of tens of MB, this is acceptable.
- It matters more for over-the-air JS updates (EAS Update), because it adds about 0.3 MB gzipped to
  each update.
- Hermes bytecode is memory-mapped, so start-up cost stays low. Even so, a lazy `require` inside the
  live-display screen keeps it off the recorder's start-up path.

### Licence [source]

| Package | Licence |
|---|---|
| canboatjs | Apache-2.0 |
| `@canboat/ts-pgns` | Apache-2.0 |
| canboat (C project and its `docs/canboat.json`) | Apache-2.0 (`LICENSE`, "(C) 2009-2026, Kees Verruijt") |
| lodash, moment, debug, bit-buffer, int64-buffer, buffer, events | MIT |
| semver | ISC |

**[inferred]** None of these is copyleft. Apache-2.0 asks that the app keep the NOTICE/licence text,
for example on an acknowledgements screen.

### Install-time noise [source → inferred]

- **[source]** canboatjs has an `install` script: `node-gyp rebuild || echo 'Native CAN socket addon
  not available on this platform'`. It also depends on `node-addon-api`, and has `serialport` 11
  plus `@serialport/parser-readline` as optional dependencies. A clean install brings in 113 packages
  and 29 MB of `node_modules`.
- **[inferred]** The failure is swallowed (`|| echo`). Expo autolinking only links packages that ship
  a podspec, Gradle project or `expo-module.config.json`, so none of this reaches the app binary. It
  does slow installs and adds noise in EAS Build. `--omit=optional`, or an `overrides` entry, can trim
  `serialport`.

### Maintenance [source]

- The repo was last pushed 2026-11-08, and the latest publish was 2026-11-04.
- Recent merged PRs include #589, #536, #522 and #520, from Oct–Nov 2026.
- A search of the issue tracker for "react native" or "hermes" finds nothing. Nobody has reported
  trouble on React Native, and nobody has documented support for it either.

## 2. Formats

The router's formats come from LAY-197: YD RAW, one text line per CAN frame, or NMEA 0183, over TCP or
UDP.

| Input | canboatjs | Source |
|---|---|---|
| YD RAW from the router (`hh:mm:ss.ddd R 09F8017F 50 C3 …`) | parsed by `parseYDRAW`, fast packets reassembled in `FromPgn` | `dist/stringMsg.js` `isYDRAW`/`parseYDRAW`, measured above |
| YD RAW, outgoing form without timestamp (`19F51323 01 02`) | parsed (`parseYDRAWOut`) | `dist/stringMsg.js` |
| N2K wrapped in 0183 (`$PCDIN`, `$MXPGN`) | parsed | `dist/stringMsg.js` `isN2KOver0183` |
| Actisense, Actisense N2K ASCII, candump 1/2/3, `!PDGY` | parsed | `dist/stringMsg.js` `parseN2kString` |
| Plain NMEA 0183 (`$IIMWV`, `$GPRMC`, …) | **not parsed** (`MISSING_PARSER`) | measured |

For plain 0183 there are two options:

- **[source]** `nmea-simple` 3.3.0: MIT, no dependencies, last published 2023-01.
- **[source]** Signal K's `@signalk/nmea0183-signalk` 3.22.1: Apache-2.0, maintained. It maps to Signal K
  deltas and depends on `split`, `ggencoder` and the signalk schema.
- **[inferred]** A recorder in RAW mode never needs either. Decoding 0183 for a live display is small
  enough (MWV, VHW, HDG, RMC, DPT) to do with `nmea-simple` or by hand.

## 3. Alternatives, if canboatjs were ruled out

- **canboat's PGN JSON with a thin decoder.**
  - **[source]** `canboat/canboat` publishes `docs/canboat.json` (Apache-2.0, release v9.2.0 on
    2026-11-04). `@canboat/ts-pgns` packages it with TypeScript types.
  - **[inferred]** A decoder that reads bit fields for the dozen PGNs a live display needs would be a
    few hundred lines of TypeScript. It would also need fast-packet reassembly, which is about 40
    lines. It could leave out lodash and moment, and include only the PGN subset it uses.
  - **[inferred]** This is the fallback if bundle size ever matters. It costs a parser we would own,
    so it is not the first choice.
- **Native module.**
  - **[source]** canboat's C `analyzer` is Apache-2.0.
  - **[inferred]** Wrapping it needs a Swift/Kotlin or C++/JSI bridge. That runs against Notes
    decision 3 (Swift only where Apple requires it, and the agent cannot build Swift on Linux) and
    decision 5 (shared layers stay platform-neutral). It is not warranted, because canboatjs works.
- **Other JS N2K decoders.** None found with canboatjs's PGN coverage. canboatjs is what the Signal K
  ecosystem uses. The old unscoped `canboatjs` npm package (1.1.10, 2022) is a stale predecessor.
  Avoid it.

## 4. Does decoding have to happen on the device at all?

**[inferred]**, from Notes decisions 8 and 9:

- **Recording.** No decoding. Split the TCP stream on CRLF and store each line as received, with the
  phone's receive time. A YD RAW line is already a full record of one CAN frame: its CAN ID carries
  priority, PGN, source and destination.
- **Minimal status (recording / gateway connected / GPS fix).** "Gateway connected" is the socket
  state, plus lines arriving within the last N seconds. If the status should say "N2K frames arriving"
  rather than "bytes arriving", a regex on `^\d\d:\d\d:\d\d\.\d{3} [RT] [0-9A-F]{8}( [0-9A-F]{2}){1,8}$`
  is enough. "GPS fix" comes from the phone's own location API, not the bus.
- **Live instrument display (its own future ticket).** This needs real decoding, so use canboatjs,
  loaded lazily on that screen.
- **Server side.** The same canboatjs runs in Node on the server for post-hoc decoding of stored
  frames. Notes decision 3 already relies on that isomorphism.

## 5. Sockets in an Expo dev build

### `react-native-tcp-socket`: use this for the TCP client

- **[source]** Release and repo state:
  - 6.4.3, MIT, published 2026-09-10.
  - Releases on 2026-01-03, 01-15, 01-16, 07-26 and 09-10 fix iOS and Android bugs. One example is
    6.4.0, which added `connectTimeout`.
  - Not archived, 36 open issues.
  - React Native Directory lists it for iOS, Android, macOS and Fire OS, with `configPlugin: false`.
- **[source]** Native side:
  - iOS: `ios/TcpSockets.m` is a legacy-bridge module (`RCT_EXPORT_MODULE()`; `TcpSockets :
    RCTEventEmitter`) built on the `CocoaAsyncSocket` pod (`GCDAsyncSocket`).
  - Android: Java `TcpSocketModule`.
  - No `codegenConfig`, so it is **not** a TurboModule.
- **[source]** JS dependencies are `buffer` and `eventemitter3`. The API is Node `net`-style
  (`createConnection`, `'data'` events with Buffers).
- **[source]** New Architecture:
  - Issue #187, "Support React Native Architecture", opened 2024-04, is open with no maintainer reply.
  - React Native 0.82's release post says: "We will keep the interop layers in the codebase for the
    foreseeable future… 3P libraries that offer backward compatibility with both architectures will
    keep on working with 0.82 where New Architecture is the only architecture."
- **[inferred]** It runs on React Native 0.88 / Expo SDK 58 through the interop layer. That is the same
  path most legacy modules take today. The risk is a future React Native that drops the interop layer.
  Nobody has announced a date.
- **[source]** On Expo specifically, issue #182 ("Cannot read property 'connect' of null, js engine:
  hermes") ended with users finding it fails in **Expo Go** and works in a native build. That matches
  Notes decision 3's choice of dev builds.

### `react-native-udp`: works, but unmaintained

- **[source]** Release and repo state:
  - 4.1.7, MIT, last published 2023-01-26. The repo was last pushed 2023-03-05.
  - React Native Directory marks it `unmaintained: true`.
  - Issue #259, "New Architecture Support (TurboModules/Fabric)", opened 2026-01-16, has no reply.
- **[source]** Native side:
  - Same pattern as the TCP library: a legacy `RCT_EXPORT_MODULE()` on `GCDAsyncUdpSocket` from
    `CocoaAsyncSocket`.
  - Java on Android. It takes a `WifiManager.MulticastLock` only around `addMembership`, and declares
    `CHANGE_WIFI_MULTICAST_STATE` in its manifest.
  - iOS supports `setBroadcast` and `reusePort`.
- **[inferred]** It probably runs through the interop layer too, but nobody maintains it if React
  Native or iOS breaks it.
- **[inferred]** Its multicast lock covers multicast groups, not broadcast. Receiving broadcast UDP on
  Android with the screen off may still need the lock (Notes decision 5's "UDP needs a multicast
  lock"), which the app would have to take itself.
- **Other options.**
  - **[source]** `react-native-nitro-udp` 1.0.7 (MIT, 2025-09, 59 downloads) and
    `react-native-nitro-net` 0.6.2 (ISC, Rust core, Node-compatible `net`/`tls`, 2026-09, 280
    downloads) exist.
  - **[inferred]** Both are too new and thinly used to bet on.
  - **[inferred]** If UDP is ever required, the sturdier route is a small Expo Module: Swift
    `Network.framework` plus a Kotlin `DatagramSocket`. That is Swift the agent cannot build on Linux.

### Expo configuration

- **[inferred]** Neither library needs a config plugin. Autolinking picks up their podspec and Gradle
  project at `expo prebuild`. A dev build (`expo run:ios` or an EAS development build) is required;
  Expo Go cannot load them.
- **[source]** Apple TN3179's rules for local network privacy:
  - **Outgoing TCP connection to a local address** → needs Local Network access, so the app must
    provide `NSLocalNetworkUsageDescription`.
  - **Receiving an incoming UDP unicast** → needs nothing.
  - **Receiving incoming UDP multicast or broadcast** → needs Local Network access, and also
    *"To send or receive multicast or broadcast traffic, sign your app with the
    com.apple.developer.networking.multicast entitlement"*.
  - The multicast entitlement is provisioned as a **managed capability**, which Apple has to approve
    on request.
  - The checks are "deep in the networking stack… This includes … BSD Sockets", so
    `CocoaAsyncSocket` gets no exemption.
- **[inferred]** In Expo terms:
  - `NSLocalNetworkUsageDescription` goes in `app.json` → `ios.infoPlist`. Notes decision 6 already
    wants it written to App Review's standard.
  - The multicast entitlement, if it were ever needed, would go in `ios.entitlements`, and would wait
    on Apple's approval.
  - **A TCP client to the YDNR needs no entitlement**, which is one more reason to prefer TCP.
  - A UDP unicast aimed at the phone would also avoid the entitlement. But the router would have to be
    configured with the phone's DHCP-assigned IP address, which is fragile.
- **Not researched here:** keeping the socket alive while the app is backgrounded. It depends on the
  background-location mode keeping the process running, which belongs to another ticket.

## What the spring capture should verify

- canboatjs decodes the boat's own RAW frames on the phone, under the production Hermes. This means
  rerunning the Appendix probe in the first dev build.
- The YDNR TCP server holds one long-lived client connection for a multi-hour race without dropping
  it.
- The iOS Local Network prompt appears and is granted on first `connect()`, and a TCP connection
  works without the multicast entitlement.

## Appendix: probe sources

These were run from `/tmp/lay199`, outside the repo. The fixture was fetched to
`/tmp/lay199-samples/` from
`https://raw.githubusercontent.com/canboat/canboat/master/samples/merrimac-ydwg-2020.raw`.

```js
// sample-test.js: bundled with
//   esbuild sample-test.js --bundle --platform=browser --format=iife \
//     --alias:node:events=events --define:process.env.NODE_ENV='"production"' --loader:.raw=text
// then lowered with @babel/preset-env, prefixed with a console/process prelude, and run with
// hermes v0.13.0 (and, as a control, with node).
import { Buffer } from 'buffer'
import sample from '../lay199-samples/merrimac-ydwg-2020.raw'
globalThis.Buffer = Buffer
const { FromPgn } = require('@canboat/canboatjs')

const log = typeof print === 'function' ? print : console.log
const parser = new FromPgn({})
let errors = 0
parser.on('error', () => { errors++ })
parser.on('warning', () => {})

const lines = sample.split(/\r?\n/).filter((l) => l.length > 0)
const byPgn = {}
let decoded = 0
for (const line of lines) {
  const pgn = parser.parseString(line)
  if (!pgn) continue
  decoded++
  const key = pgn.pgn + ' ' + pgn.description
  byPgn[key] = (byPgn[key] || 0) + 1
}
log('lines ' + lines.length + ' decoded ' + decoded + ' errors ' + errors)
```

The prelude stands in for what React Native provides and the bare Hermes CLI does not:

```js
var console = { log: print, warn: print, error: print, info: print, debug: print }
var process = { env: { NODE_ENV: 'production' } }
```
