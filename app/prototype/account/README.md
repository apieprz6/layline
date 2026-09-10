# Prototype — the drawer's account block and the one-button Auth Sheet (LAY-119)

**Throwaway.** Nothing here is production code, nobody is signed in, and no button does
anything: "Continue with Google" closes the sheet. Delete the folder once the questions
below are answered; the branch keeps it.

## Verdict — Variant A won, on both surfaces (2026-09-10)

The owner picked **A** whole: the account block at the top of the bordered footer with
`v1.0 · May 2026` demoted to a hairline beneath it, and **A's sheet** — edge-anchored,
sized to its contents, ~250px rather than ADR 0004's 82%.

Two decisions ride along with that choice, both taken deliberately:

- **The double sign-in affordance stays.** A draws the block's "Sign in" *and* ADR 0016's
  inline link on each locked row, and that is endorsed rather than tolerated. ADR 0016 needs
  no amendment.
- **ADR 0004's 82% height no longer describes what will be built.** Nothing was amended here;
  the debt is recorded on LAY-119 and LAY-53 for whoever writes the build ticket.

B and C stay in this folder as the primary source: they are the record of what A was chosen
*against*, and the losing sheet treatments in particular are the argument for A's height.

Nothing was folded into `main`, because there is no account UI in `main` to fold into — no
`AuthSheet`, no Account resolution, no `/auth/callback`. The spec is the deliverable; the
build comes out of LAY-53 via `/to-tickets`.

### Second pass — the refused stranger (2026-09-10, after the verdict)

LAY-119 was widened again once LAY-120 saw Supabase's actual error, so the refusal
graduated from "what this prototype cannot show" into this folder. It is drawn on **A only**,
because A had already won: `RefusalA.tsx`, switched with `?refused=`. Three landings and the
cancel path, all sharing one copy block so the *landing* is the only variable. See
"Where the refusal lands", below. Nothing about the winning block or sheet changed.

Run it:

```bash
npm run dev
# http://localhost:4000/prototype/account?variant=A&account=guest
# ...&variant=B&account=nameless    (the null Display Name case)
# ...&variant=C&account=owner&sheet=1   (the Auth Sheet, open)
# ...&variant=A&refused=callback    (the refused stranger; also sheet, toast, cancel)
```

All four knobs live in the URL, so any screen can be shared exactly as seen. `variant` is
`A`, `B` or `C`; `account` is `guest`, `owner` (admin, short name), `crew` (a deliberately
long name and long address) or `nameless` (`display_name` is null); `sheet=1` opens the Auth
Sheet, so a sheet can be linked rather than described; `refused` is `callback`, `sheet`,
`toast` or `cancel` (A only). The floating bar switches variants (arrow buttons, or ← / →),
switches account state, switches refusal landing, and hides the drawer so the page behind can
be seen. It starts bottom-centre — which is where a bottom sheet, a toast and the dock all
live — so **drag it by its handle** to get it off whatever it is covering, `▼` to collapse it
to a pill, double-click the handle to re-centre. The position is in memory only; a reload
re-centres it. The whole bar disappears in production builds.

The drawer opens on load, because the drawer is the artifact. The real `RaceHeader` and the
real `LiveWindCard` are behind it on purpose — a drawer judged against a blank page always
looks fine.

## The question

**Two surfaces, one conversation about what signing in looks like.**

1. **The account block in the drawer**, signed out and signed in. ADR 0016 settled the five
   entries and the inline "Sign in" on a locked row, then explicitly declined this block and
   left it to LAY-53 "in the drawer's existing bordered footer region".
2. **The Auth Sheet**, now that ADR 0020 left exactly one button on it. ADR 0004 specified an
   82%-viewport bottom sheet, sized for an email field, a password field, Forgot password and
   a Sign up tab, none of which exist. A sheet that tall holding one button is not something
   anyone would draw on purpose.

## What it should settle

1. **Does the account block replace the footer, sit above it, or leave it?** A keeps
   `v1.0 · May 2026` as a hairline beneath the block; B moves the account to the top and
   leaves the footer exactly as it is; C keeps the footer as the account's home and gives it
   a filled button.
2. **Two "Sign in"s in one 268px column — does that read as redundant, and if so what
   gives?** Each variant answers differently, on purpose:
   - **A** keeps both, at full strength, so the problem is visible rather than argued about.
   - **B** drops the *block's* offer: the padlocked rows are the only door, because the offer
     belongs to the thing being offered (ADR 0016's own reasoning).
   - **C** drops the *rows'* offer: padlock only, no inline link, and one loud filled button
     in the footer, because a padlock already says "there is a door".
3. **What appears when `display_name` is null.** Nothing may be synthesised from the email
   address (AGENTS.md; ADR 0020). `initialsOf()` in `fixture.ts` returns `null` rather than a
   letter, and each variant then differs: A shows a silhouette and puts the address on the
   name line with "Google account" beneath; B shows the address in mono with "No name from
   Google" beneath; C shows the address in the row with the Role chip beside it. Flip to
   `account=nameless` in every variant — this is the case nothing has designed.
4. **Where Sign out lives.** A: a muted text link on the block's own row. B: a sixth drawer
   entry below a divider, where every other action lives. C: nowhere in the drawer — the
   account row is a *destination*, tapping it goes to Settings and Sign out is there. (In C,
   use the harness to get back to Guest; there is no drawer Sign out to press.)
5. **What the sheet should be, now it holds one button.** A: edge-anchored and sized to its
   contents — the honest minimum. B: ADR 0004's 82% kept and *made to earn it*, by saying
   what an account is for before offering the button, with the button in the thumb zone. C:
   not a sheet at all — a floating card sitting low on the screen with the app visible around
   all four sides. **Picking B is the only answer that needs no ADR amendment; picking A or C
   amends ADR 0004 a fourth time**, which the ticket says is fine if the drawing justifies it.
6. **Whether the Role belongs in the drawer.** Only C shows it (`admin` / `viewer` chip). A
   and B leave it out entirely. ADR 0019 makes Role govern writes only, so a viewer who never
   sees the word may never wonder why a button is missing — or may wonder harder.

## How the three variants disagree

| | **A — Footer, second line** | **B — Identity band on top** | **C — One loud door** |
|---|---|---|---|
| Position | The footer is what the account block is *for* | Identity is not a footnote; it sits under the app header, above the nav | Offer signing in once, loudly, and make the account a destination |
| Block location | Top of the bordered footer | A labelled band between header and nav | Bordered footer, above the version line |
| Version line | Demoted to a hairline under the block | Untouched, alone in the footer as today | Under the block |
| Signed-out affordance | Right-aligned "Sign in" text link (same as the locked rows) | **None** — the locked rows are the only door | Full-width filled **Sign in** button |
| Locked rows | Padlock **+** inline "Sign in" (ADR 0016 as written) | Padlock + inline "Sign in" | Padlock only, **mute** |
| Signed-in block | Avatar, name, second line, Sign out link | Uppercase "Signed in" label, square avatar, name over address | Tappable row: avatar, name, Role chip, chevron → Settings |
| Sign out | Text link on the block | Sixth drawer row, below a divider | Not in the drawer — in Settings |
| Null `display_name` | Silhouette; address on the name line, "Google account" beneath | Silhouette; address in mono, "No name from Google" beneath | Silhouette; address in the row, Role chip beside it |
| Role shown | No | No | Yes, as a chip |
| Sheet | Edge-anchored, content-height (~250px) | ADR 0004's 82%, earning it with two named sections | Floating card, low on the screen, ~200px |

## The arithmetic at 390px

`--drawer-width` is a fixed 268px and the drawer is full viewport height, so on a 390×844
screen the column is 268×844. Against that, by arithmetic (not measurement — there is no
browser here):

- App header block: ~62px.
- Five entries at ~48px plus two dividers at ~17px plus 20px padding: ~294px.
- A's footer: ~80px. C's footer: ~85px signed out, ~90px signed in.
- B's band: ~70px, plus a sixth Sign out row (~65px with its divider) when signed in: ~135px.

So the worst case (B, signed in) is roughly 490px of 844 — the account block does not put the
drawer near overflow in any variant. **Width, not height, is the constraint**: after 32px
padding, a 32px avatar and a 10px gap, the name line has ~194px, which is why the `crew`
state carries a 26-character name and a 40-character address. Check that state in all three.

## Where the refusal lands

The observed error, refusing an unknown Google account with sign-up off, in both the query
string and the fragment:

```
?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance
```

It arrives at **`/auth/callback`**, not in the sheet, so *where it is shown* is a choice.
Three landings, one shared copy block (`RefusalCopy`), so the landing is the only variable:

| `?refused=` | Where it lands | Costs | Argument against |
|---|---|---|---|
| `callback` | The callback route renders it, full screen, no drawer and no dashboard | Nothing — it is where the error already is | The sailor is on a bare route, away from the screen they started on, and needs an explicit way back ("Back to the weather") |
| `sheet` | Back on the screen they left, sheet reopened, the copy replacing its body, Google button demoted to a retry | A round trip: the callback must redirect *and* carry the reason through state | Most machinery of the three, for a state most sailors see once |
| `toast` | Back on the screen they left, sheet closed, a dismissible banner low on the screen | A round trip, same as above | Missable, and dismissible before it is read — for the sheet's *only* failure mode, that is the whole objection |

The copy is the same in all three, and it is the sailor's, not Supabase's:

> **You are not on the crew list yet**
> Layline accounts are made by the boat's owner. Ask them to add the Google address you just
> used, then sign in again.

Two deliberate choices in it. It **does not name the address**, because the error carries no
email and claiming to know which account was refused would be inventing it. And it is drawn
**calm, not alarmed** — one `--state-warning` mark, no red card — because nothing the sailor
did was wrong and nothing is broken.

`?refused=cancel` is the second non-success path: Google returns the same `error=access_denied`
when someone taps Cancel on the consent screen. **It draws nothing**, on purpose, and that is
what to look at — a sailor who merely changed their mind must not be told they have no account.
The dashed strip **inside the harness bar** shows what the URL carried next to what the sailor
is shown, because keying on `error_code` rather than `error` is invisible in a screenshot. It
sits in the bar rather than on the screen so it is never mistaken for UI and never covers the
drawing. Supabase's own string appears nowhere in the drawings.

## Layout of the folder

- `fixture.ts` — the four account states, and `initialsOf()`, the one bit worth lifting: it
  returns `null` for a null Display Name and never falls back to the email.
- `shared.tsx` — only what all three must agree on: ADR 0016's five entries in their fixed
  order with the two dividers, the padlock, the dim, and the Google button (Google dictates
  its look, so it does not vary). The drawer chrome and the sheet shell are **not** shared —
  they are the thing being judged.
- `VariantA.tsx`, `VariantB.tsx`, `VariantC.tsx` — the three positions. Each draws its own
  drawer and its own sheet.
- `RefusalA.tsx` — the refused stranger, on the winning variant only: one copy block, three
  landings, the cancel path that draws nothing, and the harness strip.
- `PrototypeAccount.tsx`, `page.tsx` — URL wiring inside the real chrome.

The production `HamburgerMenu` is untouched, and so is every ADR: nothing here has been
folded into `main`.

## What this prototype cannot show

- **Which landing is right.** The refusal is drawn three ways and that choice is the owner's;
  nothing here settles it.
- **Anything about the OAuth round-trip.** The button closes the sheet. There is no browser in
  the agent environment, so **no screen here has been looked at by anyone** — all three
  variants and all three sheets were confirmed only by fetching the route and reading the
  served HTML, which says the markup exists and nothing about how it looks. Judge the drawings
  in a real browser at 390px.
- **The boat routes.** `/boat` and `/boat/performance` do not exist; the locked rows are
  drawn, not linked.
