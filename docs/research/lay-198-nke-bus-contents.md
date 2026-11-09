# LAY-198 — What the boat's instruments put on the bus, and whether the display sends true wind

**Question (LAY-198, map LAY-196):** for the boat's actual instruments (NKE Aluwind HR masthead unit,
NKE paddlewheel speedo, NKE fluxgate compass, NKE TL25 display, Yacht Devices YDNR-02 router, qtVlm on a
laptop, and a Garmin GPSMAP 943 chartplotter), what reaches the NMEA 2000 bus and the router's RAW
server, which device computed each value, and where each correction is applied. The provenance decision
(LAY-201) depends on this.

**Researched:** 2026-11-09. The boat is hauled and unpowered, so nothing here was observed on this boat.
The owner confirmed the wiring while this was being written: **the NKE system sends NMEA 0183 into the
YDNR-02, and the router converts it to NMEA 2000. The Garmin GPSMAP 943 is a separate NMEA 2000 device
and the source of GPS and AIS.** Everything below assumes that wiring.

**Markers** (same as LAY-197): `[STATED]` means a primary source says it, and the source is cited.
`[INFERRED]` is my reasoning from stated facts, with the reasoning given. `[UNKNOWN]` means unresolved,
with what has to be checked.

## Sources

The NKE, Yacht Devices and qtVlm manuals marked *private copy* sit in the owner's private repository.
They are cited by title, section and printed page, and quoted only briefly. Nothing from them and no
recording data is committed here.

| Short name | Source |
|---|---|
| **Aluwind** | NKE, *HR Masthead unit, ref. 90-60-560, User guide and installation guide* (doc 38_Aluwind_HR_um_UK_28). Private copy. |
| **Speedo** | NKE, *Speedometer log sensor, paddlewheel, ref. 90-60-457, User guide and installation guide* (Speedo_roue_a_aube_um_UK_17). Private copy. |
| **Fluxgate** | NKE, *Fluxgate compass, ref. 90-60-452, User guide and installation guide* (33-60-018-000). Private copy. |
| **TL25** | NKE, *Multifunction TL25 and its remote control, ref. 90-60-244/256, User guide and installation guide, Rev 1* (33-60-021-000). Private copy. |
| **Box WiFi** | NKE, *BOX Wifi, ref. 90-60-508-002, Notice utilisateur & fiche d'installation* (33-60-058-002, French). Public: <https://nke-marine-electronics.fr/wp-content/uploads/2016/12/33-60-058-002_UTI_FR_Box_WI-FI.pdf>, linked from the product page <https://nke-marine-electronics.fr/project/box-usb-datalog-wifi/>. |
| **NKE interfaces** | NKE's interface catalogue, <https://nke-marine-electronics.fr/instruments-nke/interfaces/>, and the Box N2K page <https://nke-marine-electronics.fr/project/box-n2k/> (fetched 2026-11-09). |
| **YDNR manual** | Yacht Devices, *User Manual, NMEA 2000 Wi-Fi Router YDNR-02N, firmware 1.71*, doc YDNR02-003, 8 March 2024 (private copy, identical to <https://www.yachtd.com/downloads/ydnr02.pdf> used by LAY-197). Printed page numbers. |
| **qtVlm manual** | Meltemus, *qtVlm documentation, 5.12.27*. Private copy. Printed page numbers. |
| **canboat** | <https://github.com/canboat/canboat>, `docs/canboat.json` at commit `27f3fef69bcb27d730435bb7d15e4a5fafb248cc` (Apache-2.0). PGN field and lookup definitions. |
| **LAY-197** | `docs/research/lay-197-ydnr-protocols.md` on branch `research/lay-197-ydnr-protocols` (`8e6397f`). |
| **HP repo** | The owner's private analysis repository (scripts, ADRs, calibration log). Consulted for wiring facts; it has none beyond what is noted in §6. |

**Not reached:** Garmin's own GPSMAP 943 installation instructions and owner's manual. Every guessed
`static.garmin.com` URL returned 404 and the search engines served captchas. All Garmin-specific claims
in §5 are therefore `[UNKNOWN]` or `[INFERRED]`, and §8 lists what to read off the plotter instead.

---

## Answer in brief

1. **Nothing NKE is on the NMEA 2000 bus natively.** Every NKE sensor talks only to the proprietary
   Topline bus `[STATED, Aluwind §1.1, Speedo §1.1, Fluxgate §1.1, TL25 §1.1]`. The NKE values reach
   NMEA 2000 only as **PGNs the YDNR-02 generates from NKE's NMEA 0183 sentences** (owner-confirmed
   wiring, YDNR manual Table 4). Every NKE value on the bus therefore carries the **router's** source
   address, not an NKE device's `[INFERRED]`.
2. **The TL25 cannot be the 0183 talker.** Its cable has an NMEA *input* pair and no output
   `[STATED, TL25 §3.7 wire table, §1.13]`. Some other NKE unit with an NMEA output must sit on the Topline
   bus: a Box WiFi or USB box, a Box N2K's serial port, another display, or an older output interface.
   **The owner has to find it and read its label** (§8). There must also be an NKE speed/depth interface
   box (90-60-450 or similar), because the paddlewheel plugs into one, not into the bus `[STATED, Speedo
   §1.1, §3.8]`.
3. **True wind is computed on the NKE side, by the TL25 as master display**, from the corrected AWA/AWS
   and the paddlewheel's STW. TWD needs the fluxgate's heading too `[STATED, TL25 §1.2, Aluwind §1.2]`.
   It is boat- or water-referenced, never ground-referenced, because Topline has no GPS input of its own.
   An NKE NMEA output sends it as `MWV` (reference T), `VWT` and `MWD` alongside apparent `MWV` (R) and
   `VWR` `[STATED, Box WiFi §3 table]`. Whether *this boat's* output box emits those sentences depends on
   the box model `[UNKNOWN]`.
4. **The router does not compute true wind in the NKE → NMEA 2000 direction.** Its true-wind
   calculation "is calculated only during conversion from NMEA 2000 to NMEA 0183" `[STATED, YDNR
   manual §XII.2, p.39]`. An NKE `MWV,T` becomes PGN 130306 under the router's rule "theoretical wind
   sent as calculated using Heading/Speed through Water" `[STATED, Table 4, p.58]`. The router's own
   true↔apparent conversion (LAY-197's concern) acts on the **0183 output that qtVlm reads**, not on the
   PGNs the phone would store. One passage in the manual seems to contradict this (§3.3), so the spring
   capture must confirm it.
5. **Every correction happens upstream of the bus, inside the NKE sensors**, and is entered through the
   TL25. That covers the paddlewheel coefficient, offset and filter, the AWS coefficient, the AWA vane
   offset, the compass offset and the autocompensation deviation curve `[STATED for STW and the deviation
   curve; INFERRED for the rest]`. Damping (filter 1–32, default 8) is per channel. Whether it is applied
   before the bus value or only on the display is `[UNKNOWN]`, though the speedo's evidence points to the
   sensor (§4).
6. **Position, COG and SOG come from the Garmin GPSMAP 943's built-in GNSS**, which puts them on NMEA 2000
   (owner-stated). The router serves them to qtVlm as 0183 and to a RAW client as the Garmin's own
   frames. The private analysis repo's dropout evidence fits GPS arriving over the router rather than
   from the laptop's GPS (§6). Router RAW timestamps are UTC once the Garmin puts time on the bus `[STATED,
   YDNR manual p.63]`.
7. **AIS is on the bus if the AIS receiver is on NMEA 2000, or if the Garmin bridges it there.** The owner
   says AIS comes from the Garmin. To my knowledge the GPSMAP 943 has no built-in AIS receiver, so there
   is likely a separate AIS unit, and how it is wired decides whether 129038/129039/129794 frames appear
   on RAW `[UNKNOWN]`. A RAW server passes them unfiltered by default `[STATED, LAY-197 §3]`.

**For LAY-201:** for the NKE channels, "store every frame the router sends, as received" stores **the
router's re-encoding** of NKE's 0183 sentences, not NKE's output. The 0183 sentences themselves never
appear on a RAW server. If the provenance decision wants the closest-to-source form of the NKE data, the
phone has to also take an NMEA 0183 stream (§7).

---

## 1. Physical chain: how Topline data reaches the router

```
Aluwind HR ──┐                                          ┌── (any NMEA 0183 input, optional)
Fluxgate ────┤                                          │
Paddlewheel ─ speed/depth interface ─┤  TOPLINE BUS  ├── TL25 (master display; NMEA *input* only)
                                     │               │
                                     └── NKE unit with NMEA 0183 OUTPUT  ──0183──►  YDNR-02 RX port ──► NMEA 2000 bus
                                         (model unknown — §8)                         (converts)        ▲
                                                                                                         │
                                                                         Garmin GPSMAP 943 ── N2K ──────┘ (GPS, AIS)
```

- `[STATED, Aluwind §1.1, Fluxgate §1.1]` Both sensors are "connected to the TOPLINE bus" through an NKE
  terminal box (90-60-121 or 90-60-417). The installation diagrams show no NMEA connection on either.
- `[STATED, Speedo §1.1, §3.8]` The paddlewheel "is connected to the depth-finder log interface of your
  TOPLINE installation" and plugs into "the connector socket marked speed sensor" on that interface
  (90-60-450 in the diagram). The interface also has a depth input. **The owner's list has no
  speed/depth interface and no depth transducer**, yet the paddlewheel cannot work without the interface.
- `[STATED, TL25 §1.13, §3.7]` The TL25's six-wire cable carries +12 V, Topline data, ground, an init
  wire, and **"NMEA +" / "NMEA –" labelled "NMEA Input"**. No output pair. §1.13: "The TL25 includes an
  NMEA input, allowing the connection of a GPS, a PC…". Frames on that input become Topline channels.
  An NMEA frame "already created by an nke sensor" is ignored.
- `[STATED, YDNR manual p.8, §IV.2]` The YDNR-02 has 2 NMEA 0183 RX, 2 TX and 1 SeaTalk port. Port #1
  ships at 4800 baud, Port #2 at 38400.
- `[STATED, NKE interfaces]` NKE's current interfaces include the **Box N2K** (Topline ↔ NMEA 0183 ↔
  NMEA 2000, "manages 50 PGN"), the **Box USB WiFi** (wired, USB and Wi-Fi NMEA 0183 outputs) and the
  **Box Ethernet**. `[STATED, Box WiFi §1, §3, §8]` The Box WiFi (90-60-508) has a wired NMEA 0183
  output (red wire), 38400 baud by default (settable 4800–57600 through NKE's Toplink software), that
  "émet … les données disponibles sur le bus Topline".
- `[INFERRED]` The owner says the YDNR does the NMEA 2000 conversion, so the NKE unit is an NMEA 0183
  talker (a Box WiFi/USB, an older Topline NMEA output interface, or another NKE display with an
  output), not a Box N2K working as a native NKE→N2K gateway. If it *were* a Box N2K, NKE itself would
  put PGNs on the bus and most of §3 would change. **Identifying this box is the first thing to check
  aboard.**

## 2. What each NKE device puts on Topline, and what goes out as 0183

### Topline channels, by creator

| Channel | Created by | Source |
|---|---|---|
| Apparent wind speed, apparent wind angle, air temp | Aluwind HR | `[STATED, Aluwind §1.2]` |
| True wind speed, true wind angle | "If your installation is equipped with a speedometer" | `[STATED, Aluwind §1.2]` |
| True wind direction | "If your installation is equipped with a TOPLINE compass" | `[STATED, Aluwind §1.2]` |
| Surface speed (STW), daily log, total log, bus voltage, water temp | Paddlewheel via its speed/depth interface | `[STATED, Speedo §1.2]` |
| Magnetic heading | Fluxgate | `[STATED, Fluxgate §1.2]` |
| Magnetic heading, AWA, AWS, depth, boat speed, max/avg speed, MOB, VMG, CMG, **true wind speed, true wind angle, true wind direction, corrected heading**, estimated distance/angle, total log, trip log | "Channels created by the TL25 when set as master display" | `[STATED, TL25 §1.2]` |
| SOG/COG, XTE, target speed, polar efficiency, optimum angles… | NMEA channels, present only if something feeds an NKE NMEA input | `[STATED, TL25 §1.2, §1.13.4]` |

- `[STATED, TL25 §3.8]` At initialisation the TL25 becomes **master at address 1** if that address is
  free, otherwise a slave. `[INFERRED]` With no other NKE display listed, the TL25 is the master, and
  so it is **the TL25 that computes true wind** on this boat.
- `[INFERRED]` That true wind is computed from STW and heading, with no GPS term. Topline gets SOG/COG
  only from an NMEA input, and no source suggests the TL25 uses them for true wind. In canboat's
  130306 vocabulary it is *True (boat referenced)* or *True (water referenced)* `[STATED, canboat
  WIND_REFERENCE values 3 and 4]`, never *True (ground referenced to North)*.
- `[STATED by omission, TL25]` The TL25 manual describes no true-wind correction table, upwash, heel or
  mast-twist compensation. Its true wind is the plain vector triangle on the calibrated inputs
  `[INFERRED]`.
- `[UNKNOWN]` What "corrected heading" (TL25 §1.2) means: magnetic plus variation (true heading), or
  heading plus leeway. With no heel sensor it can hardly be leeway. Without a variation source on an
  NKE NMEA input it may not be populated at all.

### NKE NMEA 0183 output, Topline channel → sentence

`[STATED, Box WiFi §3, table pp.6–7]`. The Box WiFi is the only NKE output device whose manual I could
read. It sends, "en fonction des capteurs branchés":

| Topline channel | Sentences |
|---|---|
| SPEEDO (STW), COMPAS, CAP_VRAI | `VHW` |
| ANG_VENT_APP, ANEMO (apparent) | `MWV`, `VWR` |
| ANG_VENT_VRAI (TWA) | `MWV`, `VWT` |
| VIT_VENT_VRAI (TWS) | `MWV`, `VWT`, `MWD` |
| DIR_VENT_VRAI (TWD) | `MWD` |
| COMPAS (magnetic heading) | `HDG`, `HDM` (and in `VHW`) |
| CAP_VRAI (true heading) | `HDT` (and in `VHW`) |
| PROFONDEUR (depth) | `DBT`, `DPT` |
| LOCHJ, LOCHT (logs) | `VLW` |
| TEMP_AIR / TEMP_EAU | `XDR` / `MTW` |
| R_GITE (heel), TANGAGE_MES (pitch) | `XDR` |
| CAP_FOND, V_FOND, position, time, XTE, waypoint, variation | `VTG`, `GLL`, `RMC`, `ZDA`, `XTE`, `RMB` (only if those channels exist on Topline) |
| Performance channels | `$PNKEP,01`…`05` |

- `[INFERRED]` On this boat, with no heel sensor, depth transducer or NMEA input (as far as we know),
  the output would carry `VHW`, `MWV` (R and T), `VWR`, `VWT`, `MWD`, `HDG`, `HDM`, `VLW`, `MTW`, and
  `XDR` for air temperature. `HDT`/`CAP_VRAI` and `MWD` need a heading reference, and `MWD`'s TWD is
  relative to magnetic or true north depending on what Topline has. Talker ID, field precision and
  update rate are all `[UNKNOWN]`.
- `[UNKNOWN]` Whether this boat's output unit is a Box WiFi or a different NKE product with a different
  sentence table. Older NKE interfaces may emit fewer sentences (no `VWT`/`MWD`, for instance).

## 3. What the YDNR-02 turns those sentences into

### 3.1 Conversion table, NMEA 0183 → NMEA 2000

`[STATED, YDNR manual Appendix C, Table 4, pp.57–60]`, filtered to what NKE sends:

| NKE sentence | PGN the router emits | Router's comment |
|---|---|---|
| `MWV` | 130306 Wind Data | "Theoretical wind sent as calculated using Heading/Speed through Water" |
| `VWR`, `VWT` | 130306 Wind Data | — |
| `MWD` | 130306 Wind Data | — |
| `HDG` | 127250 Vessel Heading | — |
| `HDM`, `HDT` | 127250 Vessel Heading | "Use variation and deviation from HDG" |
| `VHW` | 128259 Speed, Water referenced | — |
| `VLW` | 128275 Distance Log | — |
| `DPT` (or `DBT` when no `DPT`) | 128267 Water Depth | — |
| `MTW` | 130311 Environmental Parameters | — |
| `XDR` | 130310/130311/130314/130316… | "Depends on configuration in «XDR Settings» section" (§XII.6) |
| `$PNKEP` | — (not in the table) | `[INFERRED]` not converted, so absent from RAW |

- `[STATED, canboat]` PGN 130306 has fields `windSpeed`, `windAngle` and `reference`, with reference
  values `0` True (ground, north), `1` Magnetic, `2` Apparent, `3` True (boat referenced), `4` True
  (water referenced). PGN 127250 has `heading`, `deviation`, `variation` and `reference` (True/Magnetic).
  PGN 128259 has `speedWaterReferenced`, `speedGroundReferenced` and `speedWaterReferencedType`.
- `[INFERRED]` The router's reading of `MWV,T` as "theoretical", i.e. HDG/STW-based, suggests it emits
  130306 with reference 3 or 4, not 0. This matches what the TL25 actually computes. `MWD` (a direction
  over north) would plausibly map to reference 0 or 1. **Which reference values the router writes is
  `[UNKNOWN]`** and is the most important single check in the spring capture, because it is the only
  label separating NKE's true wind from apparent wind once it is a PGN.
- `[INFERRED]` NKE's `HDG` heading is already deviation-corrected (the compass applies its own curve, §4).
  The `HDG` deviation field is probably empty and the variation field empty unless Topline has a
  variation source. So 127250 would arrive with reference Magnetic and no variation, and possibly a
  second 127250 (reference True) from `HDT` if Topline has CAP_VRAI.
- `[STATED, Table 4 note 7]` The router spaces PGNs built from more than one sentence by 50 ms, so one
  quantity can be emitted twice when two sentences carrying it arrive more than 50 ms apart. NKE sends
  the same quantity in several sentences (heading in `HDG`, `HDM` and `VHW`; apparent wind in `MWV` and
  `VWR`; TWS in `MWV`, `VWT` and `MWD`). `[INFERRED]` **A RAW recording can therefore hold duplicate
  PGNs for one NKE reading**, from the router's source address. A decoder must expect it, and a
  recorder must not deduplicate.
- `[STATED, Table 4 note 8]` "Sentences with no significant data (or data marked as invalid) may not be
  translated". NMEA 0183 sentences with invalid checksums are ignored unless Tunnel is on (§VI, p.26).
  `[INFERRED]` So a NKE value the router finds invalid **silently never becomes a frame**. Only a 0183
  stream would show that it was sent.
- `[INFERRED]` Unit and resolution change. 0183 sends knots and degrees to the talker's precision (often
  0.1). NMEA 2000 encodes m/s at 0.01 and radians at 0.0001 (canboat field resolutions). The PGN is
  a re-encoding, close enough for analysis but not byte-for-byte NKE's number.

### 3.2 Where the router's converted PGNs go

- `[STATED, YDNR manual Fig. 9, p.25]` Factory routing sends **Port 0183 #1 and #2 → NMEA 2000, Servers 1,
  2, 3 and SeaTalk**, and **NMEA 2000 → Servers 1, 2, 3**.
- `[STATED, p.26]` "The NMEA 2000 port and each server configured for RAW protocol has its own instance
  of the data converter to process incoming and outgoing NMEA 0183 and SeaTalk data." The manual's
  example: a RAW server fed only by an 0183 wind sensor "will have only apparent wind data".
- `[INFERRED]` With factory routing, a phone on a RAW server receives (a) the Garmin's and any other
  native devices' frames via NMEA 2000 → Server, and (b) **NKE data converted to PGNs by that server's
  own converter instance**, via Port 0183 → Server. So yes, a RAW client sees router-generated NKE PGNs.
  If someone has turned off Port 0183 → that server, the phone gets no NKE data unless the router's own
  N2K-port transmissions loop back. `[UNKNOWN]` whether they do. LAY-197 left the same question open.
- `[INFERRED]` Because the RAW server and the NMEA 2000 port convert independently, the same NKE reading
  could reach a RAW client twice: once from the server's converter and once as the N2K port's
  transmission, if the router echoes its own bus frames to servers. `[UNKNOWN]`, and the spring capture
  settles it by counting 130306 frames per NKE `MWV`.
- `[INFERRED from Appendix E, p.63]` **The original NKE sentences never appear on a RAW server.** RAW
  lines are CAN frames only (`hh:mm:ss.ddd R msgid bytes`).

### 3.3 True wind: who computes what

- `[STATED, §XII.2, p.39]` The router's true-wind options are SOG/HDG, SOG/COG, STW/HDG, disabled, or
  "Any" (factory default). "Please note that true wind is calculated only during conversion from NMEA 2000
  to NMEA 0183." With calculation disabled, "the Router reports true wind data only if they are
  calculated by another device".
- `[STATED, Table 3 note 3, p.56]` "Device with factory settings perform conversion from true to apparent
  wind and vice versa. MWV sentence is sending twice (one for relative wind and one for true)." The note
  sits in the **NMEA 2000 → NMEA 0183** table.
- `[INFERRED]` Read together: the router computes true wind for its **0183 outputs**, which is qtVlm's
  Server #1 feed, and not for PGNs it builds from NKE's sentences. **Conflict:** p.26 says that to
  "obtain true wind direction" on a RAW server fed by an 0183 wind sensor, you route NMEA 2000 (with its
  heading) to that server. That implies some true-wind derivation in the RAW direction. The manual does
  not resolve this, so `[UNKNOWN]`. The spring capture checks whether any 130306 frame has a true
  reference *without* a matching NKE `MWV,T`/`VWT`/`MWD` in the same second.
- `[INFERRED]` Consequence for qtVlm's existing recordings: Server #1 (NMEA 0183) may carry NKE's own
  true wind passed through from the 0183 port **and** a router-computed true wind (talker `YD`) built from
  bus data. If both reach qtVlm, which one it used is unrecorded. qtVlm's manual says it uses TWD/TWA/TWS
  from NMEA when present and computes them "based on COG, SOG and apparent wind data" only when absent
  `[STATED, qtVlm manual pp.208–210]`. Note that the qtVlm formula is ground-referenced (COG/SOG) while
  NKE's is water-referenced (STW/HDG).

## 4. Where each correction is applied

| Correction | Applied in | Evidence |
|---|---|---|
| STW calibration coefficient (multiplier) and offset | Paddlewheel's speed/depth interface. Entered from the TL25 | `[STATED, Speedo §1.6]` re-initialising "your depth-finder log interface" also resets "filtering, calibration, alarm, offset", so they are stored there. `[STATED, TL25 §1.5]` coefficient and offset are "setting parameters of the log-speedometer sensor". |
| STW filtering (1–32, default 8) | Same interface | `[STATED, Speedo §1.6]` filtering is reset with the interface. `[INFERRED]` so the STW on Topline, and therefore in NKE's 0183 output, is already damped. |
| AWS calibration coefficient | Aluwind channel, entered from the display | `[STATED, Aluwind §2.2]` "calib coef sub-channel of the apparent wind speed channel". `[INFERRED]` held by the sensor, as for the speedo. |
| AWA vane offset (factory offset plus tack-split correction) | Aluwind channel | `[STATED, Aluwind §2.1]` "each wind vane is set with a factory offset… the reference of your wind vane". Adjusted from the display. `[INFERRED]` stored in the sensor. |
| Heading offset | Fluxgate channel ("calib offset" sub-channel) | `[STATED, Fluxgate §2.1.2]` |
| Compass deviation curve (autocompensation) | **Fluxgate sensor itself** | `[STATED, Fluxgate §2.2.1]` "the sensor will record the measurement points of a deviation curve, every 10°"; on error "the measurements are not saved to the memory and the sensor resumes its normal operating mode". |
| Wind and heading filtering | Per channel, value 1–32 | `[STATED, Aluwind §1.4, Fluxgate §1.4, TL25 §1.7]` filtering "determines the frequency of update of the data displayed". `[UNKNOWN]` whether it damps the value on the bus or only the display. The speedo case suggests the sensor side. |
| True wind (TWS/TWA/TWD) | TL25 as master, from the corrected and filtered channels above | `[STATED, TL25 §1.2]` + §2 inference |
| Magnetic variation | None on Topline unless an NMEA input supplies RMC. qtVlm applies its own (forced, RMC, or WMM) | `[STATED, Box WiFi §2 input table (DECLINAISON_MAGNETIQUE from RMC), qtVlm manual p.43]` |
| 0183 → PGN re-encoding, unit and resolution change | YDNR-02 | §3.1 |
| True↔apparent calculation for 0183 outputs | YDNR-02, factory "Any" | §3.3 |
| Smoothing, sensor offsets, heel correction of AWA/AWS, leeway, current, 10 m wind | qtVlm | `[STATED, qtVlm manual p.183]` "smooth data received for wind/currents speed and direction, and boat speed"; the heel correction "is applied only if qtVlm receives only AWA/AWS from NMEA, if it receives directly TWS/TWD it assumes the correction is already made" |

`[INFERRED]` For LAY-201: **every NKE value on the bus already carries the Programmed Offset, the
multiplier, the compass's deviation table and (probably) the channel filter.** None of those settings is
transmitted. ADR 0005's Instrument Calibration record stays the only place they exist, and ADR 0008's
"masthead reading never reaches us" still holds for NKE data even with a full RAW capture. One nuance for
`CONTEXT.md`: NKE stores the corrections **in the sensors**, entered through the display, rather than in
the display. This changes nothing about where they sit relative to the bus.

## 5. The Garmin GPSMAP 943: position, COG/SOG, time, AIS

Owner-stated: the GPSMAP 943 is on NMEA 2000 and is the source of GPS and AIS. Garmin's primary
documentation was not reachable this session, so:

- `[UNKNOWN, believed from general product knowledge, not verified]` The GPSMAP 943 has a built-in GNSS
  receiver, an NMEA 2000 port and an NMEA 0183 port, and **no built-in AIS receiver**. Garmin sells AIS as
  separate units (AIS 600/800 transceivers, VHF radios with AIS).
- `[INFERRED]` A GNSS chartplotter that is the boat's GPS source puts the standard position set on NMEA
  2000: 129025 (Position, Rapid Update), 129026 (COG & SOG), 129029 (GNSS Position Data), 126992 (System
  Time), and likely 127258 (Magnetic Variation) and 129539/129540 (DOPs, satellites). The exact set is
  `[UNKNOWN]`. qtVlm decodes all of these `[STATED, qtVlm manual p.177]`.
- `[STATED, canboat]` Garmin's proprietary messages live under PGN 126720 with manufacturer code 229
  (canboat names Day/Night/Color mode, autopilot and AHRS messages). A RAW recording will contain them if
  the Garmin sends them. They are harmless to store.
- `[UNKNOWN]` Whether the Garmin **re-transmits** heading, wind or true wind it receives (for example,
  computing its own true wind from the router's 130306 and 127250 and putting it back on the bus). If it
  does, a second true-wind source with a Garmin source address appears on RAW. The spring capture lists
  sources per PGN.
- `[STATED, YDNR manual p.63]` RAW timestamps are UTC once the router has received time from the NMEA 2000
  network. `[INFERRED]` With the Garmin supplying 126992/129029, router time is UTC after the plotter gets
  a fix. LAY-197's caveats still hold before then, and at the 00:00 UTC rollover.
- **AIS** `[INFERRED]`: if the AIS unit is on NMEA 2000, its 129038/129039/129040/129794/129809/129810
  frames are on the bus and reach RAW unfiltered. If it is wired to the Garmin's 0183 port, they reach
  the bus only if the Garmin bridges 0183 AIS to NMEA 2000, which is `[UNKNOWN]`. If it is wired to a
  YDNR 0183 port, the router converts `VDM`/`VDO` to those PGNs `[STATED, Table 4, p.60]`. AIS fast-packets
  are the heaviest traffic on the bus (LAY-197 §3).

## 6. What the existing evidence says (no recording data reproduced)

- `[STATED, qtVlm manual p.77, via docs/research/qtvlm-csv-columns.md]` qtVlm's VDR export records TWD,
  TWS, TWA, CTW and STW, not AWA/AWS or HDG. So last season's recordings cannot show whether qtVlm took
  NKE's true wind or computed its own.
- `[INFERRED]` The private repo's dropout ADR describes spans where position, COG and SOG froze **together
  with** the instrument fields going blank, which is what a dead router connection looks like. It also
  describes spans where position froze while instruments stayed live, which fits the Garmin path (NMEA
  2000 → router → 0183) failing or losing its fix separately from the NKE path (0183 port → server). Both
  fit GPS arriving through the router, not from the laptop's own GPS. Neither proves it.
- The private repo has no wiring notes, no router configuration and no NKE box inventory. It does keep a
  compass calibration log, which is an ADR 0005 Calibration Event source and nothing more.
- `[STATED, qtVlm manual p.180]` qtVlm has a **"Record NMEA data"** option that writes "a new file
  containing all received data" each time acquisition restarts. If it was ever on, the laptop holds a
  real capture of the router's 0183 stream from last season. That would answer most of §8 before spring
  (see the checklist).

## 7. Consequences for the provenance decision (LAY-201)

These are inferences for LAY-201 to weigh, not decisions.

1. **Two "as received" layers exist for NKE data, and RAW holds only the second.** NKE's 0183 sentence
   (what NKE sent) → the router's PGN (what the router made of it). A recorder on RAW alone stores the
   router's translation. If that is acceptable, provenance for these PGNs should say *"converted by the
   YDNR-02 from NKE NMEA 0183"*, keyed on the router's source address and 126996 product info. If not,
   the phone also needs an **NMEA 0183 stream carrying only the NKE port** (for example, a Transmit-only
   0183 server with routing from that 0183 port and nothing from NMEA 2000, so no router-computed
   sentences get mixed in). The YDNR's three servers and three TCP clients per server allow it
   (LAY-197 §5).
2. **True wind can be stored as received, not derived.** NKE's TL25 computes it and it reaches the bus as
   130306 from the router, without the router recomputing it (with the §3.3 caveat). Its provenance chain
   is *Computed by TL25 (STW/HDG, water-referenced) from calibrated, filtered channels → re-encoded by
   YDNR*. The phone should never compute its own true wind and present it as the instrument's.
3. **Source address is the provenance key on RAW.** NKE data comes from the router's address. GPS, time
   and AIS (probably) come from the Garmin's or the AIS unit's. A router-computed or Garmin-computed true
   wind, if either exists, would be told apart only by address and reference value.
4. **Corrections are all upstream and unrecorded.** Nothing in the frames tells you the Programmed
   Offsets, the deviation table or the filter settings. ADR 0005's record is still required, now for the
   phone's recordings as much as for qtVlm's.
5. **The phone's own GPS is a second source for the Garmin**, not a first one: position, COG, SOG, and an
   independent clock against the router's UTC.

## 8. What the owner must check aboard

Ordered by how much each changes the answer. Items 1–4 need only the instruments powered. The rest are
for the spring capture.

1. **Find the NKE unit wired to the YDNR's NMEA 0183 RX terminals** and read its label (name, part number
   90-60-xxx). The TL25 has no NMEA output, so it is another box: Box WiFi/USB, Box N2K, an older Topline
   NMEA output interface, or a second display. Note which YDNR port (#1 or #2) it lands on and that
   port's baud rate.
2. **Look for the NKE speed/depth interface** (the box the paddlewheel plugs into) and **check for a depth
   transducer**. Note anything wired to the TL25's NMEA input (yellow/green wires) or to any other NKE
   NMEA input.
3. **On the TL25**, confirm it is the master (CONFIGURATION channel, address 1). Page through the
   channels and note whether TRUE WIND SPEED/ANGLE/DIRECTION, CORRECTED HEADING and any NMEA channels
   (SOG/COG, position) are present. Note each channel's FILTERING value.
4. **Laptop:** check whether qtVlm's "Record NMEA data" option was on last season and whether those files
   exist. If they do, keep a copy privately. Open qtVlm's NMEA raw data window on the router feed and note
   which talkers and sentences arrive (`II`/NKE `MWV`,`R`/`T`, `VWT`, `MWD`, `HDG`, `VHW`… and `YD…` ones
   from the router).
5. **YDNR web interface:** screenshot the NMEA Server, NMEA Routing, NMEA Filters and NMEA Settings pages
   (true-wind calculation option, talker ID, XDR settings). Note the firmware version.
6. **Garmin GPSMAP 943:** note the AIS hardware and how it is wired (NMEA 2000, Garmin 0183, or YDNR 0183).
   Screenshot the NMEA 2000 device list (Settings → Communications) to record every source on the bus.
   Note any NMEA 2000 output or wind/heading options.
7. **Spring capture** (RAW, with the phone's receive time, alongside an 0183 capture of the same
   minutes), to verify:
   - the router's source address and 126996 product info, and that NKE PGNs come from it;
   - the **130306 reference values** on frames built from `MWV,R`, `MWV,T`, `VWT` and `MWD`;
   - whether any true-reference 130306 appears that NKE did not send (router or Garmin derivation, §3.3);
   - 127250's reference, and whether its deviation and variation fields are populated;
   - duplicate PGNs per NKE reading (note 7), and whether the router's own N2K transmissions also reach
     the RAW server;
   - the Garmin's PGN set, any 126720 proprietaries, and whether AIS PGNs are present.

## Open questions this research could not settle

- The model of the NKE 0183 talker, and so its exact sentence set, talker ID, precision and rate (§2).
- Whether NKE channel filtering damps the bus value or only the display (§4).
- Whether the router derives true wind in the 0183 → RAW direction at all (§3.3 conflict).
- Every Garmin GPSMAP 943 specific: its PGN list, AIS capability, rebroadcasting (§5). Read them off the
  plotter, or fetch Garmin's installation instructions when the site can be reached.
