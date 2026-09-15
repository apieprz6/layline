# Instrument Calibration Constraints — Local Verification

Verification record for the two rules LAY-108's acceptance criteria place **in the
database** rather than in the application:

- an `instrument_calibration` Version is correctable in `payload`, `note` and
  `effective_from`, and in nothing else — `version_number`, `created_by`, `recorded_at`
  and `kind` are refused (`public.enforce_version_immutability`, ADR 0011)
- a `calibration_event` of type `autocompensation` carries exactly `{HDG}`, its channel
  set is never empty, and its note is never blank (`autocompensation_is_hdg_only`,
  `channels_non_empty`, `note_non_empty` — ADR 0005)

Both live in `supabase/migrations/20260910183000_create_race_archive_and_boat_setup.sql`,
shipped by LAY-104. No Jest test can reach them, and ADR 0019's standard applies: a
trigger may not be reported as working on an agent's word.

**Run on 2026-09-15 against the local stack** (DB on `127.0.0.1:54322`, API on
`127.0.0.1:54321`): every check below observed as written. What is *not* covered here is
the hosted project, and RLS — these were run as `service_role`, which bypasses the
policies deliberately, so that what is being tested is the trigger and the CHECKs rather
than who is allowed to reach them. The Role gate is covered by
`app/(app)/boat-management/instrument-calibration/__tests__/actions.test.ts` and by
`profile-trigger-and-role-lock.md`.

## Prerequisites

`psql` is not installed in the agent environment, so these were run through PostgREST
with a self-minted `service_role` JWT. The local stack's default secret is
`super-secret-jwt-token-with-at-least-32-characters-long`; mint against it with any
HS256 signer, or take the `service_role` key from `supabase status`.

```bash
export KEY='<service_role JWT>'
export API='http://127.0.0.1:54321/rest/v1'
export H="-H apikey:$KEY -H Authorization:Bearer\ $KEY -H Content-Type:application/json -H Prefer:return=representation"
```

`created_by` is `NOT NULL` on both tables, so an author is needed first. Create it the
way the owner does — through the Auth admin API, which mints the `profiles` row by
trigger (ADR 0020):

```bash
curl -s $H -X POST http://127.0.0.1:54321/auth/v1/admin/users \
  -d '{"email":"probe@example.test","password":"probe-probe-probe","email_confirm":true}'
```

Then take the `instrument_calibration` artifact's id, which the migration seeds:

```bash
curl -s $H "$API/boat_setup_artifacts?kind=eq.instrument_calibration&select=id"
```

## 1. A Version mints, and corrects in the three permitted columns

```bash
curl -s $H -X POST "$API/boat_setup_versions" -d '{
  "artifact_id":"<artifact>","kind":"instrument_calibration","version_number":9001,
  "effective_from":"2026-05-30","note":"probe","created_by":"<author>",
  "payload":{"AWA":{"offset":2},"AWS":{"multiplier":1.02,"offset":0},
             "STW":{"multiplier":1.02,"offset":0},"HDG":{"offset":0}}}'
```

**Observed**: `201`. `filename` and `content_sha256` are omitted, which
`file_backed_kinds_only` requires of this kind — a `.cal` filename cannot be stored even
by a client that invents one.

```bash
curl -s $H -X PATCH "$API/boat_setup_versions?id=eq.<version>" -d '{
  "payload":{"AWA":{"offset":1},"AWS":{"multiplier":1.02,"offset":0},
             "STW":{"multiplier":1.02,"offset":0},"HDG":{"offset":0}},
  "note":"corrected","effective_from":"2026-05-31"}'
```

**Observed**: `200`. `recorded_at` came back unchanged from the mint —
`2026-09-15T03:34:08.381685+00:00` before and after — which is the point of the column:
a corrected Version still says when it was first entered.

## 2. Everything else on that Version is refused

Each of these is a `PATCH` of one column on the row from §1.

| Patch | Observed |
|-------|----------|
| `{"version_number":9002}` | `400 P0001` — *only payload, note and effective_from may be corrected on an instrument_calibration Version* |
| `{"created_by":"<a different profile>"}` | `400 P0001`, same message |
| `{"recorded_at":"2020-01-01T00:00:00Z"}` | `400 P0001`, same message |
| `{"kind":"rig_tune"}` | `400 P0001`, same message |

⚠️ **`created_by` needs a genuinely different profile to test.** The trigger compares
`NEW` against `OLD`, so patching `created_by` to the value it already holds is not a
change and returns `200` — which reads as a hole and is not one. Create a second user
and reassign to that.

## 3. Calibration Events

Posted against the same artifact, `occurred_on: '2026-07-04'`, `note: 'probe'`.

| Event | Observed |
|-------|----------|
| `autocompensation`, `["HDG"]` | `201` |
| `autocompensation`, `["AWA"]` | `400 23514` `autocompensation_is_hdg_only` |
| `autocompensation`, `["HDG","AWA"]` | `400 23514` — a superset is refused too, not only a wrong single |
| `other`, `[]` | `400 23514` `channels_non_empty` |
| `other`, `["STW"]`, note `"   "` | `400 23514` `note_non_empty` — blank, not just null |
| `other`, `["STW","STW"]` | **`201`** |
| `other`, `["STW"]`, `occurred_on: '2062-07-04'` | **`201`** |

Two rows there are `201`, and both are worth naming.

**Duplicate channels** are expected, and documented on the table: a CHECK cannot hold the
subquery that would catch a duplicate inside an array, so duplicates are the
application's job. `addCalibrationEvent` refuses them and
`instrument-calibration/__tests__/actions.test.ts` covers that — but a client reaching
PostgREST directly can still store `{STW,STW}`, and the Log would render the channel
twice on one line.

**`occurred_on` is unbounded**, in either direction. A mistyped year stores as typed, and
a future-dated Event pins itself to the top of the Log — where it stays, because the
application has no correction path for an Event, only an insert. ADR 0005's *Corrections*
section says Log entries are editable in place; LAY-108's acceptance criteria do not ask
for it, so it is not built here. The argument that earned Versions their correction
exception applies to an Event's date and note just as well.

## Cleaning up

The probe rows are removable in this order, and only this order — `created_by` is
`ON DELETE RESTRICT`, so the user will not delete while its Versions stand.

```bash
curl -s $H -X DELETE "$API/calibration_events?note=eq.probe"
curl -s $H -X DELETE "$API/boat_setup_versions?created_by=eq.<author>"
curl -s $H -X DELETE http://127.0.0.1:54321/auth/v1/admin/users/<author>
```

Verified afterwards that `boat_setup_versions`, `calibration_events` and `profiles` were
all empty again: the archive is hand-entered through the finished UI and nothing here
seeds it.
