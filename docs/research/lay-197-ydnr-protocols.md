# LAY-197 — How the YDNR speaks: protocols, ports, concurrent clients, public sample logs

**Question (LAY-197, map LAY-196):** what does the boat's Yacht Devices NMEA Router serve to a Wi-Fi
client, and what can a phone recorder rely on — protocols, ports, whether raw NMEA 2000 is complete,
timestamps, concurrent clients alongside qtVlm, internal logging, and public raw logs to use as
fixtures until the spring capture.

**Researched:** 2026-11-09. No access to the boat (hauled), so nothing here is verified against this
boat's router or its configuration.

**Markers:** `[STATED]` means a primary source says it, and the source is cited. `[INFERRED]` is my
reasoning from stated facts, with the reasoning given. `[UNKNOWN]` means unresolved, with what the
spring capture or the owner has to check.

## Sources

| Short name | Source |
|---|---|
| **YDNR manual** | *User Manual, NMEA 2000 Wi-Fi Router YDNR-02N, firmware 1.71*, doc YDNR02-003, 8 March 2024. <https://www.yachtd.com/downloads/ydnr02.pdf>. Page numbers are the printed ones. |
| **YDNR page** | Product page, <https://www.yachtd.com/products/wifi_router.html> (fetched 2026-11-09) |
| **YDNR firmware** | `PUPDATE.zip` from <https://www.yachtd.com/downloads/>; `readme.txt` says "Firmware version: 1.77, Release date: February 4, 2026" |
| **YDWG manual** | *User Manual, NMEA 2000 Wi-Fi Gateway YDWG-02 (also covers YDWG-02R, YDWG-02N), firmware 1.71*, <https://www.yachtd.com/downloads/ydwg02.pdf> |
| **canboat** | <https://github.com/canboat/canboat>, `samples/` at commit `27f3fef69bcb27d730435bb7d15e4a5fafb248cc`. Apache-2.0 per `LICENSE` |
| **canboatjs** | <https://github.com/canboat/canboatjs>, `lib/stringMsg.ts`, `lib/fromPgn.ts`, `lib/ydgw02.ts`, README. Apache-2.0 |
| **signalk-server** | <https://github.com/SignalK/signalk-server>, `packages/streams/src/simple.ts`, `src/interfaces/n2k-discovery.ts`, `samples/`. Apache-2.0 |

The firmware is at 1.77 and the manual describes 1.71. I found no published changelog for
1.72–1.77, so any behaviour below could have changed in those six releases `[UNKNOWN]`.

---

## Answer in brief

1. **Model.** Yacht Devices sells one product called the NMEA Router, the **YDNR-02**. The manual's
   cover gives the variant as **YDNR-02N** (NMEA 2000 Micro Male connector) `[STATED]`. The router's
   factory Wi-Fi SSID is "YDNR" `[STATED]`, which explains why the owner calls it that.
   The **YDWR-02**, a separate product, is an *NMEA 0183* Wi-Fi Router with no NMEA 2000 port.
   The owner should confirm the label on the boat says YDNR-02 (see §1).
2. **Three data servers.** Each one is set to TCP, UDP or both, on a configurable port, and to one
   data protocol: **NMEA 0183** or **RAW** (NMEA 2000 CAN frames as text). Server #3 can also run
   **Debug** or **Memory**. Factory settings: only Server #1 is on, as **TCP 1456, NMEA 0183**
   `[STATED]`.
3. **RAW is per CAN frame and unfiltered by default.** RAW carries "any NMEA 2000 messages
   (including proprietary messages)" `[STATED, YDWG manual p.5]`. Every filter list ships empty and
   BLACK, so everything passes `[STATED]`. Fast-packet PGNs arrive as their separate CAN frames, so
   the receiver reassembles them. *Routing* still decides which ports feed each server.
4. **The timestamp is the router's, `hh:mm:ss.ddd`, with no date.** It is "UTC time if the Device has
   received the time from the NMEA 2000 network, otherwise … the time from Device start" `[STATED]`.
   The receiver has to add the date and its own clock.
5. **Concurrency.** The limits are 3 TCP connections per server (9 in total), unlimited UDP
   listeners, and **at most 3 Wi-Fi stations in Access Point mode** `[STATED]`. qtVlm plus the phone
   fit. A third crew phone uses the last Wi-Fi slot.
6. **Internal logging is a track log, not a frame log.** It records points every 15 s to 1 h
   (factory: 5 min, "Basic" set), holds up to 12,000 points, and exports GPX/CSV/XML `[STATED]`.
   It is a coarse second source, never a frame archive.
7. **Fixtures.** canboat has real YD RAW captures (`merrimac-ydwg-2020.raw`, a sailboat on a B&G
   bus, 914 frames, with a decoded twin), small YD RAW samples and simulator runs. canboat and
   Signal K also have long real-boat logs in canboat's PLAIN/FAST CSV format. All are Apache-2.0
   (§7).

---

## 1. Which model, and what differs

- `[STATED, YDNR page]` "NMEA 2000 Wi-Fi Router YDNR-02". It has an NMEA 2000 port (Micro Male), two
  NMEA 0183 TX/RX ports (300–115200 bps, RS-232 or RS-422), one SeaTalk (1) port, "three TCP/UDP
  data servers (NMEA 0183 or NMEA 2000 data)", a web server, and an internal track log. Price
  $349. "an adaptor cable is required for connection to Raymarine SeaTalk NG or Simrad SimNet".
- `[STATED, YDNR manual cover]` The model is "YDNR-02N". `[STATED, YDWG manual p.7]` For Yacht
  Devices, "Models containing R in the suffix … are compatible with Raymarine SeaTalk NG. Models
  containing N … are equipped with NMEA 2000 Micro Male connectors."
  `[INFERRED]` The current YDNR purchase page offers only the Micro Male version. So "-02N" and
  "-02R" differ only in the connector, not in protocol behaviour.
- `[STATED, YD purchase catalogue]` Related products in the same line: **YDWG-02** NMEA 2000 Wi-Fi
  *Gateway* (N2K only, no 0183/SeaTalk ports, same three servers and RAW protocol). **YDWR-02** NMEA
  0183 Wi-Fi Router. **YDWN-02** NMEA 0183 Wi-Fi Gateway. YDEN Ethernet gateway.
  `[INFERRED]` Only the YDNR-02 and YDWG-02 (and YDEN) can serve RAW NMEA 2000. A YDWR-02 would
  give NMEA 0183 only, and decision 8 ("store every frame") would mean something different. One
  look at the label settles it.
- `[STATED, YDNR manual p.12]` The factory Access Point is SSID "YDNR", password "12345678", at
  192.168.4.1, web login admin/admin.

## 2. Server protocols, transports, ports

`[STATED, YDNR manual pp.4, 21–23]`

- "The Router's data servers support TCP and UDP network protocols (both can be enabled at the same
  time) as well as NMEA 0183 and NMEA 2000 (RAW) data protocols."
- "On the «NMEA Server» page … you can set up to three server ports". Each is enabled separately
  with its own port number and protocol (Figure 7).
- Each server can be "bi-direction, read-only (Transmit Only) or write-only (Receive Only)". The
  manual recommends read-only "to prevent network flooding from incorrectly configured applications".
- "Server #3 also supports the «Debug» and «Memory» data protocols." Debug is TCP and readable in a
  browser, e.g. `http://192.168.4.1:1458` (p.35). It mirrors traffic routed to and from Server #3
  for diagnosis. Memory exports the internal track log (p.47).
- **Factory settings:** "Router has the 1st server enabled and pre-configured to use TCP port 1456
  and the NMEA 0183 data protocol." The manual's examples use 1458 for Server #3 (pp.35, 47).
  `[INFERRED]` 1457 is the conventional Server #2 port. The manual never states it, and the
  canboatjs README's `nc ydgw-ip 1475` example is not a Yacht Devices default.
- "Server #2 … outgoing connection" (p.23). Server #2 can *dial out* by TCP or UDP to a fixed IP.
  The router then connects to the client instead of the client to the router. It takes over
  Server #2.
- **NMEA 0183 output** is converted from N2K and SeaTalk, following Appendix C (Table 3). Proprietary
  wrappers appear only for some PGNs: "DIN and PGN are wrap NMEA 2000 messages according SeaSmart
  (v1.6.0) and MiniPlex (v2.0)" (p.56, Note 6, against engine, transmission, fluid-level and battery
  PGNs). Optional `$STALK` sentences carry raw SeaTalk datagrams (p.40). `[STATED, YDWG manual p.4]`
  The YDWG-02 lets applications use `$PCDIN`/`$MXPGN` to *send* raw N2K. `[INFERRED]` The 0183
  stream is a lossy translation, not the bus. **RAW is the only server output that keeps the
  frames.**
- `[STATED, p.21]` "UDP protocol may work 5-6 times faster than TCP". "the second TCP connection
  doubles the network traffic and CPU load". The manual recommends UDP. **Actisense, iKonvert or
  Signal K output: not offered by the router** (only NMEA 0183, RAW, Debug, Memory, and the
  web-socket Web Gauges) `[STATED by omission from the protocol list]`.

### The RAW line format (Appendix E, p.63)

```
hh:mm:ss.ddd D msgid b0 b1 b2 b3 b4 b5 b6 b7<CR><LF>
17:33:21.107 R 19F51323 01 2F 30 70 00 2F 30 70
17:33:21.108 R 19F51323 02 00
```

- `D` is "R" (from NMEA 2000 to application) or "T" (from application to NMEA 2000). `msgid` is
  the 29-bit CAN identifier in hex (priority, PGN, source address and, for PDU1, destination).
  The line has 1–8 data bytes in hex. `[STATED]`
- The application sends the same format without time and direction. If the frame was "accepted,
  filtered and sent to NMEA 2000, it is sent back to the application with «T» direction" `[STATED,
  p.64]`.
- `[STATED, canboatjs stringMsg.ts]` canboatjs's `parseYDRAW` splits on spaces into
  `time, direction, canId, data…`, rejects more than 8 data bytes, and keeps `time` as given.
  (Its README calls this a "raw binary format". It is plain ASCII, as the manual and the parser
  both show.)
- `[STATED, signalk-server simple.ts]` Signal K connects with the provider types `ydwg02-canboatjs`
  (TCP) and `ydwg02-udp-canboatjs` (UDP). `[STATED, n2k-discovery.ts]` Signal K's comment says UDP is
  "receive-only in practice". `[STATED, canboatjs ydgw02.ts]` canboatjs measured that a YDWG-02
  *receiving* fast-packet frames as one UDP datagram per frame lost "about every other frame", so it
  sends a message as a single datagram. That concerns writing *to* the gateway. A read-only recorder
  doesn't care.

## 3. Is RAW every PGN on the bus?

- `[STATED, YDWG manual p.5]` RAW "allows transferring of any NMEA 2000 messages (including
  proprietary messages) to an application". The YDNR manual says it is the same protocol, also
  supported by the YDNU-02 "and other products" (p.21).
- `[STATED, YDNR manual pp.27–28]` Each server has its own NMEA 2000 filter lists for Receive and
  Transmit. "In the factory settings, all filter lists are empty and are of BLACK type, so all
  messages are passed through the filters." Filters match a CAN id plus mask or a bare PGN.
- `[STATED, p.26]` "The NMEA 2000 port and each server configured for RAW protocol has its own
  instance of the data converter". Data arriving on the NMEA 0183 or SeaTalk ports reaches a RAW
  server **as converted N2K PGNs, only if routing from that port to that server is enabled**. The
  manual's example: with routing from the 0183 wind sensor but not from N2K, "you will have only
  apparent wind data on the RAW data server".
- `[STATED, p.56, Note 3]` "Device with factory settings perform conversion from true to apparent
  wind and vice versa." `[INFERRED]` So some N2K wind frames on the RAW stream may be ones the
  **router itself computed** from 0183 or SeaTalk input, from the router's own source address.
  Whether they are depends on what is wired to the 0183/SeaTalk ports and on the routing grid,
  which the manual shows only as a picture (Figure 9, "Factory routing settings").
  **This matters for provenance:** "every frame the router sends" can include frames the router
  derived, and the router's source address in each frame is the only thing that tells them apart.
- `[INFERRED]` Fast-packet PGNs (e.g. 129029 GNSS, 129540 satellites, AIS) arrive as consecutive
  frames sharing a msgid and a sequence/frame-counter first byte. See the two `19F51323` lines
  above, and `1DEFFF00 A0…`/`A1…` in the manual's own example. Storing frame lines as received
  keeps this. Decoding needs reassembly, which canboatjs does.
- `[UNKNOWN]` Whether frames from the router itself — its address claim, 126996 product info, any
  PGNs it *transmits* onto N2K from 0183/SeaTalk — show on a RAW server as `R` lines. The spring
  capture answers this by looking for the router's own source address.
- `[UNKNOWN]` Whether a busy bus (AIS plus 10 Hz heading) saturates RAW over TCP on this CPU. The
  manual only warns that TCP costs 5–6× UDP.

## 4. Timestamps: router versus receiver

- `[STATED, p.63]` `hh:mm:ss.ddd` is the "time of message transmission or reception, ddd are
  milliseconds". "Timestamp is UTC time if the Device has received the time from the NMEA 2000
  network, otherwise it is the time from Device start."
- `[STATED by the format]` **There is no date, no time-zone marker, and no flag saying which clock is
  in use.**
- `[STATED, canboatjs fromPgn.ts ~l.933]` canboatjs keeps the router's clock string as `time` and
  stamps `timestamp` with `new Date()`, the receiver's clock, when the input has no ISO timestamp.
  `[STATED, canboat samples]` `merrimac-ydwg-2020.txt` (canboat's decode) shows ISO dates
  `2020-03-04T00:29:58.617` for lines the `.raw` gives as `00:29:58.617 R …`. So the date is
  supplied by canboat, not the router.
- `[INFERRED]` What follows for the recorder:
  - Store each line exactly as received **and** a receive timestamp from the phone. The router time
    is testimony from a clock with unknown provenance (UTC from the bus, or uptime), and the phone
    time is ours.
  - **UTC midnight falls mid-race in a Chicago summer.** 19:00 CDT is 00:00 UTC, so a weeknight
    race's router timestamps wrap from `23:59:59.999` to `00:00:00.000`. This is the boundary the
    merrimac sample happens to sit just after. Any date reconstruction has to handle the wrap.
  - Before a GNSS or chartplotter puts time on the bus (power-up), router times are uptime and will
    jump when UTC arrives. Ordering should use receive order or the phone clock, never router time
    alone.
  - TCP delivers in order. UDP may drop or reorder datagrams `[INFERRED: UDP semantics]`, so a UDP
    recorder should expect gaps.

## 5. Concurrent clients (qtVlm and the phone side by side)

`[STATED, YDNR manual pp.8, 12, 21]`

| Limit | Value |
|---|---|
| Wi-Fi stations in **Access Point mode** | **3 max**. "You can switch the Device to the Client mode to bypass this limitation." |
| TCP connections per server | 3 ("from three different applications on one device, or from three devices") |
| TCP connections total | 9 |
| UDP clients | "Unlimited". "any number of clients can listen to data broadcasted from a specified port" |

`[INFERRED]`

- A laptop (qtVlm) plus a phone is 2 of 3 AP slots, so it fits. A crew member's second phone takes
  the last slot, and a fourth device needs Client mode (the router joining a boat Wi-Fi network
  instead of hosting one).
- qtVlm and the phone can share a server or use separate servers. A clean arrangement is to leave
  Server #1 as qtVlm already uses it (likely TCP 1456 NMEA 0183, owner to confirm in qtVlm) and give
  the phone **Server #2 = RAW, Transmit Only**, either TCP or UDP. Adding a RAW server doesn't
  change Server #1's output, because filters and converter instances belong to each server. The
  phone must not take Server #3 if anyone relies on Debug/Memory.
- Read-only ("Transmit Only") protects the bus from the phone ever writing to it, consistent with a
  record-only app.
- UDP is broadcast, so the phone needs no slot and loads the CPU least, at the cost of possible loss
  (§4). On iOS, receiving broadcast UDP may need Apple's multicast-networking entitlement. That is
  outside this ticket's sources and belongs to the iOS socket ticket.

## 6. Does the router log internally?

`[STATED, YDNR manual pp.47–48, YDNR page]`

- "The Router automatically records your track with weather, depth and other data to the internal
  memory (up to 12000 points)."
- Interval 15 s – 1 h. **Factory: ON, 5-minute interval, "Basic" set**: "GPS position, date/time,
  GOG, SOG, AWA, AWS, TWA, TWS, TWD, heading, STW and depth." Other sets add data. Data sources
  default to "the NMEA 2000 network only". "Do not save points closer than 5 meters apart" can drop
  points. When memory is full, the oldest points are overwritten. A settings reset does not clear
  it, a hardware reset does.
- Download through Server #3 set to **Memory**, opened in a browser, export to GPX, CSV or XML.
  Optional upload to cloud.yachtd.com every 15 minutes in Wi-Fi Client mode with internet.
- **Debug** (Server #3) streams routed traffic to a browser, which can be saved by hand. The free
  **CAN Log Viewer** records NMEA 2000 to a file (pp.5, 35–36).
- `[INFERRED]` The track log is a low-rate, derived second source: values the router picked and
  sampled, at best 15 s. It suits a sanity check against a phone recording, not frame-level
  provenance. The full-bus logging product is the **YDVR-04 Voyage Recorder** (microSD, "will save
  all available NMEA 2000 network data", YD FAQ §E.1), which the boat doesn't have as far as we know.

## 7. Public sample logs usable as fixtures

Licence: canboat, canboatjs and signalk-server are Apache-2.0. `[INFERRED]` Sample files carry no
separate licence and fall under their repository's licence. Keep the NOTICE/attribution if they are
vendored. Pin URLs to the commit, for example
`https://raw.githubusercontent.com/canboat/canboat/27f3fef69bcb27d730435bb7d15e4a5fafb248cc/samples/<file>`.

### Exactly the YD RAW format (what the router will send)

| File | Size | What it is |
|---|---|---|
| `canboat/samples/merrimac-ydwg-2020.raw` | 44.6 kB, 914 frames, 2.5 s | Real capture from a YDWG-02 on the sailboat *Merrimac* (B&G/Simnet bus), 2020-03-04, starting `00:29:58.617`. 26 source addresses. 130306 wind ×56, 127250/127251 heading/ROT ×51, 129025/129026/129029 GNSS, 128259/128267/128275, 129540, 130840 Simnet, AIS-free. The best "real bus" fixture. |
| `canboat/samples/merrimac-ydwg-2020.txt` | 145 kB | canboat `analyzer`'s decode of the same capture (ISO timestamps, decoded fields, payloads), so it works as a golden expected-output file. |
| `canboat/samples/sample-YDWG02.txt` | 1.5 kB, 31 lines | YDWG-02 `R` frames (added 2018 with "analyzer: add support for Yacht Digital YDWG-02"). |
| `canboat/samples/sample-YDWG02-2.txt` | 3.6 kB, 77 lines | `T` frames (application → bus, incl. 59904 request and a 126996 fast-packet). Useful for proving the parser keeps direction. |
| `canboat/samples/simulator1.raw`, `simulator2.raw`, `simulator_wind_temp_env.raw` | 27 kB, 87 kB, 69 kB | YD RAW from a simulator (sources 0x16, 0x4B). Position, wind, environment. Provenance not documented beyond "Add untracked samples" (2025). Synthetic, so label it that way. |

### Real-boat logs in canboat PLAIN / FAST CSV (`ISO-time,prio,pgn,src,dst,len,bytes…`)

Not router-shaped, but long and from real racing or cruising boats. They can feed decode and
analysis tests directly, or be **re-encoded** to YD RAW lines with canboatjs `encodeYDRAW` /
`pgnToYdgwRawFormat`. A re-encoded file is a *synthetic* fixture and has to be labelled as one.

| File | Size | Notes |
|---|---|---|
| `canboat/samples/maneuvers.raw`, `maneuvers2.raw` | 8.9 MB, 9.5 MB | B&G bus, 2026-07-10, "B&G motion-rate maneuver captures" (#759). Tacks and gybes with 130306 wind, 127250 heading, 130824. |
| `canboat/samples/merrimac-2022.raw` | 7.5 MB | *Merrimac* again, 2022-09-10. |
| `canboat/samples/ws320.raw`, `bandg_tritonedge.raw` | 3.5 kB, 7.6 kB | Wind-sensor and B&G Triton display slices. |
| `signalk-server/samples/aava-n2k.data` | 2.1 MB | Real N2K, 2014-08-15, used by Signal K's own tests. |
| `signalk-server/samples/plaka.log`, `n2kd-183-merrimac.log` | 3.1 MB, 13 kB | **NMEA 0183** (`$IIMWV`, `$IIVHW`, …), i.e. what the router's NMEA 0183 server (qtVlm's feed) looks like. |

`[INFERRED]` None of these is from a YDNR-02 or from this boat. They exercise the line format,
fast-packet reassembly and decoding, but not this boat's instrument set, source addresses, routing
or converter-generated frames. The spring capture has to be the fixture for those.

## What the spring capture must verify

1. The router label (YDNR-02 versus YDWR-02 or YDWG-02) and its firmware version (web UI home page).
2. qtVlm's connection: which server, port, TCP or UDP, protocol.
3. The NMEA Servers page and the routing grid (Figure 9 is a picture). Which ports feed which
   server, and whether 0183/SeaTalk instruments exist and are routed to the RAW server.
4. Whether RAW `R` lines include the router's own address-claim/126996 frames and any wind it
   converted or computed (Note 3).
5. Which clock the RAW timestamps carry (bus UTC or uptime) at power-up and after GNSS fix. Check
   the wrap at 00:00 UTC.
6. Whether RAW over TCP keeps up with the full bus alongside qtVlm's TCP 0183 session. Compare frame
   counts against UDP on the same server.
7. Whether internal logging is on, and its interval and data set.
