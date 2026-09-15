import type { Account } from '@/types'

/**
 * Whether this **Account** may write.
 *
 * The whole of authorization on the client side of the app, in one predicate: the
 * **Role** governs writes only, so every signed-in sailor reads everything and an
 * `admin` additionally edits (ADR 0019). A **Guest** — `null` — never gets this far,
 * since the routes that offer a write redirect them to sign in first.
 *
 * The server-side authority is `public.is_admin()`, which RLS applies to every
 * write regardless of what any screen decided. This is what a screen uses to decide
 * whether to *offer* the write, and what a Server Action uses to refuse it early
 * with a message rather than a database error.
 */
export function canWrite(account: Account | null): boolean {
  return account?.role === 'admin'
}
