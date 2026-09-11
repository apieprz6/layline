# ADR 0021: A Sheet Sized to Its Contents, and a Callback That Renders

## Status

Accepted

## Context

ADR 0020 left the **Auth Sheet** holding a single "Continue with Google" button and declined to draw it,
handing the look to LAY-119 alongside the drawer's account block on the grounds that both are the same
conversation about what signing in looks like. LAY-119 then drew three account blocks and three sheets on
`prototype/lay-119-account-block`, and the owner picked one whole. LAY-120 meanwhile observed the one way
the sheet can fail, so the refusal graduated into the same prototype and was drawn three more ways.

This ADR records what those drawings settled. The pixels stay in `app/prototype/account/`, which is the
primary source; what is written down here is what has alternatives worth remembering.

### The 82% was never ADR 0004's

The corpus has been saying "ADR 0004's 82%-viewport sheet" — ADR 0020's own consequences say it, and so
did LAY-53's inherited-ground notes. **ADR 0004 specifies no height at all.** `height:82%` sits on the
sheet `div` in `mockups/Login-mockup.html`, and reached ADR 0004 by reference: LAY-53 inherits the
sheet's design "from ADR 0004 and `mockups/Login-mockup.html`", and over three amendments the mockup's
number was absorbed into the ADR's authority.

It matters twice. What the decision below supersedes is a *drawing*, not a decision. And ADR 0004 turns
out to carry three amendments its own file never mentions — only the ADR 0016 mount-point move is
annotated inline (`0004:39`) — which is how a mockup's arithmetic outlived the four fields it was drawn
for.

### The refusal arrives at a route, not in the sheet

LAY-120 refused an unknown Google account against the hosted project with sign-up off and observed:

```
?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance
```

duplicated in the query string **and** the fragment. Two things follow. The sailor leaves the sheet for
Google and comes back to `/auth/callback`, so "in the sheet with a message" is not where the refusal
lands — it is a round trip to put it back there. And `access_denied` is the generic OAuth 2.0 code that
Google *also* returns when someone taps Cancel on the consent screen, so there are **two** non-success
paths distinguished only by `error_code`.

## Decision

### The sheet is sized to its contents

An edge-anchored bottom sheet, full width, `16px 16px 0 0`, holding: a grab handle, a `--text-xl`
display heading "Sign in", one line of body copy — *"Layline accounts are made by the boat's owner."* —
the Google button, and safe-area padding. Roughly **250px** on a 390×844 screen, against the mockup's
82% (~692px). `mockups/Login-mockup.html`'s `height:82%` is superseded.

The *pattern* is untouched and stays ADR 0004's: a bottom sheet, mounted in the app layout per ADR 0016,
opening over whatever screen the sailor is on.

The sheet has **no state**: no modes, no fields, no validation, and — per the next section — no error
region. One button is one button, and a sheet with nothing to get wrong should not be built to hold a
mistake.

### The refusal is shown on `/auth/callback`, rendered full screen

Where it already arrives. The route renders the whole screen — the wordmark, a `--state-warning` mark,
the copy, and a filled **Back to the weather** — with no drawer and no dashboard behind it. Nothing is
carried back through state: the sheet is not reopened and no toast is raised.

The copy is the sailor's situation, not Supabase's:

> **You are not on the crew list yet**
>
> Layline accounts are made by the boat's owner. Ask them to add the Google address you just used, then
> sign in again.

It **names no address**, because the error carries none. Nothing on that URL says who was refused, so
naming an account would mean inventing one — the same rule AGENTS.md applies to a missing wind reading.

**So `/auth/callback` stops being a pure redirect handler and becomes a route that renders**, and it
branches on `error_code` before it redirects:

| On the URL | What happens |
|---|---|
| `error_code=signup_disabled` | The refusal screen above |
| `error=access_denied`, no `error_code` | **Nothing at all** — straight back where they were, no message |
| `?code=` | Exchanged for a session and redirected on, per LAY-115 |
| any other error | The same screen shell with a generic "Sign-in didn't finish" and a retry; the code goes to the log, not the screen |

The silent case is the point of keying on `error_code` rather than `error`. A sailor who changed their
mind must not be told they have no account, and `error` alone cannot tell the two apart.

### Supabase's string is never shown, and is not discarded either

"Signups not allowed for this instance" is developer language about a Supabase instance, addressed to a
sailor who was invited by name. It arrives on the URL and belongs in the log; the sailor reads the
sentence above instead. This is AGENTS.md's rule applied to an error string: record what the source
said, interpret it separately, overwrite nothing.

### The drawer offers "Sign in" twice, deliberately

ADR 0016 put a padlock and an inline "Sign in" on each **Locked Entry** row, then left the account block
to LAY-53 and named the obvious risk: two sign-in affordances in one 268px column. Both stand.

The account block takes the top of the drawer's bordered footer and demotes `v1.0 · May 2026` to a
hairline beneath it. Signed out it reads *Browsing as guest* over *Weather is open to everyone*, with a
right-aligned "Sign in". Signed in it shows initials, the **Display Name** over the address, and a muted
"Sign out" on the block's own row. The **Role** is not shown in the drawer at all — ADR 0019 made it
govern writes only, so it has nothing to tell a reader.

The two offers answer different questions — *what is behind this padlock* versus *who am I right now* —
and a sailor who never taps a boat row would otherwise find no door. **ADR 0016 therefore needs no
amendment.**

### A null Display Name shows the address and a silhouette, never a letter from it

ADR 0020 left Google's `name` claim as the only source of a **Display Name**, so a grant without the
`profile` scope yields none. Then the *email* takes the name line, "Google account" goes beneath it, and
a silhouette stands where the initials would be.

No initial is taken from the address. `initialsOf()` on the prototype branch returns `null` rather than a
letter, which is the shape the real helper should keep: a Display Name is never synthesised, and neither
is one character of one.

## Consequences

- **ADR 0004 is amended a fourth time**, and most of its Decision no longer describes what will be
  built. Dead, with what replaced it: the three sheet modes and both auth methods (`0004:17`, `0004:19-26`
  — ADR 0019 cut Sign up, ADR 0020 cut the password half); `display_name` populated from a sign-up form
  (`0004:29` — Google only, and nullable); the role model `'admin' | 'user' | null` (`0004:32` — ADR 0017
  made it `admin | viewer`, never null); `/auth/reset-password` as a standalone page (`0004:35` — gone,
  `/auth/callback` is the only auth route); and "account merging enabled for same-email identities"
  (`0004:21` — LAY-115 found no such setting exists, and it is **Identity Linking** now). What survives:
  the sheet *pattern*, and that auth is additive rather than gate-keeping. ADR 0004's Status line now
  points here rather than leaving a reader to reconstruct that list.
- **`mockups/Login-mockup.html` no longer describes the sheet.** Its `height:82%` is superseded, and it
  draws an email field, a password field and a Sign up tab that ADRs 0019 and 0020 deleted. It stays as
  a record of what was drawn, not as a specification.
- **The build gets a `page.tsx` at `/auth/callback`, not a `route.ts`.** A Route Handler can exchange
  `?code=` but cannot render a screen, and this route now has to do both. Server-side is enough: LAY-120
  saw the error parameters in the query string as well as the fragment, so **no client-side fragment
  reader is needed** — do not build one.
- **Whoever builds the Auth Sheet must not give it an error prop.** Its only failure mode is shown on
  another route, and an unused error region is how a 250px sheet grows back to 692.
- **ADR 0015 and ADR 0016 stand unamended.** The inline invitation, the five-entry order, the padlocks
  coming off on sign-in — all untouched. The account block fills the footer region ADR 0016 reserved for
  it.
- **`CONTEXT.md` changes**: the **Auth Sheet** entry gains its size and its lack of an error state; the
  **Locked Entry** entry records that the account block offers sign-in a second time on purpose; a new
  **Refused Stranger** entry names the screen so it is not called an error page; and the relationship
  line for `/auth/callback` says it renders as well as redirects.
- **Nothing here has been looked at in a browser**, because the agent environment has none. Every screen
  was confirmed by fetching the prototype route and reading the served HTML, which says the markup exists
  and nothing about how it looks. Whether the ~250px sheet reads as generous or as an afterthought at
  390px is the owner's to judge, and the same goes for the refusal screen.
- **The rest of the block's specification stays LAY-53's**, which slices the build. This ADR records the
  calls that had alternatives; the paddings, weights and tokens are on the prototype branch.
- **A refusal is now a screen a stranger can reach**, which is a first for this app: every other surface
  is either open to a **Guest** or padlocked. It has no navigation, so its only exit is the button on it.

## Alternatives considered

- **Keep the mockup's 82% and make it earn the height** — the prototype's sheet B, which filled the space
  by naming what an account is for (Boat management, Boat performance) above the button, in the thumb
  zone. Rejected: it pads a one-button sheet with copy nobody asked for, to preserve a number chosen for
  four fields. Its real appeal was that it alone superseded nothing, which is an argument about paperwork
  rather than about the sheet.
- **A floating card instead of a sheet** — the prototype's sheet C, low on the screen with the app visible
  on all four sides. Genuinely nice, and rejected: it introduces a second overlay pattern for exactly one
  surface, and ADR 0004's sheet pattern is used elsewhere.
- **Reopen the sheet with the reason in it** — the strongest of the three landings, because the refusal
  then answers the button that caused it. Rejected on cost: a redirect *plus* a reason carried through
  state, for a state a sailor meets once, and it puts an error region back on a sheet that otherwise has
  no state at all. This is the one to reach for if the callback screen turns out to feel like a dead end.
- **A toast on the screen they came from.** Rejected: missable, and dismissible before it is read. For
  the sheet's *only* failure mode, that is disqualifying.
- **Show Supabase's `error_description`.** Rejected — see above. Its own text is about an instance, not
  about a sailor.
- **Name the refused address in the copy.** Rejected: the error carries no email, so this needs the
  address stashed before the redirect. Worth building only if a crew member ever actually confuses which
  Google account they used.
- **Key off `error` and treat every non-success the same.** Rejected: it tells someone who tapped Cancel
  that they are not on the crew list.
- **Drop the account block's "Sign in" and let the padlocked rows be the only door** (prototype variant
  B), on ADR 0016's own reasoning that the offer belongs to the thing being offered. Rejected: a sailor
  who never taps a boat row then has no way in, and the block would have to say "Browsing as guest" while
  offering nothing.
- **Mute the locked rows to a padlock alone and put one loud button in the footer** (prototype variant C).
  Rejected: ADR 0015 forbids a dead end, and a padlock with no tap target on the row is the closest thing
  to one.
- **Show the Role in the drawer as a chip** (also variant C). Rejected: ADR 0019 made Role govern writes
  only, so the word answers no question a reader of the drawer has. A `viewer` who wonders why a button is
  missing is a boat-screen problem, and belongs there.
- **A first initial from the email address when there is no Display Name.** Rejected outright: AGENTS.md
  forbids synthesising a value a source did not give, and one letter is not an exception.
