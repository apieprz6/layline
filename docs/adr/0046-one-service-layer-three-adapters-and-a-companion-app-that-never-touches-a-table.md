# ADR 0046: One Service Layer, Three Adapters, and a Companion App That Never Touches a Table

## Status

Accepted. Resolves LAY-203, on the map *iOS companion app* (LAY-196).

**Amends ADR 0042** in two places. The token check behind `/api/mcp` becomes a shared one with a
door per token kind, and the answer functions behind its tools move out of `services/mcp/` so that a
second client can call them. Every ruling of 0042 about what the **MCP Server** answers stands.

Leaves ADR 0018 (the server owns the account) and ADR 0024 (a Server Action, not a route) standing
for the web. Leaves ADR 0020 (Google is the only door) standing, and records what a public release
would cost it.

## Context

The **Companion App** (the native iOS client, LAY-196 decision 2) signs in, shows **Current
Conditions** and records a race. It can call nothing the web is built from:

- **Reads** happen in Server Components, which call services in-process. The dashboard calls
  `fetchCHII2()` and `fetchPurdueBuoy()` directly and renders their results.
- **Writes** go through Server Actions, which only a Next.js page can invoke.
- **The session** is a cookie (ADR 0018), refreshed by middleware.

What already exists for an outside client doesn't fit as it stands:

- `app/api/weather/route.ts` returns mock data for a San Francisco buoy.
- `app/api/weather/buoys/live` returns raw `BuoyDataResult[]`. A client would have to re-derive
  everything the card decides about them (the CHII2 elevation note, staleness, classification),
  which would be a second copy of the card's rules.
- `/api/mcp` already answers screen-shaped questions with provenance, including `current_conditions`
  (`services/mcp/current-conditions.ts`). But `lib/mcp/auth.ts` refuses any token without a
  `client_id` claim. That is by design: only a **Connected App**'s token opens it, and a first-party
  session has no `client_id`.

There is also a constraint the web never meets. A request body to a Vercel function is capped at
about 4.5 MB, and a multi-hour phone recording's **Streams** (ADR 0044) are larger than that, so a
Stream upload can't pass through a Next route.

The owner asked whether the long-term answer is a standard HTTP API with the web rebuilt on top of
it. It isn't, because that would make the web slower. A Server Component fetching its own route pays
a second function invocation, a second auth check and, on a cold start, two waits. A web UI fetching
from the browser loses streaming server rendering and waits on requests after its JavaScript loads,
which is worst on a phone browser at the dock. Next's own guidance warns against both.

## Decision

### The service layer is the API, and every client is an adapter over it

Each use case is one function, `(client, input) → Answer`. The input and output are zod schemas.
Three adapters call it:

| Client | Adapter | Transport | Session |
|---|---|---|---|
| Web | Server Components and Server Actions | in-process | cookie (ADR 0018) |
| **Companion App** | **App API** routes, `/api/app/v1/*` | HTTP | bearer, first-party session |
| Claude and others | `/api/mcp` tools | MCP over HTTP | bearer, connector |

**An adapter holds no rule.** It parses its input, calls the function and returns the result, with
nothing in between. A test fails if an App API route or an MCP tool does anything else. This is ADR
0042's "a tool inherits every rule and owns none", extended to every adapter.

**The web doesn't change.** It keeps Server Components, Server Actions and cookies. Nothing is
rebuilt, so nothing gets slower.

**The answer functions move to `services/answers/`.** What `services/mcp/` holds today
(`current-conditions.ts`, `races.ts`, `sail-selection.ts` and the rest) is the start of that layer.
It moves to a home that no single adapter owns, and the MCP Server imports it from there like
everyone else.

**No framework.** oRPC and similar tools define a procedure once and serve it both in-process and
over HTTP, with OpenAPI. Plain functions with zod do the same job without a dependency or a new
pattern, and an adapter is about ten lines.

### One bearer check, and the door chooses the token

`lib/mcp/auth.ts` becomes `lib/auth/bearer.ts`. Every bearer door:

1. Verifies the JWT locally with `getClaims`, against the project's keys.
2. Requires a **Profile** (an **Account** is an email plus a Profile).
3. Builds a Supabase client that carries the caller's own token, so row-level security decides what
   it reads. The service role never answers a caller.

Each door then takes exactly one kind of token:

- **`/api/mcp` takes only connector tokens**, which carry `client_id`. This is unchanged from ADR 0042.
- **The App API takes only first-party session tokens**, which carry no `client_id`. A read-only
  Connected App can never reach a route that writes.

A first-party session token taken from a browser would also open the App API. That gives nobody
anything new: it's the same Account, reading under the same RLS.

**Revocation takes up to an hour.** It works as LAY-192 accepted for Connected Apps. A removed
Account or a signed-out phone keeps its access token until it expires. The fix, if ever needed, is
the same one ADR 0042 names: enforce it at the door.

### Sign-in: Google, through the native SDK, with the nonce required

The Companion App signs in with `@react-native-google-signin`, taking the ID token it returns to
`supabase.auth.signInWithIdToken({ provider: 'google', token, nonce })`. The owner chose this over
the system-browser OAuth flow because it feels smoother. It costs an iOS OAuth client in Google
Cloud, added to the Supabase Google provider's authorized client IDs.

**The nonce is required.** Supabase's "Skip nonce checks" switch on the Google provider stays off,
because it would let a captured ID token be replayed within its lifetime. If the SDK can't pass a
nonce through, that comes back to the owner rather than the switch being flipped.

The session is kept in the Keychain (`expo-secure-store`), and supabase-js refreshes it. A **Refused
Stranger** is refused by Supabase exactly as on the web (`signup_disabled`), because the closed front
door (ADR 0019) is the project's setting, not the client's.

### Sign in with Apple is deferred, and its cost is written down

App Review guideline 4.8 expects an app with third-party login to also offer an equivalent
privacy-preserving option, in practice Sign in with Apple. Supabase supports it natively
(`expo-apple-authentication`, then `signInWithIdToken` with `provider: 'apple'`, using the bundle ID
as the client ID). But while accounts are made by hand against Google addresses, it would let nobody
in who couldn't already get in through Google:

- Automatic **Identity Linking** needs matching emails. An Apple ID on a different address, or "Hide
  My Email", would be refused as a stranger.
- The only way round that is manual linking (`linkIdentity`), which means signing in with Google
  first.

So for this map the Companion App is **Google-only**. If Beta App Review objects to that for external
TestFlight testers, the crew is added as **internal testers** instead, which skips review. A public
release reopens who can have an account at all (more boats, an onboarding flow), and Sign in with
Apple belongs to that redesign.

### A Guest sees Current Conditions, and everything else needs an Account

The Companion App mirrors the web's tiers, not the MCP Server's. Current Conditions is served to a
**Guest**, and every other App API route requires an Account. That matches ADR 0015's Guest and App
Review guideline 5.1.1(v), which discourages forcing sign-in before features that don't need an
account.

ADR 0042's "one door, no Guest" was about a standing grant to an outside system, and it stays true
for the MCP Server.

### The app talks to Supabase directly for exactly two things

- **Auth.** It can't avoid it: the session is Supabase's.
- **Uploading Streams.** These use Supabase Storage's resumable (TUS) upload, straight to the `boat`
  bucket, gated by the bucket's existing policy: an admin writes, a signed-in Account reads. This
  avoids Vercel's body limit and survives a weak signal on the water.

**The app never touches a table.** Every row read or written goes through an App API route, so the
rules for a row live in one place.

### Only an admin records

The recorder requires `role = 'admin'`, the same as uploading a **Race** today. A `viewer`'s phone
shows Current Conditions and nothing that writes. The storage policy above already enforces this for
the Streams, and the App API's recorder routes check it for rows, as the upload action does. Letting
any crew phone record would change what a **Role** means (ADR 0017), and that is left to the same
redesign as more boats.

### The recorder's routes

The recorder needs three steps:

1. **Create.** An App API route creates a **Recording** and returns the storage prefix its Streams go
   under.
2. **Upload.** The app uploads each Stream file directly to that prefix (above).
3. **Finish.** An App API route checks what landed against what the app says it sent, then queues the
   job that builds the **Decoded Series** and **Facts** (ADR 0044).

Two questions are left to their own tickets on the LAY-196 map: how a Race comes into being from the
phone (a start/stop button or the **Race Window**, and creating a Race versus attaching to one), and
offline storage and resuming a partial upload. Their answers decide these routes' inputs, not their
shape.

### The contract is zod, versioned, and only ever added to

- **Schemas** live in `types/contract/`, one file per Answer, with the TypeScript types inferred from
  them. Both the route and the app parse with them. When LAY-204 decides on `packages/domain`, they
  move there as a unit.
- **The App API is versioned by path**, starting at `/api/app/v1/`. Within a version, fields are only
  ever added, never renamed, retyped or removed. A Jest contract test checks each v1 response against
  a fixture of its earlier shape.
- **Old builds are told to update.** The app sends its build number in a header. Below a minimum the
  server answers **426 Upgrade Required**, and the app says "Update Layline in TestFlight" rather
  than failing on a shape it doesn't know.

The reason is that a compile error no longer catches a break. A TestFlight build installed weeks ago
keeps talking to whatever the server is today.

## Consequences

- **`/api/weather/*` is left alone.** The Companion App doesn't use it. The mock root route can be
  deleted on its own ticket.
- **The first App API route is `GET /api/app/v1/current-conditions`**, built on the same Answer as
  the `current_conditions` MCP tool. Its figures must equal the dashboard's, as the MCP tool's
  already must.
- **An App API response is a published contract**, like an MCP tool's output (ADR 0042). Renaming a
  field breaks installed phones, not a build, so it needs a new version.
- **Guest Current Conditions adds NDBC traffic only through the existing cache**, so the free-tier
  budget is unaffected.
- **A public release costs:** Sign in with Apple, the account model it implies, and Beta or full App
  Review against guidelines 4.8 and 5.1.1. None of these is precluded by the decisions above.

## Rejected alternatives

- **Rebuilding the web on the HTTP API.** One shape for every client, but slower for the web (see
  Context) and a rewrite of every screen for nothing a sailor would notice.
- **The system-browser OAuth flow** (`signInWithOAuth` in `ASWebAuthenticationSession`). It needs no
  extra Google client and is the same flow as the web, but the owner preferred the native sheet.
- **Letting the app read tables directly under RLS.** It's fewer routes, but RLS decides who may see
  a row, not what it means. Every rule the screens apply would have to be repeated in the app.
- **Uploading Streams through a Next route.** Vercel's body limit rules it out, and it would put a
  multi-hour transfer inside a function's timeout.
- **Reusing `/api/mcp` for the app.** It would mean one door with two token kinds, MCP as an app's
  transport, and no Guest tier. The adapters are cheap, so each client gets its own.
- **oRPC or tRPC.** See *No framework*, above.
