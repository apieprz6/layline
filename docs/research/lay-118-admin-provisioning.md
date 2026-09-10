# LAY-118 — How a hand-created Supabase account gets its first session

Research notes for LAY-118, reframed by
[ADR 0019](../adr/0019-a-closed-front-door-and-a-role-the-account-cannot-write.md): sign-up is closed,
so the question is no longer "does sign-up confirm by email" but *how the owner's hand-created crew
accounts first get in*. Builds on
[LAY-115](https://linear.app/layline-sailing/issue/LAY-115) — read
`git show research/lay-115-supabase-auth-flows:docs/research/lay-115-supabase-auth-flows.md` first;
nothing it established is re-derived here.

**Documentation and source reading only.** No browser, no production build, no access to the hosted
Supabase project — nothing below was executed. Claims trace to the `supabase/auth` (GoTrue) source at
tag **v2.197.0**, the `@supabase/auth-js` copy installed in this repo, the Supabase docs, the
Supabase Studio source, the Management API OpenAPI document, and the `supabase/cli` config mapping.
Anything not traceable is labelled **UNVERIFIED**.

## Versions this was checked against

| Thing | Version | How known |
| --- | --- | --- |
| `supabase/auth` (GoTrue) | **v2.197.0** — `git clone --depth 1`, `git describe --tags` | all `internal/...` citations below are at this tag |
| `@supabase/auth-js` | 2.104.1 | `node_modules/@supabase/auth-js/package.json` (repo root, not the worktree) |
| `@supabase/ssr` | 0.10.2 | `node_modules/@supabase/ssr/package.json` |
| `supabase` CLI (devDep) | ^2.98.0 | `package.json` |
| Management API spec | fetched `https://api.supabase.com/api/v1-json` on 2026-09-10 | `AuthConfigResponse_Output` has 238 properties |
| Supabase Studio | `master` via `gh api repos/supabase/supabase/contents/...` | dashboard UI claims |

## Which docs I trusted, and why

LAY-115 already recorded that the two vendored dumps (`docs/references/supabase-ssr-llms.txt`,
`docs/references/nextjs16-llms.txt`) cover none of this. That holds again: neither mentions
`createUser`, `inviteUserByEmail`, `generateLink`, custom SMTP, or `disable_signup`. Three further
notes specific to this ticket:

1. **The GoTrue README's env-var list is not the hosted surface.** The recipient allow-list that
   decides question 1 is `GOTRUE_EXTERNAL_EMAIL_AUTHORIZED_ADDRESSES`
   (`internal/conf/configuration.go:106`), and it is **absent from the Management API**, so it is
   platform-set and not project-configurable. Reading the README alone would suggest you can turn it
   off. You cannot.
2. **Blog folklore says `disable_signup` breaks admin creation.** It does not. The guard exists in
   exactly five non-config places and none of them is on an admin route (§2).
3. **LAY-115 left the hosted `mailer_otp_exp` default UNVERIFIED.** It is now documented: **1 hour**
   ([users](https://supabase.com/docs/guides/auth/users) — "Invitation links expire after the
   duration configured in Email OTP Expiration, which defaults to 1 hour"). Same value for magic
   links, invites and every other email confirmation link. That supersedes the LAY-115 row.

---

## 1. Built-in email deliverability — the decisive constraint

### 1.1 (a) Recipients are restricted to the organization's members

Verbatim, [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp):

> Unless you configure a custom SMTP server for your project, Supabase Auth will refuse to deliver
> messages to addresses that are not part of the project's team.

with the worked example on the same page: if the organization has `person-a@example.com`,
`person-b@example.com`, `person-c@example.com`, "Supabase Auth will only send messages to these
addresses", and "All other addresses will fail with the error message *Email address not
authorized.*" Membership is managed "in the Team tab of the organization's settings".

The changelog entry dated 2024-09-18 announces it:

> From 2024-09-26, Supabase Auth's default email provider sends only to organization members.

**Scope — new vs. all projects: UNVERIFIED.** The auth-smtp page states the rule unconditionally in
the present tense with no grandfathering clause; the changelog gives a forward date. Neither says
whether pre-2024-09-26 projects were exempted. Treat it as applying.

**The mechanism, in source.** This is not a mail-vendor property, it is a GoTrue config field
Supabase populates:

`internal/conf/configuration.go:106`

```go
AuthorizedAddresses []string `json:"authorized_addresses" split_words:"true"`
```

`internal/api/mail.go:733-748`

```go
func (a *API) checkEmailAddressAuthorization(email string) bool {
	if len(a.config.External.Email.AuthorizedAddresses) > 0 {
		// allow labelled emails when authorization rules are in place
		normalized := emailLabelPattern.ReplaceAllString(email, "@")
		for _, authorizedAddress := range a.config.External.Email.AuthorizedAddresses {
			if strings.EqualFold(normalized, authorizedAddress) {
				return true
			}
		}
		return false
	}
	return true
}
```

and the gate itself, `internal/api/mail.go:773-776`:

```go
if params.emailActionType != mail.EmailChangeVerification {
	if recipientEmail != "" && !a.checkEmailAddressAuthorization(recipientEmail) {
		return apierrors.NewBadRequestError(apierrors.ErrorCodeEmailAddressNotAuthorized, "Email address %q cannot be used as it is not authorized", recipientEmail)
	}
}
```

Three consequences read straight off that code:

- The check sits in the shared `sendEmail` helper, so **every** auth email is covered — invite,
  signup confirmation, recovery, magic link, email change, reauthentication OTP, and the
  notification mails. Matching the docs, which list "Email and password accounts", "Passwordless
  accounts using one-time passwords or links sent over email (OTP, magic link, invites)",
  "Email-based user invitations", "Social login with email confirmation".
- `+label` addresses are normalised away (`[+][^@]+@` → `@`), so `owner+crew@gmail.com` does **not**
  buy you a second authorized recipient. Matching is case-insensitive.
- The check runs at `mail.go:773`, **before** the Send Email hook branch at `mail.go:816`. So on the
  GoTrue side a `send_email` hook would *also* be refused if the allow-list were still populated —
  meaning the platform must clear it when a hook or custom SMTP is configured. **UNVERIFIED which**;
  the docs' phrasing ("Unless you configure a custom SMTP server…") is the only evidence, and the
  changelog says "must configure custom SMTP or a Send Email Auth Hook".

The error, from [error codes](https://supabase.com/docs/guides/auth/debugging/error-codes):

| HTTP | `code` | Documented description |
| --- | --- | --- |
| 400 | `email_address_not_authorized` | "Email sending is not allowed for this address as your project is using the default SMTP service. Emails can only be sent to members in your Supabase organization. If you want to send emails to others, set up a custom SMTP provider." |

**And it cannot be widened from the API.** The Management API `UpdateAuthConfigBody` (235
properties) has **no** `external_email_authorized_addresses` field, and no field containing
`authorized`. The only email-adjacent knobs are `smtp_*`, `hook_send_email_enabled`,
`rate_limit_email_sent`, `mailer_*`. So there is no project-level escape hatch short of custom SMTP
or a send-email hook.

### 1.2 (b) Rate limits

| Configuration | Limit | Source |
| --- | --- | --- |
| Built-in email service | **2 messages per hour**, per project | [rate limits](https://supabase.com/docs/guides/auth/rate-limits) — "2 emails per hour with the built-in email provider. You can configure this limit when you use custom SMTP or the Send Email hook."; [auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp) — "Currently this value is set to 2 messages per hour" |
| Custom SMTP, default | **30 messages per hour**, adjustable | [auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp) — "a low rate-limit of 30 messages per hour is imposed"; matches GoTrue's own default `RateLimitEmailSent Rate \`split_words:"true" default:"30"\`` at `internal/conf/configuration.go:466` |
| Historical | 6/hour documented 2024-08-28, corrected to 2/hour 2024-09-10, effective 2024-09-03 | [going into prod](https://supabase.com/docs/guides/platform/going-into-prod) — "As of 3 Sep 2024, this has been updated to 2 emails per hour. You can only change this with your own custom SMTP setup." |
| Per-user resend floor (`smtp_max_frequency`) | **1 minute** when unset | `internal/conf/configuration.go:1211-1212` — `if config.SMTP.MaxFrequency == 0 { config.SMTP.MaxFrequency = 1 * time.Minute }`. This repo's local value is `"1s"` (`supabase/config.toml:225`) |

Note the shape of the hourly limiter: `internal/api/mail.go:794-801` — **if `rate_limit_email_sent`
is zero, every send is refused immediately**, and `mail.go:804-814` skips the limiter entirely when
`mailer_autoconfirm` is on (with a `TODO(km): Deprecate this behaviour` above it).

### 1.3 (c) Not for production

Verbatim, [auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp):

> This server imposes a few important restrictions and is not meant for production use.

> The default SMTP service is provided as best-effort only and intended for the following
> non-production use cases: Exploring and getting started with Supabase Auth · Setting up and testing
> email templates with the members of the project's team · Building toy projects, demos or any
> non-mission-critical application. **We urge all customers to set up custom SMTP server for all
> other use cases.**

Suggested providers, same page: **Resend, AWS SES, Postmark, Twilio SendGrid, ZeptoMail, Brevo.**
[Going into prod](https://supabase.com/docs/guides/platform/going-into-prod) adds: "Use your own SMTP
credentials so that you have full control over the deliverability of your transactional auth emails."

### 1.4 What this means for Layline, stated plainly

The owner's Supabase organization has one member: the owner. Crew addresses are arbitrary Gmail
accounts. Therefore, **on the built-in sender, with no custom SMTP:**

| Flow | Outcome |
| --- | --- |
| `inviteUserByEmail('crew@gmail.com')` | 400 `email_address_not_authorized`. **Invite is dead.** |
| Forgot password → `resetPasswordForEmail('crew@gmail.com')` | 400 `email_address_not_authorized`. **Forgot password is dead** — and ADR 0019 already lists it as the only self-service door a locked-out crew member has. |
| Signup confirmation email | moot; sign-up is closed |
| Reauthentication OTP (§6) | also dead, same gate |
| Owner's own address | works, 2/hour |

So the two email-dependent onboarding routes fail together, for the same reason, at the same gate.
ADR 0019's consequence "a locked-out crew member has no self-service door … a forgotten password must
go through Forgot password" is **not merely narrow — it is currently non-functional for anyone but
the owner.** Adding custom SMTP fixes both at once; nothing else fixes either.

Adding crew as organization members would also lift the gate, but that grants them project access,
which is a much larger grant than "receive one email". Not evaluated further here.

### 1.5 The one email-free escape hatch: `admin.generateLink`

`POST /admin/generate_link` (`internal/api/mail.go:52-317`, exposed as
`supabase.auth.admin.generateLink`, `node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js:275-290`)
mints the token, writes it to the user row and the one-time-token table, and **returns the link in
the JSON response**. It never calls `a.sendEmail`, so `checkEmailAddressAuthorization` is never
consulted and the hourly email limiter is never touched. Response fields
(`node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:771-797`): `action_link`, `email_otp`,
`hashed_token`, `redirect_to`, `verification_type`. Supported types: `'signup' | 'invite' |
'magiclink' | 'recovery' | 'email_change_current' | 'email_change_new'`.

That is the mechanism the docs intend for "send via a custom email provider" — but it also means the
owner can generate an invite or recovery link and hand it over by Signal/WhatsApp/in person, with no
mail server anywhere. Whether that is an acceptable design is a decision, not a fact; the fact is
that it works and is not gated by §1.1.

### 1.6 Custom SMTP free tiers, facts only

From first-party pricing/docs pages read 2026-09-10. Supabase Auth needs plain SMTP credentials
(host/port/user/pass), not an HTTP API, so SMTP support is a hard requirement.

| Provider | Free tier | Volume | Free-tier restrictions | Cheapest paid | SMTP |
| --- | --- | --- | --- | --- | --- |
| **Resend** | yes, permanent | 100/day, 3,000/month | 3 domains, 30-day data retention, ticket support; domain verification required | $20/mo (50k) | yes — `smtp.resend.com`, user `resend`, pass = API key, ports 25/465/587/2465/2587 |
| **Brevo** | **UNVERIFIED** | UNVERIFIED | UNVERIFIED — brevo.com pricing and help pages returned 403 | UNVERIFIED | UNVERIFIED |
| **Mailgun** | yes, permanent | 100/day | 1 custom sending domain, 1 inbound route, 1-day log retention, ticket support | $15/mo (10k) | yes — ports 25/465/587, SPF/DKIM/DMARC + TLS |
| **Twilio SendGrid** | **UNVERIFIED** | UNVERIFIED — pricing page redirected, not retrievable | UNVERIFIED | UNVERIFIED | yes — `smtp.sendgrid.net`:587, user literal `apikey`, pass = API key |
| **Amazon SES** | credits only (up to $200 for new AWS accounts, 6–12 months) | UNVERIFIED volume | **Sandbox mode: can only send to *verified* addresses, 200 emails/24h, 1 msg/sec, until production access is granted (typically ≤24h)** | $0.16 per 1,000 (Essentials) | yes — regional endpoints, ports 25/465/587/2465/2587, separate SMTP credentials |

Note the trap in the SES row: **sandbox SES reproduces exactly the problem being solved** — a
verified-recipients-only allow-list. It is only a fix after production access is granted. Mailgun is
not on Supabase's suggested list; the other four are.

No recommendation is made here.

---

## 2. Does `disable_signup` block admin provisioning?

### 2.1 The guard, and every place that consults it

`GOTRUE_DISABLE_SIGNUP` is declared at `internal/conf/configuration.go:484`:

```go
DisableSignup   bool                     `json:"disable_signup" split_words:"true"`
```

A grep for `DisableSignup` across all non-test Go in v2.197.0 returns exactly seven hits, of which
two are the declaration and the `/settings` echo:

| Site | Route it guards |
| --- | --- |
| `internal/api/signup.go:115-116` | `POST /signup` (public email/password sign-up) |
| `internal/api/anonymous.go:18-19` | `POST /signup` anonymous variant |
| `internal/api/external.go:343-344` | OAuth callback — **inside `case models.CreateAccount:` only** |
| `internal/api/hooks.go:94-98` | the `before_user_created` hook path — **after an early return for non-`CreateAccount` decisions** |
| `internal/api/settings.go:36,77` | reports the value on `GET /settings` |
| `internal/conf/configuration.go:484` | declaration |

**`internal/api/admin.go` does not contain the string. Neither does `internal/api/invite.go`.**
That is the whole answer to (a) and (b).

Error, when it does fire: **422 / `signup_disabled` / "Signups not allowed for this instance"**
(`internal/api/apierrors/errorcode.go:30`). Documented as "Sign ups (new account creation) are
disabled on the server."
([error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)).

### 2.2 Answers

| Path | Blocked by `disable_signup`? | Evidence |
| --- | --- | --- |
| **(a)** `admin.createUser()` / dashboard "Create new user" | **No** | `adminUserCreate` (`internal/api/admin.go:400-583`) never reads `config.DisableSignup`. Route is `POST /admin/users` under `r.Use(api.requireAdminCredentials)` (`internal/api/api.go:360,368`). |
| **(b)** `admin.inviteUserByEmail()` / dashboard "Send invitation" | **No** | `Invite` (`internal/api/invite.go:20-106`) never reads it. Route `r.With(api.requireAdminCredentials).Post("/invite", api.Invite)` (`internal/api/api.go:228`). Same for `POST /admin/generate_link` (`api.go:394`). |
| **(c)** A **new** Google user with no matching row | **Yes, refused** | `DetermineAccountLinking` returns `CreateAccount`; `external.go:342-345` refuses. Confirms ADR 0019's claim that "a stranger tapping *Continue with Google* is refused by Supabase rather than onboarded". |
| **(d)** An **existing** user signing in with Google, same email | **No — the link proceeds** | see below |

### 2.3 (d) in detail — the gate is inside one switch arm

`internal/api/external.go:318-402`, `createAccountFromExternalIdentity`:

```go
switch decision.Decision {
case models.LinkAccount:
	user = decision.User
	if identity, terr = a.createNewIdentity(tx, user, providerType, identityData); terr != nil { ... }
	...
case models.CreateAccount:
	if config.DisableSignup {
		return 0, nil, apierrors.NewUnprocessableEntityError(apierrors.ErrorCodeSignupDisabled, "Signups not allowed for this instance")
	}
	...
case models.AccountExists:
	...
```

`LinkAccount` (line 319) and `AccountExists` (line 382) reach no signup check at all. The hook path
is written the same way, `internal/api/hooks.go:91-98`:

```go
if decision.Decision != models.CreateAccount {
	return nil
}
if config.DisableSignup {
	return apierrors.NewUnprocessableEntityError(
		apierrors.ErrorCodeSignupDisabled,
		"Signups not allowed for this instance")
}
```

And a hand-created email/password account *does* produce `LinkAccount`. `DetermineAccountLinking`
(`internal/models/linking.go:63-214`) reaches it by either of two routes, and both apply here:

- `adminUserCreate` creates an `email` identity whose `identities.email` column is populated
  (`internal/api/admin.go:517-525` → `createNewIdentity` → `models.NewIdentity`,
  `internal/models/identity.go:62-64` sets `identity.Email` from `identity_data["email"]`). So the
  `email = any (?)` query at `linking.go:123` finds it, its linking domain is `"default"` (same as
  Google's), `linkingIdentities` has one member, all members share one `user_id`, and line 207
  returns `LinkAccount`.
- Even if that identity row were missing, `linking.go:148-159` returns `LinkAccount` on the strength
  of `similarUsers` alone ("no similarIdentities but a user with the same email exists").

The one precondition, `linking.go:66-69`: the Google email must be verified —
`if email.Verified || config.Mailer.Autoconfirm`. Google reports `email_verified` and GoTrue trusts
the claim (`internal/api/provider/google.go`, per LAY-115 §6.3).

**So: "Continue with Google" is not dead for crew.** A hand-created account can add a Google identity
with `enable_signup = false`. The `enable_signup` decision in ADR 0019 does what the ADR says on the
tin — it closes the door to strangers without closing it to accounts that already exist.

### 2.4 A trap in the config file that would kill sign-in, not sign-up

`supabase/config.toml` has **two** keys named `enable_signup`, and they map to different things.
From `supabase/cli`, `apps/cli-go/pkg/config/auth.go`:

| `config.toml` | Line | Management API field | GoTrue effect |
| --- | --- | --- | --- |
| `[auth] enable_signup` | 171 | `disable_signup` (**inverted**, `auth.go:416`) | the gate in §2.1 — this is the one ADR 0019 means |
| `[auth.email] enable_signup` | 216 | `external_email_enabled` (`auth.go:698`) | `config.External.Email.Enabled` |
| `[auth.email] enable_confirmations` | 221 | `mailer_autoconfirm` (**inverted**, `auth.go:700`) | LAY-115 §6.2's linking-widener |
| `[auth.email] secure_password_change` | 223 | `security_update_password_require_reauthentication` (`auth.go:703`) | §6 below |

Setting line **216** to `false` disables the email *provider*, not new email signups:

- `POST /token?grant_type=password` → 422 `email_provider_disabled` / "Email logins are disabled"
  (`internal/api/token.go:94-96`) — **crew cannot sign in with their password at all**.
- `POST /recover` is behind `requireEmailProvider` (`internal/api/api.go:256`,
  `internal/api/middleware.go:231-237`) → 400 `email_provider_disabled` — **Forgot password dies
  too**.

Both keys are still `true` in this repo (`supabase/config.toml:171,216`), consistent with ADR 0019's
note that LAY-120 owns flipping them. **LAY-120's checklist item must name line 171 specifically.**
Also note `enable_confirmations = false` at line 221 means the local stack currently runs with
`mailer_autoconfirm` **on**, which is the exact setting LAY-115 §6.2 said to leave off.

---

## 3. Admin-created users and confirmation state

### 3.1 The dashboard form

`apps/studio/components/interfaces/Auth/Users/AddUserDropdown.tsx` offers two items: **"Send
invitation"** (line 56) and **"Create new user"** (line 77).

`apps/studio/components/interfaces/Auth/Users/CreateUserModal.tsx`:

- schema (lines 33-37): `email` required, **`password` required** (`z.string().min(1, 'Password is
  required')`), `autoConfirmUser` boolean.
- a checkbox labelled **"Auto confirm user?"** (lines 136-149).
- **it defaults to checked** — `defaultValues: { email: '', password: '', autoConfirmUser: true }`
  (line 61), and the same on reset (line 49).
- static helper text under it: "A confirmation email will not be sent when creating a user via this
  form."

`apps/studio/data/auth/user-create-mutation.ts` maps it straight through:
`body: { email, password, email_confirm: user.autoConfirmUser }`.

So the dashboard form is `admin.createUser({ email, password, email_confirm })` with `email_confirm`
defaulting to `true`. The SDK docs say the same: "`createUser()` will not send a confirmation email
to the user. You can use `inviteUserByEmail()` if you want to send them an email invite instead" and
"If you are sure that the created user's email or phone number is legitimate and verified, you can
set the `email_confirm` or `phone_confirm` param to `true`"
(`node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js:313-314`).

### 3.2 What `email_confirm: true` actually writes

`internal/api/admin.go:566-569`:

```go
if params.EmailConfirm {
	if terr := user.Confirm(tx); terr != nil {
		return terr
	}
}
```

`internal/models/user.go:524-546`:

```go
func (u *User) Confirm(tx *storage.Connection) error {
	u.ConfirmationToken = ""
	now := time.Now()
	u.EmailConfirmedAt = &now
	if err := tx.UpdateOnly(u, "confirmation_token", "email_confirmed_at"); err != nil { return err }
	if err := u.UpdateUserMetaData(tx, map[string]interface{}{ "email_verified": true }); err != nil { return err }
	if err := ClearAllOneTimeTokensForUser(tx, u.ID); err != nil { return err }
	return nil
}
```

| Field | With `email_confirm: true` | Without |
| --- | --- | --- |
| `auth.users.email_confirmed_at` | set to now | **NULL** |
| `auth.users.confirmed_at` | set, **automatically** — it is a generated column: `GENERATED ALWAYS AS (LEAST(users.email_confirmed_at, users.phone_confirmed_at)) STORED` (`migrations/20210722035447_adds_confirmed_at.up.sql:4`) | NULL |
| `auth.users.confirmation_token` | `''` | `''` (never set — `adminUserCreate` sends no email) |
| `raw_user_meta_data.email_verified` | `true` | absent |
| `identities[email].identity_data.email_verified` | **`false`** — see below | `false` |
| `encrypted_password` | the supplied password; if none supplied, GoTrue generates a random 64-char one (`internal/api/admin.go:459-466`) | same |
| `invited_at` | NULL | NULL |

The identity oddity: `adminUserCreate` builds the identity from
`provider.Claims{Subject: user.ID.String(), Email: user.GetEmail()}`
(`internal/api/admin.go:519-522`) — no `EmailVerified` — and the struct tag is
`structs:"email_verified"` with **no `omitempty`** (`internal/api/provider/provider.go:110`), so the
zero value is written. `user.Confirm` never touches `identity_data`. This is inert on every path that
matters (`Identity.IsEmailVerified()` is read only by `UpdateUserEmailFromIdentities`,
`internal/models/user.go:300,341`, whose only callers are the unlink/link handlers at
`internal/api/identity.go:79,200` — and those are gated by `enable_manual_linking`, which LAY-115 §6.1
established is `false` and should stay false). Worth one line in an ADR only as a "do not turn manual
linking on and then unlink" note. `admin.updateUserById(id, { email: <same>, email_confirm: true })`
does fix it (`internal/api/admin.go:291-296`).

### 3.3 `enable_confirmations` / `mailer_autoconfirm` does not touch admin creation

`grep Autoconfirm internal/api/admin.go` returns **nothing**. The project-level "Confirm email"
setting is irrelevant to an admin-created user in both directions: with confirmations **on**, an
admin-created user with `email_confirm: false` is *not* sent a confirmation email (nothing in
`adminUserCreate` calls a mailer) and simply sits unconfirmed forever; with confirmations **off**
(`mailer_autoconfirm = true`), an admin-created user with `email_confirm: false` is *still* left
`email_confirmed_at = NULL`.

That second half is the trap. `mailer_autoconfirm` is consulted at sign-**up** (`internal/api/signup.go:227-235`) and in the linking
decision (`internal/models/linking.go:67`), not at admin-create. So "we turned Confirm email off, so
everyone is confirmed" is false for hand-created accounts.

The remedy for an already-created unconfirmed user needs no email: `admin.updateUserById(id, {
email_confirm: true })` → `internal/api/admin.go:255-259` → the same `user.Confirm`.

### 3.4 Does `email_confirm: true` escape the `RemoveUnconfirmedIdentities` hazard? **Yes.**

The guard is **not** at the top of the function. The top of the function guards only *which*
destruction happens — `internal/models/user.go:1019-1027`:

```go
// RemoveUnconfirmedIdentities removes potentially malicious unconfirmed identities from a user (if any)
func (u *User) RemoveUnconfirmedIdentities(tx *storage.Connection, identity *Identity) error {
	if identity.Provider != "email" && identity.Provider != "phone" {
		// user is unconfirmed so the password should be reset
		u.EncryptedPassword = nil
		if terr := tx.UpdateOnly(u, "encrypted_password"); terr != nil {
			return terr
		}
	}
	...
```

The rest of the body runs unconditionally: `u.UserMetaData = identity.IdentityData` then
`UpdateUserMetaData`, then `tx.Destroy` on **every** identity except the one authenticating, then
`UpdateAppMetaDataProviders` (`internal/models/user.go:1029-1050`).

The user-state guard is at the OAuth call site, `internal/api/external.go:409-418`:

```go
hasEmails := providerType != Web3Provider && (!emailOptional || decision.CandidateEmail.Email != "")

if hasEmails && !user.IsConfirmed() {
	// The user may have other unconfirmed email + password
	// combination, phone or oauth identities. These identities
	// need to be removed when a new oauth identity is being added
	// to prevent pre-account takeover attacks from happening.
	if terr = user.RemoveUnconfirmedIdentities(tx, identity); terr != nil {
```

and `IsConfirmed` is exactly one field, `internal/models/user.go:189-193`:

```go
// IsConfirmed checks if a user has already been
// registered and confirmed.
func (u *User) IsConfirmed() bool {
	return u.EmailConfirmedAt != nil
}
```

The identity list the destroy loop walks is populated: `linking.go` obtains the user via
`FindUserByID` → `findUser` → `tx.Eager()` (`internal/models/user.go:686-696,709-711`).

There are three call sites in total:

| Call site | Guard | Reachable in Layline? |
| --- | --- | --- |
| `internal/api/external.go:416` (OAuth callback) | `hasEmails && !user.IsConfirmed()` | **yes — this is the hazard** |
| `internal/api/external.go:523` (`processInvite`, accepting an invite *via* an OAuth provider) | **none — unconditional** | only if an invite link is redeemed through the OAuth flow with the invite token in state |
| `internal/api/signup.go:222` (public `POST /signup` creating a first identity) | none, but only on the create-identity branch | no — sign-up is closed |

**Exact safe/unsafe table** for a hand-created account that later taps "Continue with Google" on the
same verified address:

| User state | `email_confirmed_at` | Google sign-in outcome |
| --- | --- | --- |
| `createUser({ email, password, email_confirm: true })` — dashboard default | set | **Safe.** `IsConfirmed()` true, guard skipped, no `RemoveUnconfirmedIdentities`. Both identities coexist, password intact, `user_metadata` merged per-key not overwritten (`LinkAccount` arm, `external.go:325-327`). |
| `createUser({ email, password })` with `email_confirm` omitted/false | NULL | **Unsafe.** `EncryptedPassword = nil`, `user_metadata` replaced wholesale by Google's identity data, the `email` identity row **destroyed**, then `user.Confirm(tx)` at `external.go:424` — so the account survives as Google-only and *looks* fine. The password is gone with no error and no email. |
| Dashboard "Create new user" with "Auto confirm user?" **unticked** | NULL | same as above |
| Invited but never redeemed (`invited_at` set, no password) | NULL | Guard fires. Nothing of value is lost (no password existed), but the `email` identity is destroyed and `user.Confirm` clears `confirmation_token` and calls `ClearAllOneTimeTokensForUser` — **the pending invite link is silently voided**. |
| `updateUserById(id, { email_confirm: true })` applied after the fact | set | Safe from then on. |

The remaining rows (unverified provider email, two users sharing an address, prior-Google-then-email)
are unchanged from LAY-115 §6.3 and not restated.

**Load-bearing consequence.** ADR 0019 wrote: "LAY-115's hazard … now bites owner-created accounts
instead of self-registered ones." That is true only of accounts created **without** `email_confirm`.
The dashboard's own default is `true`, so the ordinary path is already safe — but the safety rests on
one checkbox nobody would think twice about, in a form with no warning text, with a consequence
(password silently nulled) that surfaces only weeks later when a sailor tries their password. A
decision record should state the invariant as an invariant: **every hand-created account must be
created auto-confirmed**, and the boat's operating notes should say so, because there is no
constraint in the database that enforces it and no error if you get it wrong.

---

## 4. The invite flow, end to end

`POST /invite`, service-role only (`internal/api/api.go:228`), handler `internal/api/invite.go:20-106`,
SDK `node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js:143-158` — body `{ email, data }`,
`redirectTo` sent as a query param.

### 4.1 What it creates

| Question | Answer | Source |
| --- | --- | --- |
| Row created immediately? | **Yes**, in the same transaction as the send | `invite.go:66-84` — `signupNewUser` + `createNewIdentity(EmailProvider, …)` |
| Confirmation state | **unconfirmed** — `email_confirmed_at` stays NULL; nothing calls `Confirm` | `invite.go`, and docs: "When you invite an email that doesn't yet belong to a user, a new unconfirmed user is created" ([users](https://supabase.com/docs/guides/auth/users)) |
| `invited_at` set? | **Yes**, along with `confirmation_sent_at` and `confirmation_token`, and *only after the email is accepted by the transport* | `internal/api/mail.go:383-388` — `u.InvitedAt = &now; u.ConfirmationSentAt = &now; tx.UpdateOnly(u, "confirmation_token", "confirmation_sent_at", "invited_at")` |
| Password? | **None.** `SignupParams` at `invite.go:46-51` sets no password, and the comment says so: "because params above sets no password, this method is not computationally hard so it can be used within a database transaction" | `invite.go:53-55` |
| Existing **confirmed** user at that address | 422 `email_exists` / `DuplicateEmailMsg` | `invite.go:67-70` |
| Existing **unconfirmed** user at that address | no new row; the same row is re-invited | `invite.go:42,66-84` (`isCreate` false, `isConfirmed` false → falls through to `sendInvite`) |
| Token slot | `users.confirmation_token`, one-time-token type `models.ConfirmationToken` — **shared with signup confirmation** | `internal/api/mail.go:367,390` |
| PKCE? | **No.** `sendInvite` is the only mailer that does not call `addFlowPrefixToToken`, so the token never carries the `pkce_` prefix | `internal/api/mail.go:360-396`, cf. `sendConfirmation` at `:333` and `sendMagicLink` at `:495`. Stated in the installed SDK too, `GoTrueAdminApi.js:90`: "Note that PKCE is not supported when using `inviteUserByEmail`. This is because the browser initiating the invite is often different from the browser accepting the invite which makes it difficult to provide the security guarantees required of the PKCE flow." |

That last row matters: it is the same cross-device argument LAY-115 §1.6 used to route recovery
through `verifyOtp` rather than `exchangeCodeForSession`. Invites are built on that assumption
already.

### 4.2 The email and its template

Default template, `internal/mailer/templatemailer/templatemailer.go:32-35`:

```html
<h2>You've been invited</h2>

<p>You've been invited to create an account. Follow the link below to accept.</p>
<p><a href="{{ .ConfirmationURL }}">Accept invitation</a></p>
```

Default subject: `"You've been invited"` (`templatemailer.go:128`). Variables available,
`templatemailer.go:212-219`:

| Variable | Value |
| --- | --- |
| `{{ .ConfirmationURL }}` | `<external URL>/auth/v1/verify?token=<confirmation_token>&type=invite&redirect_to=<referrer>` |
| `{{ .TokenHash }}` | `user.ConfirmationToken` verbatim — no prefix, so directly usable as `token_hash` |
| `{{ .Token }}` | the 6-digit OTP |
| `{{ .SiteURL }}`, `{{ .RedirectTo }}`, `{{ .Email }}`, `{{ .Data }}` | as for the other templates |

So the LAY-115 §4.2 `/auth/confirm` handler works unchanged for invites with:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password">Accept invitation</a>
```

`redirectTo` behaves exactly as LAY-115 §2.1 described — silent fallback. The docs restate it for
invites specifically: "The `redirectTo` URL must be in your project's allowed redirect URLs
configuration. If it isn't, the `redirectTo` value is ignored and the invite link redirects to your
Site URL instead (no error is raised)" ([users](https://supabase.com/docs/guides/auth/users)).

### 4.3 Redemption returns a full session — and GoTrue quietly sets a password

`verifyOtp({ type: 'invite', token_hash })` → `POST /verify` → `verifyPost`
(`internal/api/verify.go:227-305`). `'invite'` is in the SDK's `EmailOtpType` union
(`node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:684`). Lookup:
`FindUserByOneTimeToken(conn, params.TokenHash, models.ConfirmationToken)`
(`verify.go:653-654`), then dispatch to `signupVerify` — **the same arm as `type=signup`**
(`verify.go:250-251` for GET, `:253-254` for POST).

`signupVerify` (`internal/api/verify.go:307-367`):

```go
shouldUpdatePassword := false
if !user.HasPassword() && user.InvitedAt != nil {
	// sign them up with temporary password, and require application
	// to present the user with a password set form
	password, err := password.Generate(64, 10, 0, false, true)
	...
```

then in the transaction: `UpdatePassword`, audit log, `user.Confirm(tx)`, and
`identity.UpdateIdentityData({"email_verified": true})` for every identity whose email matches the
user's (`verify.go:350-360`). Back in `verifyPost`, `issueRefreshToken(..., models.OTP, ...)` and
`sendJSON(w, 200, token)` (`verify.go:285-288,309`).

| Question | Answer |
| --- | --- |
| Full session immediately? | **Yes** — access + refresh token in the response body, server-readable, so `verifyOtp` can be called from a Route Handler and `@supabase/ssr` writes the cookies via `setAll` |
| Can the sailor then call `updateUser({ password })`? | **Yes** — and they must, because GoTrue has already put a random 64-char password on the account that nobody knows. The source comment says the application is expected to "present the user with a password set form". |
| Post-redemption state | `email_confirmed_at` set, `confirmed_at` set (generated), `invited_at` retained, `confirmation_token = ''`, all one-time tokens cleared, `identity_data.email_verified = true`, `user_metadata.email_verified = true` |
| Is the redeemed account then safe from §3.4? | **Yes** — `Confirm` ran, so `IsConfirmed()` is true |

`updateUser({ password })` on that fresh session hits `internal/api/user.go:152-205`. Two things to
know: `user.HasPassword()` is now **true** (the random one), so the `same_password` comparison runs —
harmless, since the sailor cannot accidentally re-enter a 64-char random string — and if
`security_update_password_require_current_password` were ever enabled, the sailor would be asked for
a password they were never told (`user.go:173-186`). Leave that setting off. See §6.

### 4.4 Expiry, resend, and the one-time-token slot

| Question | Answer | Source |
| --- | --- | --- |
| Expiry window | `config.Mailer.OtpExp`, measured from `user.ConfirmationSentAt` — **the same value as recovery and magic link** | `internal/api/verify.go:684-685` — `isExpired = isOtpExpired(user.ConfirmationSentAt, config.Mailer.OtpExp)` |
| Hosted default | **1 hour** | [users](https://supabase.com/docs/guides/auth/users): "Invitation links expire after the duration configured in Email OTP Expiration, which defaults to 1 hour. This is the same value used for email OTPs, magic links, and other email confirmation links." (This resolves LAY-115 §3.4's UNVERIFIED row.) |
| GoTrue fallback when unset | 86400 s | `internal/conf/configuration.go` (LAY-115 §3.4) |
| This repo's local value | 3600 s | `supabase/config.toml:229` |
| Expired-link error | 403 / `otp_expired` / "Email link is invalid or has expired" — **indistinguishable from already-used**, same as recovery | `internal/api/verify.go:664-668,692-694` |
| Can an invite be resent? | **Yes, by calling `inviteUserByEmail` again** — the row is unconfirmed, so `invite.go:67-70` does not refuse | `internal/api/invite.go:42-43,66-84` |
| Does `auth.resend()` work for invites? | **No.** The SDK's `ResendParams` accepts only `Extract<EmailOtpType, 'signup' \| 'email_change'>` plus the two phone types | `node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:685-699` |
| Does resending invalidate the prior link? | **Yes.** `sendInvite` overwrites `u.ConfirmationToken` with a fresh hash and persists it (`mail.go:367,385`), and the new `CreateOneTimeToken` row replaces the old for that token type. Only the newest link resolves. | `internal/api/mail.go:360-396` |
| Per-user resend cooldown? | **None for invite.** `sendInvite` is the only mailer that does **not** call `validateSentWithinFrequencyLimit` — compare `sendConfirmation` (`mail.go:326`), `sendPasswordRecovery` (`:402`), `sendMagicLink` (`:487`), `sendEmailChange` (`:528`). Only the hourly `rate_limit_email_sent` bucket applies. | `internal/api/mail.go:360-368` |
| Signup confirmation vs invite collision | They share `confirmation_token`, so a signup-confirmation send would clobber a pending invite and vice versa. Not reachable with sign-up closed, but worth not reintroducing. | `mail.go:333` vs `:367` |

### 4.5 Does a dangling invite block a later Google sign-in?

**No — it does not block, but Google wins and eats the invite.** Cross-referencing the linking table:
the invited row is unconfirmed with a populated `email` identity, so `DetermineAccountLinking` returns
`LinkAccount` (§2.3), the `disable_signup` gate is not on that arm (§2.2), then
`external.go:411` fires because `IsConfirmed()` is false, and `RemoveUnconfirmedIdentities` destroys
the `email` identity (`user.go:1043-1049`) and replaces `user_metadata` with Google's. `EncryptedPassword`
is set to nil too (`user.go:1021-1027`, since the provider is `google`, not `email`) — moot, there was
no password. Then `external.go:424` calls `user.Confirm`, which sets `confirmation_token = ''` and
`ClearAllOneTimeTokensForUser`.

Net effect: the sailor is signed in and confirmed, the invite link in their inbox is dead with no
notice, and `app_metadata.providers` now lists `google` only. Functional, but the invite email
becomes a lie the moment they use Google instead. Any invite copy should not promise "this link is
how you get in".

---

## 5. Is an invite the same machinery as a magic link?

The map rules "magic link / passwordless" out of scope. Factually, they are **built from the same
verification endpoint and different token slots**, and one of the differences is precisely the thing
the scope line is about.

| Axis | `invite` | `magiclink` |
| --- | --- | --- |
| Endpoint | `POST /invite` | `POST /magiclink` |
| Auth required | **service role** — `r.With(api.requireAdminCredentials)` (`internal/api/api.go:228`) | **none** — public, behind IP rate limit + captcha (`api.go:261-262`) |
| Callable from the browser | no | yes (that is the point) |
| Handler | `internal/api/invite.go:20-106` | `internal/api/magic_link.go` |
| Mailer | `sendInvite`, `internal/api/mail.go:360-396` | `sendMagicLink`, `internal/api/mail.go:480-521` |
| DB token column | `users.confirmation_token` | `users.recovery_token` |
| Timestamp column | `users.confirmation_sent_at` | `users.recovery_sent_at` |
| One-time-token type | `models.ConfirmationToken` | `models.RecoveryToken` |
| PKCE prefix | never (`sendInvite` omits `addFlowPrefixToToken`) | yes when a `code_challenge` is supplied (`mail.go:495`) |
| Per-user resend floor | none | `smtp_max_frequency` against `RecoverySentAt` (`mail.go:487`) |
| `type=` in the link / `verifyOtp` | `invite` | `magiclink` |
| `/verify` lookup | `FindUserByOneTimeToken(..., models.ConfirmationToken)` (`verify.go:653-654`) | `FindUserByOneTimeToken(..., models.RecoveryToken)` (`verify.go:655-656`) |
| `/verify` handler arm | `signupVerify` — same arm as `type=signup` (`verify.go:253-254`) | `recoverVerify` — same arm as `type=recovery` (`verify.go:255-256`) |
| Sets a password? | **yes**, a random 64-char one, if `!HasPassword() && InvitedAt != nil` (`verify.go:310-330`) | **no** |
| Password afterwards | one exists (unknown to the user) and the app is expected to overwrite it | unchanged — none if none before |
| One-time | yes | yes |
| Repeatable as a login method | no — it is consumed and the user becomes confirmed | **yes, indefinitely** — that is what "passwordless" means |
| Provider disabled by | `external_email_enabled = false` | that, **or** `external_email_magic_link_enabled = false` (`internal/api/magic_link.go:46,50`) — magic link has its own kill switch |
| Docs family | ["Users"](https://supabase.com/docs/guides/auth/users) (admin action) | ["Email passwordless"](https://supabase.com/docs/guides/auth/auth-email-passwordless) |

**The judgement, stated so the ADR can make it.** Invite and magic link both ride `POST /verify`, and
GoTrue routes `invite` through `signupVerify` while `magiclink` goes through `recoverVerify` — so they
are not even the same arm of the shared endpoint. The behavioural distinctions that bear on the scope
line all point the same way:

- an invite is **an admin action requiring the service role**; a magic link is a **public,
  self-service sign-in method**. A closed front door is exactly the difference.
- an invite is **one-shot onboarding** that ends in a password existing; a magic link is a
  **repeatable substitute for a password**.
- GoTrue gives magic link its own dedicated toggle (`MagicLinkEnabled`) that can be off while invites
  still work.

So using invite does **not** re-open passwordless sign-in, and does not require enabling
`POST /magiclink`. What it *does* share with a magic link is the property that a live link in an
inbox is a bearer credential for the account — which is the security argument, not the scope
argument, and applies equally to the Forgot-password link the design already accepts.

---

## 6. Setting and later changing a password with no email round trip

### 6.1 Yes — `updateUser({ password })` on a live session

`PUT /user` → `internal/api/user.go` (`UserUpdate`). With a session in cookies, the sailor can change
their password with no token, no link, no email:

```ts
const { error } = await supabase.auth.updateUser({ password })
```

`node_modules/@supabase/auth-js` requires a session and throws `AuthSessionMissingError` /
"Auth session missing!" without one (LAY-115 §3). Failure modes on this call are already tabulated in
LAY-115 §3: `same_password`, `weak_password` (with `reasons`), and `AuthWeakPasswordError`.

There is **no notification email on success either**, unless the project enables the
`password_changed` notification (`mailer_notifications_password_changed_enabled` in the Management
API; template stub commented out at `supabase/config.toml:247-250`). If it *were* enabled it would
hit the §1.1 gate and fail — `sendPasswordChangedNotification` goes through the same `sendEmail`
(`internal/api/mail.go`), so **UNVERIFIED whether a blocked notification would fail the whole password
change or be swallowed**; the notification senders return `apierrors.NewTooManyRequestsError` /
`herr` up the stack, which suggests it propagates. Leave the notification off.

### 6.2 The reauthentication switch, and what it would cost

`supabase/config.toml:223`:

```toml
# If enabled, users will need to reauthenticate or have logged in recently to change their password.
secure_password_change = false
```

Mapped by the CLI to the Management API field LAY-115 spotted —
`apps/cli-go/pkg/config/auth.go:703`:

```go
body.SecurityUpdatePasswordRequireReauthentication = nullable.NewNullableWithValue(e.SecurePasswordChange)
```

which is GoTrue's `Security.UpdatePasswordRequireReauthentication`
(`internal/conf/configuration.go:905`). The guard, `internal/api/user.go:153-166`:

```go
if config.Security.UpdatePasswordRequireReauthentication {
	now := time.Now()
	// we require reauthentication if the user hasn't signed in recently in the current session
	if session == nil || now.After(session.CreatedAt.Add(24*time.Hour)) {
		if len(params.Nonce) == 0 {
			return apierrors.NewBadRequestError(apierrors.ErrorCodeReauthenticationNeeded, "Password update requires reauthentication")
		}
		if err := a.verifyReauthentication(params.Nonce, db, config, user); err != nil {
			return err
		}
	}
}
```

**If it were on, reauthentication would require an email round trip.** `POST /reauthenticate`
(`internal/api/api.go:277`, handler `internal/api/reauthenticate.go:17-65`) sends a 6-digit OTP —
`sendReauthenticationOtp` — and the client passes it back as `nonce`:
`updateUser({ password }, { nonce })`. Two hard consequences for Layline:

- that OTP goes through the same `sendEmail`, so on the built-in sender it hits §1.1 and **fails for
  crew**;
- `reauthenticate` refuses outright for an unconfirmed user: 422 `email_not_confirmed` / "Please
  verify your email first." (`reauthenticate.go:29-32`).

Note the 24-hour grace: sessions younger than a day skip the nonce entirely, so the setting is
invisible in dev and bites only returning users. Documented codes:
`reauthentication_needed` — "A user needs to reauthenticate to change their password. Ask the user to
reauthenticate by calling the `supabase.auth.reauthenticate()` API"; `reauthentication_not_valid` —
"Verifying a reauthentication failed, the code is incorrect."
([error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)).

**Keep `secure_password_change = false`, and keep
`security_update_password_require_current_password` off too** — the latter (`user.go:173-186`,
`current_password_required` / `current_password_mismatch`) would break the §4.3 invite flow outright,
since the sailor's "current" password is a random string GoTrue generated. It is exempted only inside
a recovery-flow session (`if !session.IsRecovery()`, `user.go:175`), which an invite session is not.

### 6.3 So the owner-sets-the-password route is self-sufficient

If the owner creates the account with `email_confirm: true` and a password, and tells the crew member
that password out of band, then:

1. the sailor signs in with it — no email;
2. the sailor changes it in-app via `updateUser({ password })` — no email;
3. the sailor may also link Google, and §3.4 says the password survives — no email.

The only remaining email dependency is **recovery for a sailor who forgets the password and is not
signed in anywhere**. That, and only that, needs custom SMTP (or an `admin.generateLink({ type:
'recovery' })` handed over by the owner, §1.5).

---

## 7. Answers in one place

1. **The built-in sender cannot email crew.** Documented: without custom SMTP, "Supabase Auth will
   refuse to deliver messages to addresses that are not part of the project's team", failing with
   400 `email_address_not_authorized`. The mechanism is `GOTRUE_EXTERNAL_EMAIL_AUTHORIZED_ADDRESSES`
   checked in the shared `sendEmail` helper (`internal/api/mail.go:773-776`), so it covers invites,
   confirmations, recovery, magic links and reauthentication OTPs alike; `+label` tricks are
   normalised away; and the field is **absent from the Management API**, so it cannot be widened
   per-project. Limit is 2 emails/hour per project on the built-in sender, 30/hour on custom SMTP.
   Supabase calls the built-in service "not meant for production" and urges custom SMTP. **Both the
   invite flow and Forgot password are therefore non-functional for crew until custom SMTP exists.**
   Free tiers that could serve: Resend 100/day-3,000/month permanent, Mailgun 100/day permanent, SES
   only after production access (sandbox reproduces the same verified-recipients-only problem),
   SendGrid and Brevo UNVERIFIED. The one email-free escape hatch is
   `admin.generateLink`, which returns the link in the API response and never touches `sendEmail`.
2. **`disable_signup` does not block admin provisioning, and does not block Google for an existing
   account.** The guard appears in five non-config places, none on an admin route:
   `adminUserCreate` and `Invite` never read it. On the OAuth path it sits *inside*
   `case models.CreateAccount:` (`internal/api/external.go:342-345`) and behind an early
   `if decision.Decision != models.CreateAccount { return nil }` in the hook path
   (`internal/api/hooks.go:91-98`). A hand-created email account yields `LinkAccount`, so
   **"Continue with Google" works for crew** while a stranger's new-account attempt is refused with
   422 `signup_disabled`. Separately: `supabase/config.toml` has two `enable_signup` keys — line 171
   is the gate ADR 0019 means, line 216 is `external_email_enabled` and setting it false would kill
   password sign-in (422 `email_provider_disabled`) **and** Forgot password. LAY-120 must name line 171.
3. **`email_confirm: true` is what makes a hand-created account safe, and the dashboard already
   defaults to it.** "Auto confirm user?" is checked by default in Studio's Create-user modal and maps
   to `email_confirm`; it sets `email_confirmed_at` (and `confirmed_at`, a generated column) and
   `user_metadata.email_verified = true`. The project-level `enable_confirmations` /
   `mailer_autoconfirm` setting is **never consulted by `adminUserCreate`** in either direction. The
   `RemoveUnconfirmedIdentities` hazard is gated at the OAuth call site by
   `if hasEmails && !user.IsConfirmed()` (`internal/api/external.go:411`), and `IsConfirmed()` is
   exactly `EmailConfirmedAt != nil` — so a confirmed account is **safe** and an unconfirmed one
   **silently loses its password and its email identity** on first Google sign-in. Remedy without
   email: `admin.updateUserById(id, { email_confirm: true })`.
4. **Invite creates the row immediately, unconfirmed, with `invited_at` set**, carries
   `{{ .TokenHash }}` and a `type=invite` `{{ .ConfirmationURL }}`, is **never PKCE-prefixed** (so
   cross-device is fine), and `verifyOtp({ type: 'invite', token_hash })` returns a **full session in
   the response body**. GoTrue puts a random 64-char password on the account at redemption and expects
   the app to show a set-password form. Expiry is `mailer_otp_exp` from `confirmation_sent_at` —
   hosted default **1 hour**, the same value as recovery. Resending means calling
   `inviteUserByEmail` again (`auth.resend()` does not accept `'invite'`); it **invalidates the prior
   link**, and there is **no per-user cooldown** on invite. A dangling invite does not block a later
   Google sign-in — but Google links, destroys the email identity and voids the invite silently.
5. **Invite and magic link share `POST /verify` and nothing else that matters.** Different endpoints,
   different token columns (`confirmation_token` vs `recovery_token`), different one-time-token types,
   different `/verify` arms (`signupVerify` vs `recoverVerify`), different `type` values. Invite is
   **service-role-only, one-shot, and ends with a password existing**; magic link is **public,
   repeatable, and a password substitute**, with its own `MagicLinkEnabled` kill switch. Using invite
   does not re-open passwordless sign-in.
6. **Yes — an owner-set password can be changed with no email.** `updateUser({ password })` on a live
   session, no token involved. `secure_password_change = false` (`supabase/config.toml:223`) maps to
   `security_update_password_require_reauthentication`; if it were on, sessions older than 24 hours
   would need a `nonce` from `POST /reauthenticate`, which emails a 6-digit OTP — blocked by (1) and
   refused outright for unconfirmed users (422 `email_not_confirmed`). Keep it off, and keep
   `security_update_password_require_current_password` off too, since it would break the invite flow
   (the sailor's "current" password is a random string they were never told).
