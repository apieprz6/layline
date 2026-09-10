# Prototype — the drawer's account block and the one-button Auth Sheet (LAY-119)

**Throwaway.** Nothing here is production code, nobody is signed in, and no button does
anything: "Continue with Google" closes the sheet. Delete the folder once the questions
below are answered; the branch keeps it.

Run it:

```bash
npm run dev
# http://localhost:4000/prototype/account?variant=A&account=guest
# ...&variant=B&account=nameless    (the null Display Name case)
# ...&variant=C&account=owner&sheet=1   (the Auth Sheet, open)
```

All three knobs live in the URL, so any screen can be shared exactly as seen. `variant` is
`A`, `B` or `C`; `account` is `guest`, `owner` (admin, short name), `crew` (a deliberately
long name and long address) or `nameless` (`display_name` is null); `sheet=1` opens the Auth
Sheet, so a sheet can be linked rather than described. The floating bottom bar
switches variants (arrow buttons, or ← / →), switches account state, and hides the drawer
so the page behind can be seen. It disappears in production builds.

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

## Layout of the folder

- `fixture.ts` — the four account states, and `initialsOf()`, the one bit worth lifting: it
  returns `null` for a null Display Name and never falls back to the email.
- `shared.tsx` — only what all three must agree on: ADR 0016's five entries in their fixed
  order with the two dividers, the padlock, the dim, and the Google button (Google dictates
  its look, so it does not vary). The drawer chrome and the sheet shell are **not** shared —
  they are the thing being judged.
- `VariantA.tsx`, `VariantB.tsx`, `VariantC.tsx` — the three positions. Each draws its own
  drawer and its own sheet.
- `PrototypeAccount.tsx`, `page.tsx` — URL wiring inside the real chrome.

The production `HamburgerMenu` is untouched, and so is every ADR: nothing here has been
folded into `main`.

## What this prototype cannot show

- **The sheet's failure state.** ADR 0020 left "a stranger is refused" as the sheet's only
  way to fail, and nobody has seen Supabase's error yet (expected 422 `signup_disabled`), so
  no variant writes that copy. LAY-120 records it first, and it lands on whichever sheet wins.
- **Anything about the OAuth round-trip.** The button closes the sheet. There is no browser in
  the agent environment, so **no screen here has been looked at by anyone** — all three
  variants and all three sheets were confirmed only by fetching the route and reading the
  served HTML, which says the markup exists and nothing about how it looks. Judge the drawings
  in a real browser at 390px.
- **The boat routes.** `/boat` and `/boat/performance` do not exist; the locked rows are
  drawn, not linked.
