# LAY-200: Keeping a multi-hour race recording alive in the background on iOS

Research for LAY-200, a child of the LAY-196 map (companion iOS app). The question: can an Expo app
record phone GPS **and** keep reading a TCP/UDP socket to the boat's YDNR (Yacht Devices NMEA Router)
for a 2–8 hour race, with the screen locked, and what does it cost? **This is research, not a design.**
Nothing here touches code.

Every claim is labelled one of three ways:

- **Stated**: a primary source says it. The source is cited and quoted where the wording matters.
- **Inferred**: my conclusion from stated facts. The reasoning is given.
- **Estimate**: a number no primary source publishes. Treat it as a hypothesis for the dockside or
  spring test.

Sources were read on 2026-11-09. Apple pages were read as the DocC JSON behind
`developer.apple.com/documentation/...`, so the quotes are the current published text. The Expo
source is `expo/expo` at `main` (expo-location 58.0.19).

## Bottom line

1. **Yes, with conditions.** An app that starts standard location updates in the foreground, with
   `UIBackgroundModes: location` and `allowsBackgroundLocationUpdates = true`, is kept *running* in
   the background (stated). A running process keeps its threads, so a socket opened by that process
   keeps reading (inferred, and consistent with TN2277). The condition is that location updates must
   keep flowing. If they pause, the process can be suspended and the socket reclaimed. So
   **auto-pause must be off**, and on iOS 17+ the `CLLocationUpdate.liveUpdates` API (which pauses
   automatically when you're stationary) is the wrong tool for this job.
2. **When In Use is enough** to record in the background. It shows the blue status-bar indicator.
   **Always** adds only one thing that matters here: relaunch after termination via
   significant-location-change. That relaunch is coarse (≥500 m, ≤ once per 5 min) and is disabled
   by Low Power Mode. Ask for When In Use only, and design recovery around "the user reopens the app".
3. **Connect to the router over TCP, not UDP broadcast.** On iOS, receiving UDP broadcast or
   multicast needs the `com.apple.developer.networking.multicast` entitlement, which needs Apple's
   approval (stated). An outgoing TCP connection needs only the Local Network permission (stated).
   The YDNR's Server #1 defaults to TCP port 1456 (stated, YDNR-02 manual).
4. **Local Network permission must be granted in the foreground before the race.** In the
   background, with the permission still undetermined, the operation is silently denied and no
   prompt appears (stated).
5. **Things that still end a recording:** force-quit from the app switcher, memory-pressure kills
   (jetsam; likeliest if a crew member shoots video while recording), crashes, overheating in a sunny
   cockpit, and the user turning off Location Services or Local Network. None of these can be
   prevented, so **every GPS fix and every router frame must be appended to disk as it arrives**.
   Nothing should sit only in memory.
6. **Use legacy `expo-location` `startLocationUpdatesAsync` or a thin custom native module. Avoid
   `expo-location/next` for this.** The legacy task consumer sets exactly the right
   `CLLocationManager` knobs. But it buffers "deferred" fixes in memory, calls into JS for each
   batch, defaults to 100 m accuracy, and drops `speedAccuracy`/`courseAccuracy`. A thin Swift
   module that owns the location manager, the TCP connection and the append-only file is
   *advisable* rather than required. Its strongest argument is ADR 0008 provenance and crash safety,
   not keep-alive.
7. **Battery cost has no primary-source figure.** Apple publishes none. My **estimate** is
   2–5 %/hour with the screen off: roughly 15–40 % for an 8-hour distance race on a healthy
   battery. Measure it before trusting it; a protocol is given below.

---

## 1. Does an active background-location session keep the process (and the socket) alive?

### What Apple states

- Most apps are suspended "shortly after they move to the background. In this suspended state,
  apps don't run and don't receive location updates… If your app needs updates in a more timely
  manner, you can ask the system to not suspend your app while location services are active."
  ([Handling location updates in the background](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background))
- `allowsBackgroundLocationUpdates`: "When the value of this property is true and you start location
  updates while the app is in the foreground, Core Location configures the system to **keep the app
  running** to receive continuous background location updates, and arranges to show the background
  location indicator (blue bar or pill) if needed. Updates continue even if the app subsequently
  enters the background." Setting it true without `UIBackgroundModes`/`location` "is a fatal error
  that terminates the app."
  ([allowsBackgroundLocationUpdates](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates))
- "If you enable background location updates, an app with When in Use authorization **continues to
  run in the background when location services are active**; if location services aren't running,
  the normal suspension rules apply."
  ([Requesting authorization to use location services](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services))
- On the iOS 17+ API: "Core Location does not take measures to keep apps running continuously when
  it has nothing to deliver to them."
  ([WWDC24 10212, What's new in location authorization](https://developer.apple.com/videos/play/wwdc2024/10212/))
- Sockets in a suspended app: "the system may choose to reclaim resources out from underneath a
  network socket used by the app, thereby closing the network connection," often surfacing as
  `EBADF`. ([TN2277 Networking and Multitasking](https://developer.apple.com/library/archive/technotes/tn2277/_index.html); archived and iOS 4-era, but its model of suspended sockets matches the current docs)
- Apple DTS (Quinn): there is "no general-purpose mechanism for running code continuously in the
  background… Each of these mechanisms fulfils a specific purpose. Do not attempt to use them for
  some other purpose. Before using a background API, read clause 2.5.4."
  ([iOS Background Execution Limits](https://developer.apple.com/forums/thread/685525))

### What I infer

- **The socket rides on the location session.** While Core Location keeps the process running, the
  process is not suspended, so its network threads run and TN2277's reclaim doesn't apply. Nothing
  in Apple's docs says "and your sockets will work". It follows from "keep the app running". This is
  the most important assumption to verify on the water.
- **Gaps in location delivery are gaps in the socket.** Anything that pauses location updates puts
  the app back under "normal suspension rules", and then the router connection dies. That makes
  these settings load-bearing:
  - `pausesLocationUpdatesAutomatically = false`. Apple: "For apps that have in-use authorization, a
    pause to location updates **ends access to location changes until the app launches again**."
    ([pausesLocationUpdatesAutomatically](https://developer.apple.com/documentation/corelocation/cllocationmanager/pauseslocationupdatesautomatically))
    The default is `true` on iOS.
  - Not `CLLocationUpdate.liveUpdates`. WWDC23 10180 describes its *automatic pause*: "once the
    device is in stationary state for a sufficient amount of time, CLLocationUpdate API will
    recognize this and trigger Automatic Pause." No opt-out is described
    ([WWDC23 10180, Discover streamlined location updates](https://developer.apple.com/videos/play/wwdc2023/10180/)).
    A boat in a postponement, rafted up, or waiting out a long general recall can look stationary.
    Pausing there would suspend the app and drop the router feed at exactly the moments the race
    committee is doing something interesting.
  - `distanceFilter = kCLDistanceFilterNone`. A large distance filter means long silences when
    the boat is slow, so updates stop arriving. Whether a distance filter alone lets the app be
    suspended is undocumented. Avoid the question.
- **App Review 2.5.4** ("may only use background services for their intended purposes: … location
  …") is satisfied, because the location *is* the product: a race track. The socket is incidental.
  This argues for keeping GPS recording real and always on during a recording, never a token
  low-accuracy session kept only to hold the process open (inferred; a public-release concern only,
  per map decision 6).

### What suspends or terminates it anyway

| Event | What happens | Basis |
|---|---|---|
| **Phone call / other app in front** | The app is already in the background, and a call is just another foreground app. With location running, the app keeps running. | Inferred from the "keep the app running" statements. No Apple doc addresses calls specifically. Test it. |
| **Screen locked** | The screen being locked isn't a separate state for a background app. Location keeps it running. | Inferred. TN2277's lock-screen reclaim applies to *suspended* apps. |
| **Low Power Mode** | Apple lists the effects as: Auto-Lock 30 s, dimmer display, reduced CPU/GPU, "Pausing discretionary and background activities", and "Turns off Background App Refresh". Location isn't listed. | Stated: [isLowPowerModeEnabled](https://developer.apple.com/documentation/foundation/processinfo/islowpowermodeenabled), [Apple Support 101604](https://support.apple.com/en-us/101604). That a running location session survives Low Power Mode is **inferred** (it isn't "discretionary"). Low Power Mode **does** kill significant-change relaunch; see §5. |
| **Memory pressure** | The system terminates background apps to free memory for the foreground app (`vm-pageshortage` jetsam). Background apps go first. | Stated: [Jetsam event reports](https://developer.apple.com/documentation/xcode/identifying-high-memory-use-with-jetsam-event-reports). Inferred: the camera/video app at the start is the likeliest trigger. Keep the recorder's resident memory small, which favours streaming to disk over buffering. |
| **Force-quit (swipe up in the app switcher)** | Process gone. "If your app is terminated either by a user or by the system, the system doesn't automatically restart your app when new location updates arrive… The only way to have your app relaunched automatically is to use region monitoring or the significant-change location service." | Stated: [Location and Maps Programming Guide](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/LocationAwarenessPG/CoreLocation/CoreLocation.html) (archived). WWDC23 10180 says liveUpdates "can recover your app in most cases" including "user close". The two sources disagree; assume force-quit **ends the recording**. |
| **Crash** | Process gone, same as above. | Stated (WWDC23 10180 lists crash among paths to Terminated). |
| **Overheating** (sun on a black phone in a cockpit) | Apple's rated ambient range is 0–35 °C. When hot, the iPhone dims or blacks the display, slows charging, puts the cellular radios in low power, reduces app performance, and at extreme thresholds shows a temperature warning screen. | Stated: [Apple Support 118431](https://support.apple.com/en-us/118431). Whether GPS or Wi-Fi stop at the warning screen isn't stated. Shade the phone. |
| **Location Services or app location permission turned off mid-race** | Updates stop, then normal suspension. | Stated (authorization-change delegate docs). |
| **Local Network permission revoked mid-race** | "If your program successfully made a TCP connection… and then the user changed the Local Network privilege to deny… the connection closes." | Stated: [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy). |
| **Wi-Fi without internet** | Traffic to a local network address "goes directly; it's not forwarded by a router," and is a Local Network operation. Nothing in Apple's docs ties local traffic to the network having internet. | Stated (TN3179). Inferred: a TCP connection to the YDNR (e.g. 192.168.4.1) stays on the Wi-Fi interface even when iOS marks the network "No Internet Connection". Unverified: whether iOS ever leaves a no-internet network for a remembered one with internet (marina Wi-Fi) mid-race. Test this at the dock. |
| **Phone leaves Wi-Fi range / YDNR loses power** | The TCP connection drops. The app keeps running because location keeps it alive, so it can reconnect. | Inferred. The recorder needs a reconnect loop, and should record the gap as a gap (core belief: missing stays missing). |

---

## 2. When In Use + indicator versus Always

### What Apple states

- **When In Use is sufficient for continuous background updates** once they were started in the
  foreground (quote in §1). The system shows the blue indicator automatically: "For apps with When
  In Use authorization, the system changes the appearance of the status bar when the app uses
  location services in the background." `showsBackgroundLocationIndicator` "affects only apps that
  received Always authorization."
  ([showsBackgroundLocationIndicator](https://developer.apple.com/documentation/corelocation/cllocationmanager/showsbackgroundlocationindicator))
- iOS 17+: `CLBackgroundActivitySession` "allows a when-in-use authorized app to receive location
  updates or monitoring events" and "keeps the app effectively in-use". It must be started from the
  foreground, and you can only "rejoin an existing one from the background"; `UIBackgroundModes`
  `location` is still required.
  ([CLBackgroundActivitySession](https://developer.apple.com/documentation/corelocation/clbackgroundactivitysession-3mzv3), WWDC23 10180)
- What Always adds, from Apple's table: "Launches a terminated app automatically. When in Use: No.
  The user must launch the app. Always: Yes for significant location change, visits, and region
  monitoring services; no for others." Apple: When In Use "is the preferred choice." You may ask
  for Always after When In Use, but "you can make the request only once."
  ([Requesting authorization](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services))
- From iOS 18: "Always authorization will only be effective when you hold one of these
  [`CLServiceSession(.always)`], and you can only start holding one when your app is in the
  foreground." (WWDC24 10212)
- Purpose strings: `NSLocationWhenInUseUsageDescription` is required for either level, and
  `NSLocationAlwaysAndWhenInUseUsageDescription` for Always. "Authorization requests fail
  immediately if the required keys aren't present."

### What App Review expects

- **5.1.5**: "Use Location Services in your app only when it is directly relevant to the features
  and services provided by the app… Ensure that you notify and obtain consent… explain the purpose
  in your app."
- **5.1.1(ii)/(iii)**: purpose strings must "clearly and completely describe your use of the data",
  and apps "should only request access to data relevant to the core functionality."
- **2.5.4**: background services only "for their intended purposes", location among them.
- **2.4.2**: "Apps should not rapidly drain battery, generate excessive heat."
- Apple's purpose-string guidance asks for one complete active-voice sentence that names the feature
  and gives a concrete example. "To use location." is its example of an insufficient string
  ([5.1.1 purpose strings](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-purpose-strings)).
- I found no battery-warning disclaimer requirement in the current guidelines text (searched the
  full page). Older guideline versions had one.

### Conclusion (inferred)

**Request When In Use only.** It records in the background with the blue pill, which also acts as an
honest, tappable "recording" indicator for the crew. Always would buy only coarse relaunch, which
Low Power Mode disables (§5), at the cost of a harder App Review justification and a one-shot prompt.
Draft strings to App Review's standard (map decision 6), with wording to be finalised by the
building ticket:

- `NSLocationWhenInUseUsageDescription`: "Layline records your boat's GPS track while you race, so
  you can review your tacks, speed and course on the dashboard afterwards."
- `NSLocalNetworkUsageDescription`: "Layline connects to your boat's NMEA router on its Wi-Fi to
  record wind, speed and heading from your instruments during a race."

Replace expo-location's defaults: its config plugin falls back to "Allow $(PRODUCT_NAME) to access
your location", which is exactly the vague form Apple calls insufficient (stated:
`packages/expo-location/plugin/src/withLocation.ts`).

---

## 3. Local Network permission

All stated in [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
unless marked otherwise.

- **Scope.** Since iOS 14, any outgoing traffic to a local network address needs the Local Network
  privilege. This covers TCP connect, UDP send, connecting a UDP socket, and receiving UDP
  multicast/broadcast. *Receiving* incoming UDP unicast and *accepting* incoming TCP don't. The
  checks sit "deep in the networking stack, and thus they apply to all networking APIs", BSD
  sockets included. That means a React Native socket library is covered too.
- **Info.plist.** Add `NSLocalNetworkUsageDescription`, which "Any app that uses the local
  network, directly or indirectly, should include." `NSBonjourServices` is needed **only** if the
  app registers or browses Bonjour service types. For a known IP:port such as the YDNR, it isn't
  needed. In Expo, both are plain `ios.infoPlist` entries in app config; no config plugin is needed
  (inferred from how Expo's `infoPlist` works).
- **Multicast/broadcast.** Sending or receiving UDP multicast or broadcast on iOS needs
  `com.apple.developer.networking.multicast`, which "requires permission from Apple before you can
  use it"
  ([entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.multicast)).
- **Prompt timing.** There's no API to request the permission. The first local network operation
  triggers the alert, and the operation "may [be denied] immediately, before the user has
  responded". Use an API that waits for connectivity (Network framework, `NWConnection`) or retry.
- **Background with undetermined state.** "If an iOS app is in the background and performs a local
  network operation while its Local Network privilege is undetermined, the system denies that
  operation without presenting the local network alert." So the first router connection must
  happen in the foreground: a pre-race "Connect to boat" step.
- **Denied.** There's "no general API that returns whether the current process has local network
  access". With `NWConnection`, a denied TCP connection sits in `.waiting` with
  `unsatisfiedReason == .localNetworkDenied`, and retries automatically if the user later allows
  it. With BSD sockets you just get a failure. **Inferred:** the UI should tell the user to go to
  Settings › Privacy & Security › Local Network, and a native `NWConnection` gives a clean signal
  for "gateway: permission denied" versus "gateway: unreachable".
- **Testing.** The simulator doesn't support local network privacy, so test on a device. Reset by
  deleting the app. iOS 18 before 18.6 had a state-sync bug (FB14321888).

### Consequence for the YDNR (stated: YDNR-02 manual, `yachtd.com/downloads/ydnr02.pdf`)

The manual says the router has three servers, each TCP and/or UDP, carrying NMEA 0183 or NMEA 2000
"RAW". In TCP mode each server allows three connections ("three servers allow nine connections in
total"). UDP clients are "unlimited". Yacht Devices "recommend using UDP protocol where possible"
because the router's CPU is limited and "UDP… may work 5-6 times faster than TCP". The default
Server #1 is TCP port 1456, and the router's access point is 192.168.4.1.

**Inferred:** "unlimited" UDP clients implies the YDNR's UDP mode is broadcast. Receiving broadcast
needs the Apple-approved multicast entitlement. So **the iOS recorder should be a TCP client**. It
needs only Local Network permission, and the connection gives a real "gateway connected" state for
map decision 9's status line. It uses one of nine TCP slots; qtVlm on the laptop uses another, so
side-by-side recording (decision 7) fits. Don't reconfigure the router to UDP to suit the laptop
without checking this. Which server, protocol (RAW vs 0183) and port is the provenance ticket's call,
not this one.

---

## 4. GPS accuracy, sample rate, and battery

### Options (stated)

- `desiredAccuracy`: the iOS default is `kCLLocationAccuracyBest`.
  `kCLLocationAccuracyBestForNavigation` "uses additional sensor data… Because of the extra power
  requirements, use this level of accuracy only while the device is plugged in."
  ([desiredAccuracy](https://developer.apple.com/documentation/corelocation/cllocationmanager/desiredaccuracy),
  [BestForNavigation](https://developer.apple.com/documentation/corelocation/kcllocationaccuracybestfornavigation))
  Without precise-location permission, accuracy is always reduced.
- `distanceFilter`: the default is `kCLDistanceFilterNone`, "to receive notifications for all
  movements".
- `activityType`: `.otherNavigation` is "for activities that don't or may not adhere to roads such
  as… boats". It "might cause the system to pause location updates when the vehicle doesn't move a
  significant distance", but only when pausing is allowed. `.fitness` disables indoor positioning.
  The default is `.other`.
- Deferred updates (`allowDeferredLocationUpdates`) were a hardware batching feature, deprecated
  since iOS 13. Expo's `deferredUpdatesInterval`/`deferredUpdatesDistance` are a **JS-side
  in-memory batch**, not hardware deferral (stated: `EXLocationTaskConsumer.m`; see §6).

### Recommended configuration (inferred)

Use `kCLLocationAccuracyBest`, `kCLDistanceFilterNone`, `.otherNavigation`,
`pausesLocationUpdatesAutomatically = false`, `allowsBackgroundLocationUpdates = true`, and
`showsBackgroundLocationIndicator = true` (which only matters if Always is ever granted). Use
BestForNavigation only if the phone is on a cockpit charger. Apple doesn't document the delivery rate
of standard updates. iPhones are commonly observed to deliver about 1 Hz at Best with no filter
(**unverified**). Record the rate you actually get, along with each fix's `horizontalAccuracy`,
`speedAccuracy` and `courseAccuracy`. Don't decimate on the phone: store every fix as delivered,
which is core belief #1.

### Battery (estimate, measure before trusting)

No Apple primary source gives a per-hour cost for background GPS or Wi-Fi. Apple only says location
"is a power-intensive operation" and that keeping the hardware running "degrades battery life"
(Location and Maps Programming Guide). **Estimate:** with the screen off, 1 Hz GNSS plus an idle-ish
Wi-Fi TCP stream (NMEA 2000 RAW at bus rates is a few kB/s) costs about **2–5 % of battery per
hour** on a recent iPhone with a healthy battery. That's roughly 5–15 % for a 2–3 hour weeknight
race and 15–40 % for an 8-hour distance race. Heat, an old battery and screen-on checks push it up.
This estimate isn't sourced. It's a starting hypothesis.

**Measurement protocol** (doable on land now, no boat needed): run the recorder for 4 h with the
screen locked, walking or driving, joined to any no-internet Wi-Fi AP streaming a synthetic NMEA
feed. Log `UIDevice.batteryLevel` and `ProcessInfo.thermalState` into the recording every minute.
That data is also worth keeping in the recording as provenance. Read MetricKit's daily payload
(location activity and CPU time) afterwards. Repeat with the Wi-Fi feed off to separate GPS cost from
socket cost.

---

## 5. Recovering from a kill or crash without losing data

### What Apple states

- "The system can terminate apps at any time to free up memory… If your app actively receives and
  processes location updates and terminates, it should restart those APIs upon launch… When you
  start those services, the system resumes the delivery of queued location updates."
  (Handling location updates in the background)
- Significant-change relaunch: "If you start this service and your app is subsequently terminated,
  the system automatically relaunches the app into the background if a new event arrives… Apps can
  expect a notification as soon as the device moves 500 meters or more… not… more frequently than
  once every five minutes."
  ([startMonitoringSignificantLocationChanges](https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoringsignificantlocationchanges()))
  This requires **Always** (see the table in §2).
- "When a user disables the Background App Refresh setting either globally or for your app, the
  significant-change location service doesn't relaunch your app." (Location and Maps Programming
  Guide) Low Power Mode "Turns off Background App Refresh" (Apple Support 101604).
- iOS 17+ sessions: Core Location "will resume or re-launch the app into the background when new
  information is ready for delivery, **and the app's authorization allows it**". It remembers
  outstanding sessions "only a few seconds after the app is launched again", so the app must
  re-create its `CLBackgroundActivitySession` and resume `liveUpdates` immediately in
  `didFinishLaunching`. (WWDC24 10212, WWDC23 10180)

### What I infer

- **Relaunch is not a recovery strategy for this app.** Under When In Use, the system never relaunches.
  Under Always, significant-change relaunch comes after up to 500 m or 5 minutes and doesn't come at
  all in Low Power Mode, which a crew conserving battery for an 8-hour race may well have on. The
  WWDC claim that a When-In-Use session app is relaunched "in most cases" conflicts with the
  authorization table that says it never is. Treat it as a bonus to test, not a guarantee.
- **Durability comes from writing as you go.**
  - Append every GPS fix and every router frame to an on-disk, append-only file (or a SQLite WAL
    table) **as it arrives**, from the native side if possible. Keep a small in-memory buffer at
    most and flush every few seconds, so a jetsam kill loses seconds, not the race.
  - Persist a "recording in progress" marker (race/recording id, start time) on start. On *any*
    launch, if the marker exists and wasn't closed, either resume into the same recording
    (restarting location and the socket) or close it as interrupted, and record the gap explicitly.
  - Each segment should carry its own start/stop reason ("app relaunched", "socket reconnect"), so
    the archive shows the gap honestly rather than interpolating across it (core beliefs; ADR 0008
    provenance).
  - Optional: on start, schedule a local notification with a `UNLocationNotificationTrigger` or
    timer saying "Recording stopped — tap to resume", as Apple suggests for paused updates. The
    pausesLocationUpdatesAutomatically doc describes this pattern. Whether it's worth it is a
    product call.
  - Tell the crew plainly: **don't swipe Layline away during a race.**

---

## 6. Is expo-location's background task suitable for a high-rate track?

### What the source does (stated, `expo/expo` main, expo-location 58.0.19)

**Legacy `Location.startLocationUpdatesAsync` + `TaskManager.defineTask`**
(`ios/TaskConsumers/EXLocationTaskConsumer.m`, `ios/LocationModule.swift`):

- It checks only **foreground** (When In Use) permission. The comment says a "user-initiated
  foreground service… does NOT require the background location permission". It also requires
  `UIBackgroundModes` `location` and throws otherwise.
- It creates a `CLLocationManager` with `allowsBackgroundLocationUpdates = YES`, then calls
  `startUpdatingLocation` **and** `startMonitoringSignificantLocationChanges`.
- Option defaults: `accuracy` defaults to **Balanced = `kCLLocationAccuracyHundredMeters`**, so you
  must pass `Accuracy.Highest` (Best) or `BestForNavigation`. `distanceInterval` defaults to none.
  `pausesUpdatesAutomatically` defaults to **false**, which is correct.
  `showsBackgroundLocationIndicator` defaults to false. `activityType` is configurable (use
  `OtherNavigation`).
- Delivery: in the foreground, every `didUpdateLocations` batch calls the JS task immediately. In
  the background, fixes go into an **in-memory `NSMutableArray`** until `deferredUpdatesInterval`/
  `deferredUpdatesDistance` are met. With the defaults (0/0), that means every update. Each call
  runs the task body in JS (headless if the app was relaunched).
- Exported fields: lat, lon, `ellipsoidalAltitude` (as `altitude`), `horizontalAccuracy`,
  `verticalAccuracy`, `course` (as `heading`), `speed`, timestamp, and `isSimulatedBySoftware`.
  It does **not** export `speedAccuracy`, `courseAccuracy`, or the MSL `altitude`.
- `expo-task-manager` persists registered tasks to `NSUserDefaults` and restores them in
  `applicationDidFinishLaunchingWithOptions`, so a relaunched app restarts location without JS.

**`expo-location/next`** (new API, actively changing in Oct–Nov 2026):

- On iOS 17+, background tasks use `CLLocationUpdate.liveUpdates` + `CLBackgroundActivitySession`,
  and on iOS 18 also hold `CLServiceSession(authorization: .always)`
  (`ios/next/Position/PositionUpdatesLiveSource.swift`). Each fix is one JS task execution.

### What I infer

- **The legacy API can do the job for TestFlight v1** if configured as in §4, because underneath it
  is the right `CLLocationManager` setup. Its weak points:
  1. The in-memory deferred buffer is lost on kill. Keep the deferral options at 0.
  2. A JS round-trip per batch, with JS then writing to disk. If the JS thread stalls, fixes queue in
     memory.
  3. It loses `speedAccuracy`/`courseAccuracy`. That conflicts with "store what the source gave
     you", and those are exactly what tell SOG/COG noise from a real lift or header later.
  4. It doesn't own the socket, so the router feed lives in a separate RN library (e.g.
     `react-native-tcp-socket`, BSD sockets via CocoaAsyncSocket) whose frames also cross into JS
     before reaching disk.
- **Don't use `expo-location/next` for the recorder on iOS.** liveUpdates' automatic stationary
  pause can let the app be suspended and the router socket reclaimed (§1). Holding a
  `CLServiceSession(.always)` also implies pushing toward Always authorization, which this app
  doesn't want (§2). It's also too new to pin a race-day recorder to.
- **A thin custom Expo native module is advisable, not mandatory.** Expo Modules API, Swift, about
  one file. It would own `CLLocationManager` (settings from §4), an `NWConnection` TCP client to the
  YDNR (which gives clean `.localNetworkDenied` and reconnect signals for free), and an append-only
  writer that stores fixes with every `CLLocation` field and frames as received with the receive
  timestamp. Only status (recording / gateway connected / GPS fix, per map decision 9) and counts
  would go to JS. This keeps capture independent of the JS thread and keeps every field.
  - Against it: map decision 3 says Swift only "where iOS demands it", and the agent can't build or
    test Swift on Linux; the owner's Mac can. iOS doesn't strictly *demand* it. The argument is data
    integrity and crash-safety. **Suggested path:** prototype with legacy expo-location +
    `react-native-tcp-socket` + streaming file writes. Graduate to the native module if the dockside
    test shows gaps, or as soon as provenance requires the accuracy fields. That's likely, given
    ADR 0008. The building ticket decides.
- Whichever path: the socket and file-writing code must not live inside a React component, and the
  location task must be defined at module scope ("must be called at module scope, not inside a
  React component" — Expo TaskManager docs), because a relaunch has no mounted UI.

---

## 7. Android, noted, not designed (map decision 5)

Stated from Android developer docs unless marked:

- **Foreground service**, type `location` (`android:foregroundServiceType="location"`,
  `FOREGROUND_SERVICE_LOCATION` plus `FOREGROUND_SERVICE` permissions), with a persistent
  notification. Location permission is subject to while-in-use restrictions: "you cannot create a
  `location` foreground service while your app is in the background, unless you've been granted
  `ACCESS_BACKGROUND_LOCATION`." So start it from the foreground, which is the same rule as iOS.
  The `connectedDevice` type ("Interactions with external devices that require a… network
  connection") could also be declared for the router link. Play Console requires declaring FGS types.
  ([FGS types](https://developer.android.com/develop/background-work/services/fgs/service-types))
- **UDP broadcast/multicast** needs `WifiManager.MulticastLock`: "Normally the Wifi stack filters out
  packets not explicitly addressed to this device… Processing these extra packets can cause a
  noticeable battery drain." It needs `CHANGE_WIFI_MULTICAST_STATE`.
  ([MulticastLock](https://developer.android.com/reference/android/net/wifi/WifiManager.MulticastLock))
  TCP avoids this on Android too.
- `expo-location` already ships Android background location via a foreground service, and its
  `next` API adds `ensureBackgroundSessionStarted` (stated: CHANGELOG 58.0.14–58.0.16).
- **Inferred: nothing above forecloses Android** if the platform-neutral layers (decoding, frame
  storage format, the recording/segment model, the reconnect state machine) stay in TypeScript. The
  per-platform part is limited to "keep the process alive + own the socket + append to disk". A
  native module would need a Kotlin twin. On Android, a no-internet Wi-Fi may need
  `ConnectivityManager` network binding for the socket. That's unresearched; flagged only.

---

## 8. What a dockside or spring test must verify

All of these can run at the dock with the YDNR on shore power, or with a laptop emulating the router
on a no-internet AP. They don't need a bus capture.

1. Screen locked for 4+ h: does the TCP feed keep arriving with no gaps longer than the router's
   send interval? (The core inference in §1.)
2. A phone call mid-recording, the camera recording 2 min of video, and Low Power Mode toggled on.
   Do the fix and frame streams continue?
3. Leave the phone stationary for 30+ min (postponement). Do updates continue with
   `pausesLocationUpdatesAutomatically = false`?
4. Wi-Fi with no internet plus a remembered internet Wi-Fi in range: does iOS stay on the YDNR?
5. The Local Network alert appears on the foreground "Connect to boat" step. Deny it and check the
   UI message. Revoke it mid-recording and check the gap is recorded.
6. Force-quit and jetsam (`kill` from Xcode): how much data was on disk, and does the
   next launch resume or close the recording correctly?
7. Battery and thermal log, per the §4 protocol.
8. Whether a When-In-Use + `CLBackgroundActivitySession` app is relaunched after a system kill
   (the WWDC23-vs-docs conflict in §5).

## Sources

Apple (developer.apple.com, read 2026-11-09):
[Handling location updates in the background](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background) ·
[allowsBackgroundLocationUpdates](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates) ·
[showsBackgroundLocationIndicator](https://developer.apple.com/documentation/corelocation/cllocationmanager/showsbackgroundlocationindicator) ·
[pausesLocationUpdatesAutomatically](https://developer.apple.com/documentation/corelocation/cllocationmanager/pauseslocationupdatesautomatically) ·
[activityType](https://developer.apple.com/documentation/corelocation/cllocationmanager/activitytype) /
[CLActivityType.otherNavigation](https://developer.apple.com/documentation/corelocation/clactivitytype/othernavigation) ·
[desiredAccuracy](https://developer.apple.com/documentation/corelocation/cllocationmanager/desiredaccuracy) ·
[distanceFilter](https://developer.apple.com/documentation/corelocation/cllocationmanager/distancefilter) ·
[kCLLocationAccuracyBestForNavigation](https://developer.apple.com/documentation/corelocation/kcllocationaccuracybestfornavigation) ·
[startMonitoringSignificantLocationChanges()](https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoringsignificantlocationchanges()) ·
[allowDeferredLocationUpdates](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowdeferredlocationupdates(untiltraveled:timeout:)) ·
[CLBackgroundActivitySession](https://developer.apple.com/documentation/corelocation/clbackgroundactivitysession-3mzv3) ·
[CLServiceSession](https://developer.apple.com/documentation/corelocation/clservicesession-pt7n) ·
[Requesting authorization to use location services](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services) ·
[Getting the current location of a device](https://developer.apple.com/documentation/corelocation/getting-the-current-location-of-a-device) ·
[Configuring background execution modes](https://developer.apple.com/documentation/xcode/configuring-background-execution-modes) ·
[About the background execution sequence](https://developer.apple.com/documentation/uikit/about-the-background-execution-sequence) ·
[isLowPowerModeEnabled](https://developer.apple.com/documentation/foundation/processinfo/islowpowermodeenabled) ·
[Jetsam event reports](https://developer.apple.com/documentation/xcode/identifying-high-memory-use-with-jetsam-event-reports) ·
[TN3179 Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy) ·
[NSLocalNetworkUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription) ·
[NSBonjourServices](https://developer.apple.com/documentation/bundleresources/information-property-list/nsbonjourservices) ·
[multicast entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.multicast) ·
[TN2277 Networking and Multitasking (archive)](https://developer.apple.com/library/archive/technotes/tn2277/_index.html) ·
[Location and Maps Programming Guide (archive)](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/LocationAwarenessPG/CoreLocation/CoreLocation.html) ·
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (2.4.2, 2.5.4, 5.1.1, 5.1.5) ·
[5.1.1 purpose strings](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-purpose-strings) ·
[WWDC23 10180 Discover streamlined location updates](https://developer.apple.com/videos/play/wwdc2023/10180/) ·
[WWDC24 10212 What's new in location authorization](https://developer.apple.com/videos/play/wwdc2024/10212/) ·
[DTS: iOS Background Execution Limits](https://developer.apple.com/forums/thread/685525) ·
[Support 101604 Low Power Mode](https://support.apple.com/en-us/101604) ·
[Support 118431 temperature](https://support.apple.com/en-us/118431).

Expo: [expo-location docs](https://docs.expo.dev/versions/latest/sdk/location/) ·
[expo-task-manager docs](https://docs.expo.dev/versions/latest/sdk/task-manager/) · source at
`github.com/expo/expo` `main`: `packages/expo-location/ios/TaskConsumers/EXLocationTaskConsumer.m`,
`ios/LocationModule.swift`, `ios/EXLocation.m`, `ios/next/LocationUpdatesHandle/LocationUpdatesTaskConsumer.swift`,
`ios/next/Position/PositionUpdatesLiveSource.swift`, `ios/next/Profile.swift`, `plugin/src/withLocation.ts`,
`CHANGELOG.md`; `packages/expo-task-manager/ios/EXTaskManager/EXTaskService.m`.

Android: [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) ·
[WifiManager.MulticastLock](https://developer.android.com/reference/android/net/wifi/WifiManager.MulticastLock).

Yacht Devices: YDNR-02 user manual, `https://www.yachtd.com/downloads/ydnr02.pdf` (text extracted
from the PDF; the server/TCP/UDP/port statements are quoted from it).
