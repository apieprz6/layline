# ADR 0020: Google Is the Only Door

## Status

Accepted

## Context

ADR 0019 closed sign-up: the owner creates crew accounts by hand in Supabase. LAY-118 then asked the
question that follows from it — **how does an account the owner made by hand get its first session?**
Nobody can sign themselves in to an account whose password they were never given.

Three routes were on the table: the owner sets a password and passes it out of band, Supabase's
"Invite user" mails a link the sailor redeems, or the sailor signs in with Google and no password ever
exists. Two of the three need an email to arrive. That turned out to be the whole decision.

### Supabase cannot email the crew, and no amount of configuration changes that

Without custom SMTP, Supabase Auth refuses to deliver to any address that is not part of the project's
team. The gate is `GOTRUE_EXTERNAL_EMAIL_AUTHORIZED_ADDRESSES` →
`checkEmailAddressAuthorization` (`internal/api/mail.go:733-748`), enforced at `mail.go:773-776`
*inside the shared* `sendEmail` — so invites, signup confirmations, password recovery, magic links and
reauthentication OTPs all fail together, with 400 `email_address_not_authorized`. `+label` addresses
are normalised away, so they are not a way round it. The field is **absent from the Management API**
(235 update properties, none matching `authorized*`), so it cannot be widened for a project at any
price. The built-in sender is also capped at 2 emails/hour and documented by Supabase as "not meant
for production".

So reaching a crew member means custom SMTP (30/hour). And every provider gates *arbitrary
recipients* behind proving control of a sending domain via DNS — their free shared senders reproduce
the identical restriction: `resend.dev` mails only the account holder, and Mailgun's and SES's
sandboxes are authorized-recipients-only. **Emailing a crew member therefore requires owning a
domain**, which this project does not: nothing in the repo names one and the app is served from a
`vercel.app` subdomain whose DNS is not ours.

The consequence for the corpus is worth stating on its own: ADR 0019's Forgot password — after
sign-up closed, the *only* self-service door left — could not deliver to anyone but the owner.

### An unsendable invite could still have been hand-delivered

`admin.generateLink` returns the link in the API response and never calls `sendEmail`, so the owner
could mint an invite and paste it into the text thread they already have with that crew member. That
route needs no domain and no SMTP, and it satisfies what the owner actually asked for — that they
never see anyone else's password. It was the strongest alternative and is recorded below.

### A closed door does not block Google

`DisableSignup` appears in five non-configuration places, and neither `adminUserCreate` nor `Invite`
contains the string at all. On the OAuth path the check sits *inside* `case models.CreateAccount:`
(`internal/api/external.go:342-345`), and the hook path early-returns for every non-create decision
(`internal/api/hooks.go:91-98`). A hand-created email account produces `LinkAccount`
(`internal/models/linking.go:207`, and again at `:148-159`), which reaches no gate. So **crew can
link a Google identity while sign-up is closed**, and a stranger with no row gets 422
`signup_disabled`.

### The population

The owner and a handful of crew, over the life of one boat, all known personally, all of whom have a
Google account they use on a phone. That is what makes a single-provider door a door rather than a
wall.

Full findings, with citations against GoTrue v2.197.0: `docs/research/lay-118-admin-provisioning.md`
on branch `research/lay-118-admin-provisioning`, building on
`docs/research/lay-115-supabase-auth-flows.md` on `research/lay-115-supabase-auth-flows`.

## Decision

### Google OAuth is the only way in

The **Auth Sheet** has **one** mode: Continue with Google. There is no password field, no Forgot
password, and no email field at all.

An account is created by hand in Supabase against the crew member's **Google** address, with
Studio's "Auto confirm user?" left checked — it is checked by default, maps to `email_confirm`, and
sets `email_confirmed_at` via `user.Confirm` (`internal/api/admin.go:566`). The sailor then taps
Continue with Google and is in. No password is handed over, chosen, or recovered, and the owner never
holds a credential belonging to someone else.

### The email provider is turned off, because omitting a field removes nothing

Studio's "Create new user" modal requires a password, so every hand-made row carries a **dormant
password**. The anon key ships to the browser, so anyone can call `signInWithPassword` against the
REST API without ever touching the sheet: a credential with no UI is still a credential.

So the email provider is disabled: `enable_signup = false` under **`[auth.email]`**
(`supabase/config.toml:216`), plus the matching dashboard toggle. That makes `signInWithPassword`
return 422 `email_provider_disabled` regardless of what any row holds. The LAY-118 research flagged
line 216 as a trap precisely because disabling it also kills `/recover`; under this decision that is
not a trap but the point.

**The trap is worse than the research phrased it.** It called line 216 `external_email_enabled`,
which is GoTrue's env var name — no such key exists in `config.toml`. What is actually there is a
second key **spelled identically to ADR 0019's**: `enable_signup` at line 171 under `[auth]` closes
sign-up, and `enable_signup` at line 216 under `[auth.email]` governs whether the email provider
exists at all. Same name, different section, opposite consequences if confused, and `[auth.sms]`
carries a third copy at line 254. Anyone editing this file must check which section they are in.

One thing here is **not verified and may not be asserted**: that `admin.createUser` still works with
the email provider disabled. Admin creation does not consult the provider gate in the paths read, but
no live project was available to confirm it. LAY-120 confirms it, with a fallback of leaving the
provider enabled and creating every account through the admin API with a long random password.

### Nothing recovers a lost Google account

There is no recovery flow, because there is no credential to recover. A crew member who loses access
to their Google account loses the Layline account with it: the owner deletes the row and creates a new
one, and that **Profile**'s `display_name` and `preferences` go with it. For a `viewer` whose Profile
holds preferences, that is an acceptable loss; it is written down so it is not discovered.

## Consequences

- **This deletes most of what the account map was carrying.** No password field, no Forgot password
  mode, no `/auth/confirm` route, no `/auth/reset-password` page, no set-password page, no custom
  SMTP, no domain purchase. `/auth/callback` is the only auth route — which returns the count to the
  single route ADR 0004 originally named, by a path it did not anticipate.
- **ADR 0004 is amended a third time.** It specified email+password *and* Google OAuth; the sheet is
  now Google alone. ADR 0019 had already cut the Sign up mode and widened the viewer grant.
- **ADR 0019's regret becomes the design.** "A locked-out crew member has no self-service door" was
  written there as an unwelcome side effect. It is now deliberate: there is nothing to be locked out
  of, and the owner is the only route back.
- **LAY-115's central hazard is gone, not mitigated.** An unconfirmed email account that signs in with
  Google has its password nulled and its other identities destroyed
  (`internal/api/external.go:411`, `if hasEmails && !user.IsConfirmed()`). With no password anywhere,
  there is nothing for it to destroy. Its other constraint — that expired and already-used links are
  indistinguishable — no longer applies to anything, since no link is ever sent. **The rest of that
  research still stands** and is still the reference for `/auth/callback`.
- **`enable_confirmations` stops mattering.** Its one live effect was widening same-email linking to
  *unverified* provider emails (`email.Verified || config.Mailer.Autoconfirm`), and Google verifies
  its own addresses. Auto-confirm at creation is what does the work here, per account, and the
  project-level setting is consulted nowhere in `adminUserCreate`. If a second provider is ever added,
  this reverts to a live question.
- **The Profile trigger's only source of a display name is now Google.** ADR 0017's trigger reads
  `raw_user_meta_data`; per LAY-115 it should prefer `->>'name'` with `->>'full_name'` as fallback,
  and there is no longer any path where the owner types a name instead. A Google account without the
  `profile` scope granted yields no name, which per AGENTS.md is stored as missing rather than
  synthesised from the address.
- **No auth path is verifiable without a browser**, and this environment has none. The mitigation is
  a boundary, not a workaround: the **Account** resolution in `app/(app)/layout.tsx` and the Profile
  trigger are tested against a programmatically created session on local Supabase, which needs
  neither a browser nor Google. What stays untested is the OAuth round-trip itself, which is
  Supabase's code rather than ours. No agent may report a sign-in as working.
- **The sheet's visual design is now a real question and is not answered here.** An 82%-viewport
  bottom sheet holding one button is not a thing anyone would draw on purpose. What this ADR settles
  is that there is one mode; what that looks like goes to LAY-119, alongside the drawer's account
  block, since both are the same conversation about what signing in looks like.
- **The copy for a refused stranger is now the primary error state**, not an edge case: it is the only
  way the sheet can fail. Nobody has seen the error yet, so LAY-120 still has to record it.
- **`CONTEXT.md` changes**: **Auth Sheet** drops to one mode; **Account Merging** is rewritten, since
  with no password path there is no second identity to merge and the same-email machinery now serves
  provisioning rather than merging; the stale relationship line naming `/auth/reset-password` as the
  only dedicated auth route becomes `/auth/callback`.
- **A domain and custom SMTP leave this map's scope.** Should Layline ever want transactional email
  for something other than auth, that is a fresh effort with its own reasoning.

## Alternatives considered

- **The owner sets a password and passes it out of band.** Rejected on the owner's own instinct, and
  it survives scrutiny: the owner already reads every table and can reset any account, so knowing a
  password grants them nothing — but a password the sailor did not choose and cannot change makes
  "change my password" load-bearing, and nothing about that was specified. It also walks straight into
  the `RemoveUnconfirmedIdentities` hazard the moment auto-confirm is unchecked.
- **Supabase's "Invite user", emailed.** Rejected: it cannot be delivered. Also creates an
  unconfirmed row immediately with `invited_at` and a random 64-char password, expires in **1 hour**,
  has no per-user cooldown, is silently invalidated by a resend, and `resend()` rejects `'invite'`
  outright — a poor fit for a link a sailor reads the next morning even if SMTP existed.
- **An invite link minted with `admin.generateLink` and texted.** The strongest alternative: no domain,
  no SMTP, no delivery risk, and the sailor sets their own password. Rejected because it keeps the
  entire password subsystem — a set-password page, `/auth/confirm`, Forgot password, and eventually
  SMTP and a domain anyway the first time someone forgets — in order to serve a crew member who, by
  the owner's own account, does not exist. It remains the route to reach for if a non-Google sailor
  ever appears.
- **An allowlist plus a reopened Sign up mode**, gated by a `before_user_created` hook. Rejected for
  the reason ADR 0019 gave a day earlier — it builds a mechanism to manage a list that the Supabase
  user table already is — and it would have put a third mode back on the sheet.
- **Leaving the email provider enabled** and relying on long random dormant passwords. Rejected: it
  makes the boundary "the owner remembered to generate a random string every time", which is the shape
  of hole that stays open for years. Kept only as the fallback if disabling the provider turns out to
  block admin creation.
- **An invite is not magic link, so scope was not the objection.** For the record, since the map rules
  passwordless out of scope: invite and magic link share `/verify` but split into `signupVerify` versus
  `recoverVerify` against different token columns — service-role one-shot versus public repeatable. An
  invite would not have reopened passwordless sign-in. It was rejected on cost, not on scope.
