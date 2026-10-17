# Connecting Claude to Layline

Add Layline to Claude once, and you can ask it about the conditions in plain words: "what's the
wind doing right now?", "is the Purdue buoy out?". Claude answers from what Layline's own screens
show, with the same caveats beside each number.

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
- **Today: Current Conditions and Buoy History.** Harrison Dever Crib (CHII2) and the Purdue Buoy,
  as the dashboard shows them now, and as a station's page shows them over its last 30 minutes to
  72 hours: every reading, and the page's Stats panel. More tools (Races, Polar performance) are on
  the way.

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

## Disconnecting

Remove the connector in Claude's **Settings → Connectors** (or `claude mcp remove layline`). To cut
off access on Layline's side as well, ask the owner, who can revoke it from Supabase.
