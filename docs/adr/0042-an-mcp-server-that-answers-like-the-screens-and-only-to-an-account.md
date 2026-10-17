# ADR 0042: An MCP Server That Answers Like the Screens, and Only to an Account

## Status

Accepted. Settles the shape of the **Layline MCP Server** project (LAY-181 to LAY-187) before any of
it is built, so that the tickets running in parallel build one surface rather than seven.

Amends nothing. **Deliberately departs from the Guest tier** (see *Every tool requires an Account*,
below): the app shows weather to a **Guest**, and the MCP server does not.

**Amended after LAY-182 shipped**, with *A tool inherits every rule and owns none*, below. "The same
function the screen uses" was the intent from the start, but nothing said what to do when the rule a
tool needs lives in a component, or what a parity test compares against. The amendment settles both
before LAY-183 to LAY-187 are built.

## Context

Crew access is coming, and the crew will ask Claude about the boat. They will ask it what the wind is
doing, how the last Race went and whether the sails they set agreed with the **Crossover Chart**.
Claude answers whatever it is handed with confidence. If what it is handed is not what the screens
show, the crew gets a second, confidently different Layline.

Most of what an MCP server needs is already in place:

- **The figures are pure functions.** ADR 0029 moved every aggregation into code that runs on both
  sides of the wire. A tool can call exactly what a screen calls.
- **The reads are separate from the rules.** `readArchive` reads, scores and ships, and
  `matchable-rows.ts` holds every rule about a row with no database in it (ADR 0026).
- **The read tiers are already settled.** ADR 0019 gives every signed-in **Account** the same reads,
  enforced by row-level security, and a **Role** governs writes alone.

One thing is missing. Every read builds its Supabase client from the request's cookies, and an MCP
client sends a bearer token instead.

## Decision

### A remote, stateless endpoint on the app that already exists

The server is a route on the Next.js app on Vercel, speaking MCP's **Streamable HTTP** transport,
statelessly. Each tool call is one short request: read, aggregate, respond. That fits inside Vercel
Hobby's 300 s function limit with room to spare, and needs no store between requests.

### Every tool requires an Account, weather included

Sign-in uses **Supabase Auth's OAuth 2.1 server** (dynamic client registration, PKCE), with a consent
screen in Layline that goes through the Google door and nowhere else (ADR 0020). Accounts are still
made by hand (ADR 0019), so someone with no **Account** is refused at Google exactly as a **Refused
Stranger** is in the app.

The endpoint answers an unauthenticated request with a 401 and its protected-resource metadata, and
lists no tools to it. Every tool then reads through a Supabase client built from the caller's own
token, so row-level security decides what an MCP read sees, exactly as it does for a screen. The
service role is never used to answer a tool.

This is stricter than the app, where a **Guest** reads all the weather. The owner chose it: a
connector is a standing grant to an outside system, not a visitor glancing at the lake, and one door
with one rule is simpler to reason about than a server whose tool list changes with who is asking.

### Read-only

No tool writes. Uploading a **Race**, amending one and writing **Boat Setup** stay behind the app's
upload quality gates (ADR 0009) and the `admin` **Role** (ADR 0019), which an MCP client would
otherwise have to reimplement.

### Answers, not rows

Each **MCP Tool** is shaped like a screen or a card and returns what that screen states. It never
returns **Recording Rows**. The archive is roughly 4,000 in-window rows, which is too many to hand to a
model, and a model that aggregates rows itself is a second implementation of ADR 0025, 0026 and 0036
that nobody tests.

Every figure is computed by the **same function the screen uses**, and each tool's tests hold its
figures equal to the screen's for the same Race, filter or cell. That equality is the contract, and
the next section says how it is kept.

### A tool inherits every rule and owns none

When a rule changes, a tool should change with it without anyone touching the MCP server. So
`services/mcp` only shapes output. It calls the code the screen calls, renames fields for a model,
and attaches provenance the screen's own code supplies. It holds no aggregation, no classification,
no cut-point, no threshold and no arithmetic on a figure. That includes small derivations such as
minutes since an observation.

- **A rule that lives in a component moves out first.** If the answer a tool needs is worked out in a
  `.tsx` file, such as the Instrument Tuning teaser's worst-verdict pick or a card's headline, the
  tool's ticket extracts it into `services/` and has the component call the extracted function. Only
  then does the tool call it too. A tool never re-derives what a component computes.
- **Arguments are built from the screen's own definitions.** The Analysis Filter argument's
  dimensions and buckets come from `analysisDimensions()` and the screen's registry, not from a list
  in the tool. A new bucket or a moved boundary then reaches the tool unaided.
- **Parity tests compare against the screen's own code, not a literal.** A test runs the screen's own
  data path and the tool over one fixture and asserts they agree. A literal-pinned figure fails on
  every intended change to a rule, and still passes when the tool holds its own copy of one, which is
  the opposite of what it is for. Literals stay where they already are, in the suites that pin the
  archive's counts.
- **What a tool states is a deliberate choice, not an inherited one.** A new figure on a screen does
  not appear in a tool by itself, because a tool's output is a contract (see *Consequences*). A tool's
  description is prose and is updated by hand when a screen's caveats change.

### Provenance travels with every figure

What the screens print beside a number travels with it in the tool's output:

- **CHII2** readings carry the 85 ft elevation and the note that surface wind is typically 20-30%
  lower. The reading itself is never adjusted (ADR 0008).
- Every weather figure carries its **Data Status**, **Staleness**, and **Model Run Time** or
  observation time. Nulls stay null.
- Every archive figure carries its **Coverage Ledger**, in time and never in rows (ADR 0037), and its
  **Filler-Anchored** share, flagged and not withheld (ADR 0036).
- A failed read is an error, never an answer over a short archive (ADR 0026's all-or-nothing rule).

A tool's description tells Claude what the screen's own copy tells a sailor. **Cell Agreement** is
something to look at, not a verdict on the chart (ADR 0030). The `STW` verdict says whether to
recalibrate, never by how much (ADR 0041).

### The Analysis Filter is one argument, declared per tool

Tools that narrow the archive take the **Analysis Filter** as one shared argument, defined once
(LAY-185) and built from the screen's own dimension definitions. Each tool offers the dimensions its
screen offers: five on Polar performance, five on the **Sail Selection Screen**, and two on the
**Instrument Tuning Screen**. Buckets are named by the screen's own bucket ids, and **Not recorded**
is on by default, as it is in the UI (ADR 0029). An unknown dimension or bucket is refused with the
valid values, never silently ignored.

## Consequences

- **The reads take their client from the caller** (LAY-181). The cookie client stays the default,
  so no screen changes.
- **A tool's output is a published contract.** Once the crew have connected Claude, renaming a field
  or a tool breaks their conversations rather than a build, so changing either needs the same care as
  a URL.
- **It fits the free tiers.** Supabase's OAuth server has no separate charge, and its users count
  toward the Free plan's 50,000 MAU. Vercel Hobby is for personal, non-commercial use, which a crew
  is; offering this to other boats for money would not be.
- **Answered (LAY-182): the OAuth server is in beta, and the Free plan includes it.** Supabase's
  getting-started guide for it says "OAuth 2.1 server is in beta and available on all Supabase
  plans. It has no separate charge." Beta means its API can still move under us; the consent
  screen (`app/oauth/consent`) and the token check (`lib/mcp/auth.ts`) are the two places that
  would feel it.
- **Only a connector's token opens the endpoint.** Supabase stamps a `client_id` claim on every
  token its OAuth server issues, and a browser session has none, so `lib/mcp/auth.ts` refuses a
  token without one. A Profile is required too, checked at the consent screen, where an account
  with none is denied before a code exists, and again at the endpoint.

## Rejected alternatives

- **A local stdio server holding a personal token.** Quickest to build, but it reaches the owner
  alone, and crew access is the reason for doing this at all.
- **Weather tools open to a Guest.** It would mirror the app's tiers, and the owner chose one door
  instead (above).
- **The SSE transport.** In Vercel's adapter it needs Redis and holds connections open, which buys
  nothing for a tool that answers in one request.
- **Exposing Recording Rows, or a query tool over them.** Every figure Claude produced from rows
  would be a reimplementation of the scoring rules that no screen agrees with and no test checks.
- **Write tools.** They would have to reimplement the upload gates and the `admin` check, and a model
  amending a Race is writing **Testimony** that nobody aboard gave.
