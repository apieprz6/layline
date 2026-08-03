# ADR 0004: Auth Sheet Pattern with Google OAuth

## Status

Accepted

## Context

Layline needs user authentication to support future features (preference sync, boat performance tracking). The app must remain fully usable without an account — auth is additive, not gate-keeping.

Design options considered:
- Dedicated `/auth/login` and `/auth/signup` routes (gate-keeping pattern)
- Bottom sheet overlay on the dashboard (progressive auth pattern)

## Decision

Use a **bottom sheet overlay** on the dashboard for sign-in, sign-up, and forgot-password flows. Auth is optional — guests access the full app.

### Auth methods
- Email + password (with forgot-password flow via Supabase `resetPasswordForEmail`)
- Google OAuth (with account merging enabled for same-email identities)

### Sheet modes
1. **Sign in**: Email, Password, "Forgot password?" link, Submit, Google OAuth
2. **Sign up**: Name, Email, Password, Submit, Google OAuth
3. **Forgot password**: Email, "Send reset link" button

### Name storage
`display_name` on the `profiles` table. Populated from the sign-up form (email/password) or Google profile metadata (OAuth).

### Role model
Flat on profile: `'admin' | 'user' | null`. Admin can upload regattas and modify boat setup. User can view boat performance. Null at sign-up, assigned later. Single-boat assumption (no per-boat roles).

### Dedicated routes
Only `/auth/reset-password` exists as a standalone page (deep-linked from password reset emails). `/auth/callback` handles OAuth redirects.

## Consequences

- Dashboard layout must support the sheet overlay (Client Component for open/close state)
- No middleware redirects for unauthenticated users on dashboard routes
- Google OAuth requires Google Cloud Console credentials + Supabase provider config
- `profiles` table needs a `display_name` column
- `role` column type changes from legacy sailing roles to `'admin' | 'user' | null`
