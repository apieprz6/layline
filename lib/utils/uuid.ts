/**
 * Whether a string is a uuid.
 *
 * For ids that arrive from outside — a route param, a query string, a form field — and are
 * about to be sent to Postgres as one. PostgREST answers a malformed uuid with a 22P02 *error*,
 * which reads back here as a failed read rather than as a row that is not there; so a link with
 * a typo in it would be reported as a fault of ours and logged as one. Asking first makes it
 * what it is: no such thing.
 *
 * Shape only, deliberately. Version and variant bits are not checked, because nothing here
 * cares which uuid version made an id — only that Postgres will accept the text as one.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}
