# Connecting Claude to Layline

Add Layline to Claude once, and you can ask it about the conditions and the boat's Races in plain
words: "what's the wind doing right now?", "how did we sail on Saturday?". Claude answers from
what Layline's own screens show, with the same caveats beside each number.

You need a Layline crew account, which is the Google address the owner added for you. Without one,
Google sign-in is refused here just as it is in the app.

## Add the connector

The connector URL is your Layline address followed by `/api/mcp`. For example:

```
https://<your-layline-address>/api/mcp
```

**Claude (web, desktop or mobile app)**

1. Open **Settings → Connectors** and choose **Add custom connector**.
2. Name it `Layline`, paste the connector URL, and choose **Add**.
3. Choose **Connect**. A Layline page opens.
4. Choose **Continue with Google** and sign in with your crew Google account.
5. Layline asks **"Connect Claude to Layline?"** Choose **Allow**. You are sent back to Claude.

On a Team or Enterprise plan, an organisation owner may need to add the connector first.

**Claude Code**

```
claude mcp add --transport http layline https://<your-layline-address>/api/mcp
```

Then run `/mcp` inside Claude Code, pick `layline`, and choose **Authenticate**. Steps 4 and 5
above happen in your browser.

## What Claude can see

- **Read only.** The connector cannot upload, amend or delete anything. Uploading a Race and
  editing Boat Setup stay in the app.
- **As you.** Claude reads what your own account can read in Layline, and nothing more.
- **Current Conditions and Buoy History.** Harrison Dever Crib (CHII2) and the Purdue Buoy, as the
  dashboard shows them now, and as a station's page shows them over its last 30 minutes to 72
  hours: every reading, and the page's Stats panel.
- **Races.** The archive's list of Races, and one Race's summary as its page states it: the Boat
  Setup it was sailed under, the sail changes and sea state you recorded, how much of it was
  recorded, its tacks and gybes, and its Polar and VMG efficiency. Claude is given figures, never
  the recording's rows.
- More tools (forecasts, Polar performance, sail selection) are on the way.

## Reading the answers

- **CHII2's wind is measured 85 ft up.** Claude is given the reading as reported, with the
  dashboard's note that wind at that height typically reads 20–30% higher than at the surface. It
  should say so rather than pass the 85 ft figure off as surface wind.
- **The Purdue Buoy is seasonal, May through October.** Out of season Claude will say it is out of
  the water, not that its reading is missing.
- **Every reading has an age.** Claude is told each station's status (online, recent, stale,
  offline) and how old the reading is. If it isn't fresh, expect Claude to say so.
- **The Stats are Layline's, not the station's.** Mean direction, mean speed, range and veer/back
  spread are worked out from the readings exactly as the station page's Stats panel does, and
  Claude is told they are derived.
- **A Race's coverage is time.** Claude is told how much of the race was recorded and how much
  of it any figure reads, and should say when a Race is thinly recorded.
- **Some efficiency is filler-anchored.** Where a figure partly compares the boat against a cell
  the Polar made up rather than measured, Claude is given that share and should state it beside
  the figure, as the race page does.
- **A Race with no title has none.** Claude should call it by its day, not invent a name.
- **Sails and sea state are what you wrote down.** Where nobody recorded them for a Race, Claude is
  told they were not recorded, which is not the same as nothing changing.

## Disconnecting

Remove the connector in Claude's **Settings → Connectors** (or `claude mcp remove layline`). To cut
off access on Layline's side as well, ask the owner, who can revoke it from Supabase.
