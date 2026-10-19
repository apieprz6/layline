# PROTOTYPE — LAY-191: Connect Claude on Settings

Throwaway. Lives only on `prototype/lay-191-connect-claude`; never merge it.

**Question:** what should the Settings section that tells crew how to connect Claude to the
MCP Server look like?

Three variants on the real `/settings` route, below Theme:

| `?variant=` | Name | Shape |
| --- | --- | --- |
| `A` | Inline section, client tabs | A second Theme-style section: URL field + Copy, a Claude app / Claude Code segmented control, numbered steps, "Try asking", connected apps. All visible. |
| `B` | One row, opens a sheet with steps | Settings gets a single "Connect Claude" row (with "1 app connected"). It opens a bottom sheet that walks three steps, one primary button each. Claude Code is a footnote. |
| `C` | Questions first, steps folded | A card that leads with example questions as chat bubbles, then a tap-to-copy URL bar. Per-client steps, "What Claude can see" and connected apps are `<details>` folds. |

`?auth=out` shows the signed-out state. The pill on the right of the switcher toggles it.

Run: `npx next build && npx next start -p 4391`, then open `http://127.0.0.1:4391/settings?variant=A`.
(`next dev` doesn't hydrate in this environment.) `←` / `→` cycle variants.

Stubbed: sign-in (an alert, not the auth sheet), the connected-apps list and Revoke (LAY-192),
which are fixtures. The URL is the page's own origin + `MCP_PATH`, the same as
`requestOrigin` would give.

**Verdict (2026-10-19): B**, revised. Step 2 is "Add it to your app" with three cards, one
open at a time: **Claude** (web, desktop and phone, open by default), **ChatGPT** (Developer
mode → Create → OAuth), and **Using another app?** (any remote-MCP client + the Claude Code
command). The Claude Code footnote is gone; step 3 says "your app", not "Claude".

To check before shipping: ChatGPT's menu names (Apps & Connectors, Developer mode, Create) and
plan requirement drift often, so confirm them against ChatGPT on the day. Whether ChatGPT,
Claude Code (localhost redirect) and VS Code (custom scheme) all complete Supabase's dynamic
registration has not been tried against the hosted app.
