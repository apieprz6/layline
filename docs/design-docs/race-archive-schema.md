# Race Archive and Boat Setup Schema

The migration-ready schema for the Boat Setup artifacts and the race archive, settled by
[LAY-93](https://linear.app/layline-sailing/issue/LAY-93/design-the-schema-for-config-artifacts-and-the-race-archive).

This is a sketch to be lifted into a migration, not a migration. It is written in dependency
order and can be pasted as one file. Vocabulary is `CONTEXT.md`'s; the reasoning behind the
three decisions with real trade-offs is in ADR 0011, ADR 0012 and ADR 0013.

## Shape at a glance

Twelve tables. Nine are the archive and Boat Setup; `profiles` and `boats` already exist or are
trivial.

```
boats
 ├── sails                                   the boat's Sail Inventory
 ├── boat_setup_artifacts (4 rows)           one per kind, holds the current pointer
 │    ├── boat_setup_versions                every Version of every kind, payload as JSONB
 │    │    └── rig_tune_bands                the one payload interior pointed at from outside
 │    └── calibration_events                 the valueless dated acts
 └── races
      ├── recordings  (1:1, the Race is the child)
      │    └── recording_rows                the Transcription
      ├── race_sail_entries
      │    └── race_sail_entry_sails         a Sail Configuration is a set, so it is a set
      └── race_sea_state_entries
```

`boat_id` appears on exactly three tables — `boat_setup_artifacts`, `sails` and `races`.
Everything else reaches the boat through one of those three. (Decision 2 said two tables;
decision 4 then added the Sail Inventory, which has nowhere else to hang.)

## Conventions

- **`timestamp` vs `timestamptz`** is not a style choice. Anything in the recording's own naive
  wall-clock frame is `timestamp` — Recording Row times, the Race Window, Annotation entry
  times — because the qtVlm export carries no offset and any conversion at storage time could
  silently move a boundary. Anything that is a moment in Layline's own life is `timestamptz`:
  `created_at`, `updated_at`, `recorded_at`. Sailor-supplied calendar dates are `date`.
- **Bare `numeric`** for every recorded channel. Not `numeric(6,1)`, and not `double precision`.
  See "Why bare numeric" below.
- **A constant tag column plus a composite foreign key** is used three times to make a
  cross-table `CHECK` expressible. The pattern is explained once in ADR 0011.
- Storage paths are **derived, never stored**. The canonical implementation is one TypeScript
  helper; there is deliberately no SQL equivalent, so there is nothing to drift.

## Enums

```sql
CREATE TYPE boat_setup_kind AS ENUM (
    'polar', 'crossover_chart', 'rig_tune', 'instrument_calibration'
);
CREATE TYPE calibration_channel AS ENUM ('AWA', 'AWS', 'STW', 'HDG');
CREATE TYPE calibration_event_type AS ENUM ('autocompensation', 'other');
CREATE TYPE sea_state AS ENUM ('calm', 'slight', 'moderate', 'rough');
CREATE TYPE reef_state AS ENUM ('full', 'reef-1');
CREATE TYPE recording_date_order AS ENUM ('MDY', 'DMY');
```

Enums rather than `TEXT` + `CHECK` throughout. Adding a value is a migration either way, so the
cost is equal and the enum buys generated types and a name that appears in the error. Two notes:

- `reef_state` will gain `'reef-2'` if Handsome Pete's main ever grows a second reef point.
  That is `ALTER TYPE ... ADD VALUE`, a non-blocking one-liner.
- `recording_date_order` has exactly one value in use. All 13 archive files are `MDY`
  (6 of them prove it unambiguously with a day > 12). It exists so a wrong reading of an
  ambiguous file is fixable without re-upload — see `recordings.date_order`.

## `boats`

```sql
CREATE TABLE IF NOT EXISTS boats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    model       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly one boat exists. This is one line to drop when a second one is real, and until
-- then it stops every read path from having to decide what to do with the second row.
CREATE UNIQUE INDEX boats_singleton ON boats ((TRUE));

INSERT INTO boats (name, model) VALUES ('Handsome Pete', 'Beneteau 10R');
```

A table rather than a constant because `boat_id` is what makes the four artifacts and the races
hang off something nameable, and because the mockup's placeholder identity
(`Wayward Wind · J/105`) needs somewhere real to be replaced.

## `sails` — the Sail Inventory

```sql
CREATE TABLE IF NOT EXISTS sails (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boat_id     UUID NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    label       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL,
    retired_on  DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (boat_id, key),
    CONSTRAINT sails_key_non_empty CHECK (BTRIM(key) <> '')
);

INSERT INTO sails (boat_id, key, label, sort_order)
SELECT b.id, s.key, s.label, s.sort_order
FROM boats b, (VALUES
    ('main',  'Main',  1),
    ('jib-1', 'Jib 1', 2),
    ('jib-2', 'Jib 2', 3),
    ('jib-3', 'Jib 3', 4),
    ('A2',    'A2',    5),
    ('A3',    'A3',    6)
) AS s(key, label, sort_order);
```

A table, not an enum and not a JSONB list, because a Sail Configuration points at it and the
thing a Sail Configuration points at should be a row. The immediate payoff is the rename this
project is about to perform: `reaching-spin` becoming `A3` is one `UPDATE` of one row rather
than a text rewrite across every entry that mentions it, which is exactly the failure
`CONTEXT.md` records as three spellings of one sail.

`retired_on` exists because `race_sail_entry_sails` references sails with `ON DELETE RESTRICT`:
a sail that has been flown cannot be deleted, only retired out of the picker.

## `boat_setup_artifacts`

```sql
CREATE TABLE IF NOT EXISTS boat_setup_artifacts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boat_id             UUID NOT NULL REFERENCES boats(id) ON DELETE RESTRICT,
    kind                boat_setup_kind NOT NULL,
    current_version_id  UUID,   -- FK added below; circular, so DEFERRABLE
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (boat_id, kind),
    -- lets a child row carry `kind` truthfully; see ADR 0011
    UNIQUE (id, kind)
);

INSERT INTO boat_setup_artifacts (boat_id, kind)
SELECT b.id, k.kind FROM boats b,
    (VALUES ('polar'::boat_setup_kind), ('crossover_chart'), ('rig_tune'),
            ('instrument_calibration')) AS k(kind);
```

Four rows, forever. `current_version_id` is nullable so the four rows can exist before anything
has been uploaded, which is the state the app ships in.

## `boat_setup_versions`

One table for all four kinds. The machinery — version number, dates, note, author, filename —
is identical across kinds and carries every invariant worth enforcing; the payloads share
nothing and are never queried cell-wise. ADR 0011 has the argument.

```sql
CREATE TABLE IF NOT EXISTS boat_setup_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id     UUID NOT NULL,
    kind            boat_setup_kind NOT NULL,
    version_number  INTEGER NOT NULL,
    effective_from  DATE NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note            TEXT,
    created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    filename        TEXT,
    content_sha256  TEXT,
    payload         JSONB NOT NULL,

    FOREIGN KEY (artifact_id, kind)
        REFERENCES boat_setup_artifacts (id, kind) ON DELETE CASCADE,
    UNIQUE (artifact_id, version_number),
    -- lets rig_tune_bands and races carry `kind` truthfully; see ADR 0011
    UNIQUE (id, kind),

    CONSTRAINT version_number_positive CHECK (version_number >= 1),

    -- A Rig Tune's value rests as much on its note as on its numbers: the per-band spread is
    -- only one to three turns because the headstay is not adjustable on this boat (ADR 0007).
    CONSTRAINT rig_tune_note_required CHECK (
        kind <> 'rig_tune' OR (note IS NOT NULL AND BTRIM(note) <> '')
    ),

    -- Exactly two kinds come from a file. A Rig Tune has never existed as a file for this
    -- boat and an Instrument Calibration is typed off a display, so a filename on either is
    -- the mockup's `Wayward_Wind.rig` mistake reappearing.
    CONSTRAINT file_backed_kinds_only CHECK (
        (kind IN ('polar', 'crossover_chart')) = (filename IS NOT NULL)
    ),
    CONSTRAINT hash_accompanies_filename CHECK (
        (filename IS NULL) = (content_sha256 IS NULL)
    ),

    -- Presence only. Structure is validated by Zod on write; see "Payload shapes".
    CONSTRAINT payload_keys_present CHECK (
        CASE kind
            WHEN 'polar' THEN
                payload ? 'twa_axis' AND payload ? 'tws_axis' AND payload ? 'boat_speed'
            WHEN 'crossover_chart' THEN
                payload ? 'twa_axis' AND payload ? 'tws_axis' AND payload ? 'cells'
                AND payload ? 'sail_definitions'
            WHEN 'instrument_calibration' THEN
                payload ? 'AWA' AND payload ? 'AWS' AND payload ? 'STW' AND payload ? 'HDG'
            WHEN 'rig_tune' THEN
                payload = '{}'::JSONB   -- the content is in rig_tune_bands
        END
    )
);

ALTER TABLE boat_setup_artifacts
    ADD CONSTRAINT boat_setup_artifacts_current_version_fkey
    FOREIGN KEY (current_version_id) REFERENCES boat_setup_versions(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;
```

`created_by` is `NOT NULL` for every kind. ADR 0005 ruled calibration events needed no author
field on the grounds of one boat and one writer; that is true today and would be a schema change
the day a second admin exists, so it is uniform now. `ON DELETE RESTRICT` means deleting an admin
account fails while their Versions stand — deliberately, because "who tuned the rig" is not
something to erase silently.

`recorded_at` is immutable, including through a calibration correction. There is no history, so
it keeps meaning *when this Version was first entered*.

### The current pointer moves forward only

A constraint trigger rather than a `CHECK`, because it needs two lookups, and *deferred* so it
can be satisfied inside the same transaction that inserts both rows — which is what the
deferrable FK above is for.

```sql
CREATE OR REPLACE FUNCTION public.enforce_forward_only_current_version()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_owner   UUID;
    v_new_num INTEGER;
    v_old_num INTEGER;
BEGIN
    IF NEW.current_version_id IS NULL THEN
        IF TG_OP = 'UPDATE' AND OLD.current_version_id IS NOT NULL THEN
            RAISE EXCEPTION 'current_version_id cannot be cleared once set';
        END IF;
        RETURN NULL;
    END IF;

    SELECT artifact_id, version_number INTO v_owner, v_new_num
    FROM public.boat_setup_versions WHERE id = NEW.current_version_id;

    IF v_owner IS DISTINCT FROM NEW.id THEN
        RAISE EXCEPTION 'current_version_id must reference a Version of this artifact';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.current_version_id IS NOT NULL THEN
        SELECT version_number INTO v_old_num
        FROM public.boat_setup_versions WHERE id = OLD.current_version_id;
        IF v_new_num <= v_old_num THEN
            RAISE EXCEPTION
                'the current Version may only move forward (v% -> v%)', v_old_num, v_new_num;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER boat_setup_artifacts_forward_only_current
    AFTER INSERT OR UPDATE OF current_version_id ON boat_setup_artifacts
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_forward_only_current_version();
```

Applied to all four kinds, not just the uploaded ones. "Current" going backwards is a bug in
every case, and a Rig Tune is the one where it would be least visible.

### Immutability, with the calibration exception

```sql
CREATE OR REPLACE FUNCTION public.enforce_version_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF OLD.kind <> 'instrument_calibration' THEN
        RAISE EXCEPTION
            'a % Version is immutable; mint a new Version instead', OLD.kind;
    END IF;

    IF NEW.id            <> OLD.id
    OR NEW.artifact_id   <> OLD.artifact_id
    OR NEW.kind          <> OLD.kind
    OR NEW.version_number<> OLD.version_number
    OR NEW.created_by    <> OLD.created_by
    OR NEW.recorded_at   <> OLD.recorded_at
    OR NEW.filename      IS DISTINCT FROM OLD.filename
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 THEN
        RAISE EXCEPTION
            'only payload, note and effective_from may be corrected on an '
            'instrument_calibration Version';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER boat_setup_versions_immutable
    BEFORE UPDATE ON boat_setup_versions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_version_immutability();
```

An Instrument Calibration Version is a transcription off a display. Left uncorrectable, a
mistyped figure would stand permanently as what the boat ran, and every Race pointing at it
would report against a number that never existed. Nothing else in Boat Setup can be edited: an
upload is re-uploaded, and a wrong Rig Tune is superseded by the right one.

There is **no `DELETE` policy** on `boat_setup_versions` (see RLS below), so a Version is never
removed — only superseded. Cascades from `boat_setup_artifacts` still work, because referential
actions are not subject to RLS.

## `rig_tune_bands`

The one place a payload's interior is pointed at from outside, and therefore the one deliberate
departure from ADR 0011's JSONB rule. A Race records which Wind Band the boat was set to; under
a pure JSONB payload that pointer would be a positional index or a magic key, both of which
ADR 0007 forbids.

```sql
CREATE TABLE IF NOT EXISTS rig_tune_bands (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id  UUID NOT NULL,
    kind        boat_setup_kind NOT NULL DEFAULT 'rig_tune',
    low_kt      NUMERIC NOT NULL,
    high_kt     NUMERIC,          -- NULL is the open-ended top band
    is_base     BOOLEAN NOT NULL DEFAULT FALSE,
    label       TEXT,
    note        TEXT,
    shrouds     JSONB NOT NULL,

    FOREIGN KEY (version_id, kind)
        REFERENCES boat_setup_versions (id, kind) ON DELETE CASCADE,
    CONSTRAINT rig_tune_bands_kind_fixed CHECK (kind = 'rig_tune'),
    -- lets races reference (version, band) as one unit
    UNIQUE (version_id, id),
    UNIQUE (version_id, low_kt),

    CONSTRAINT band_bounds_ordered CHECK (high_kt IS NULL OR high_kt > low_kt),
    CONSTRAINT band_low_non_negative CHECK (low_kt >= 0),
    CONSTRAINT shrouds_positions_present CHECK (
        shrouds ? 'V1' AND shrouds ? 'D1' AND shrouds ? 'D2'
    )
);

-- Exactly one Base Tune per Version, marked by a flag and never by position or name.
CREATE UNIQUE INDEX rig_tune_bands_one_base
    ON rig_tune_bands (version_id) WHERE is_base;

-- Exactly one open-ended band per Version, which falls out for free.
CREATE UNIQUE INDEX rig_tune_bands_one_open_top
    ON rig_tune_bands (version_id) WHERE high_kt IS NULL;
```

Contiguity ("every wind speed falls in exactly one band") stays application-level: expressing
it in SQL needs a window function over siblings, which a `CHECK` cannot do and a trigger can
only do awkwardly.

`label` is free text from the tuning guide the numbers came from. It is deliberately *not* an
enum and must never be indexed against the dashboard's Light / Medium / Heavy / Storm
classification — `CONTEXT.md` records that rig `medium` is 15–20 kt while the display's
`classifyBin` calls that range `heavy`, so keying one off the other compiles and returns the
wrong rig.

## `calibration_events`

Hangs off the `instrument_calibration` artifact rather than off `boats`, which gives the
Calibration Log a single join and adds no fourth `boat_id`.

```sql
CREATE TABLE IF NOT EXISTS calibration_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id   UUID NOT NULL,
    kind          boat_setup_kind NOT NULL DEFAULT 'instrument_calibration',
    occurred_on   DATE NOT NULL,
    type          calibration_event_type NOT NULL,
    channels      calibration_channel[] NOT NULL,
    note          TEXT NOT NULL,
    created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (artifact_id, kind)
        REFERENCES boat_setup_artifacts (id, kind) ON DELETE CASCADE,
    CONSTRAINT calibration_events_kind_fixed CHECK (kind = 'instrument_calibration'),

    CONSTRAINT channels_non_empty CHECK (ARRAY_LENGTH(channels, 1) >= 1),
    CONSTRAINT note_non_empty CHECK (BTRIM(note) <> ''),
    -- an autocompensation is a compass operation by definition
    CONSTRAINT autocompensation_is_hdg_only CHECK (
        type <> 'autocompensation' OR channels = ARRAY['HDG']::calibration_channel[]
    )
);

CREATE INDEX calibration_events_timeline_idx
    ON calibration_events (artifact_id, occurred_on);
```

Both rules that ADR 0005 states in prose are in the database, and the same enum names the keys
inside an Instrument Calibration payload, so the two representations of a channel cannot drift.

Duplicate channels within one array are left to the application: `CHECK` cannot contain the
subquery that would catch them.

The archive's one existing event is hand-entered at seed time:
`2026-07-04`, `autocompensation`, `{HDG}`.

## `recordings`

```sql
CREATE TABLE IF NOT EXISTS recordings (
    -- No DEFAULT: the id is generated client-side so the bytes can be moved to their
    -- permanent path *before* the transaction commits. See ADR 0013.
    id                UUID PRIMARY KEY,
    filename          TEXT NOT NULL,
    content_sha256    TEXT NOT NULL,
    source_columns    TEXT[] NOT NULL,
    date_order        recording_date_order NOT NULL DEFAULT 'MDY',
    trailing_newline  BOOLEAN NOT NULL DEFAULT TRUE,
    row_count         INTEGER NOT NULL,
    first_row_time    TIMESTAMP NOT NULL,
    last_row_time     TIMESTAMP NOT NULL,
    uploaded_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT row_count_positive CHECK (row_count > 0),
    CONSTRAINT row_times_ordered CHECK (last_row_time >= first_row_time),
    CONSTRAINT source_columns_non_empty CHECK (ARRAY_LENGTH(source_columns, 1) >= 1)
);

-- Plain, NOT unique. A duplicate hash is a legitimate second Race from one file, so ADR 0009
-- makes it a confirmation and never a refusal; a unique constraint would break that path.
CREATE INDEX recordings_content_sha256_idx ON recordings (content_sha256);
```

`source_columns` holds the header **exactly as recorded, in order** — `'TWA (calc)'` with its
space and parentheses, not the SQL name. Two header variants exist across the archive, identical
apart from `RPM` inserted mid-header at position 16, and storing the header verbatim means a
third variant needs no migration.

`row_count`, `first_row_time`, `last_row_time` and `trailing_newline` are facts about the file,
written once at transcription and never updated. They cannot drift, because the rows they
summarise are immutable. All 13 archive files have `trailing_newline = TRUE`; it is recorded
rather than assumed so the round-trip test can be byte-exact.

`date_order` is how an ambiguous `MM/DD` vs `DD/MM` reading is corrected without re-uploading:
`date_verbatim` on each row is untouched, so re-parsing is always possible.

## `recording_rows` — the Transcription

Twenty-one columns, one per header field, in file order. Sane SQL names for the three awkward
headers; the verbatim header lives in `recordings.source_columns`.

```sql
CREATE TABLE IF NOT EXISTS recording_rows (
    recording_id      UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    row_index         INTEGER NOT NULL,          -- 1-based, preserves file order

    date_verbatim     TEXT NOT NULL,             -- 'MM/DD/YYYY HH:MM:SS', exactly as written
    row_time          TIMESTAMP NOT NULL,        -- parsed, naive, no conversion

    longitude         NUMERIC,
    latitude          NUMERIC,
    cog               NUMERIC,
    sog               NUMERIC,
    twd               NUMERIC,
    tws               NUMERIC,
    twa               NUMERIC,
    gwd               NUMERIC,
    gws               NUMERIC,
    ctw               NUMERIC,
    stw               NUMERIC,
    pol               NUMERIC,
    pre               NUMERIC,
    xte               NUMERIC,
    rpm               NUMERIC,
    twa_calc          NUMERIC,                   -- 'TWA (calc)'
    awa_calc          NUMERIC,                   -- 'AWA (calc)'
    aws_calc          NUMERIC,                   -- 'AWS (calc)'
    alarm             TEXT,
    observations      TEXT,

    -- Unrecognised headers, keyed by the verbatim header name, values as written.
    extras            JSONB,

    -- The only thing Layline computes onto a row, because it is a pure function of that
    -- row's own values (ADR 0008).
    water_referenced  BOOLEAN GENERATED ALWAYS AS
                          (stw IS NOT NULL AND ctw IS NOT NULL) STORED,

    PRIMARY KEY (recording_id, row_index),
    CONSTRAINT row_index_positive CHECK (row_index >= 1)
);

CREATE INDEX recording_rows_time_idx ON recording_rows (recording_id, row_time);
```

Row Quality (Frozen / Not Water-Referenced / Low-Speed) and Gap Seconds are **not** columns.
ADR 0009 computes them at read over the whole Transcription and then filters to the window, so a
Dropout beginning before the start is still seen.

Nothing is dropped, including the five columns that carry zero information in this archive:
`PRE`, `XTE` and `OBSERVATIONS` are empty in all 6,337 rows, `ALARM` has the single value
`None`, and `RPM` is `0.0` wherever present. Deciding which columns are redundant is exactly the
judgement `CONTEXT.md` refuses to make.

### Why bare `numeric`

Not taste, and a refinement of what decision 12 originally said (`numeric(6,1)`,
`numeric(13,10)`). ADR 0008's commitment is a round trip: re-parsing the stored bytes reproduces
the stored rows exactly.

- `double precision` cannot round-trip `20.1`. That alone rules it out.
- `numeric(6,1)` round-trips today's data — every channel is exactly 1 dp, longitude and
  latitude exactly 10 dp — but it *silently rounds* anything with more digits. A declared scale
  is a rounding rule, and a rounding rule is precisely what ADR 0008 forbids.
- Bare `numeric` is arbitrary-precision and preserves scale, so `0.0` stores and renders as
  `0.0`, and a future export at 2 dp is stored rather than mangled.

Observed precision belongs in a `COMMENT ON COLUMN`, not in a type that enforces it.

### The round-trip test

Given `recordings.source_columns`, `date_order` and `trailing_newline`, plus the rows ordered by
`row_index`: join each row's values with `;`, rendering `NULL` as the empty string and
`date_verbatim` in slot 0, terminate lines with LF, and the SHA-256 of the result equals
`recordings.content_sha256`. That is a test, not a claim.

## `races`

```sql
CREATE TABLE IF NOT EXISTS races (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boat_id           UUID NOT NULL REFERENCES boats(id) ON DELETE RESTRICT,

    -- 1:1, and the Race is the child. This is what makes ADR 0010's split structural:
    -- the immutable half is a different table from the editable half.
    recording_id      UUID NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,

    title             TEXT,                  -- optional, free text, never generated
    window_start      TIMESTAMP NOT NULL,
    window_finish     TIMESTAMP NOT NULL,

    polar_version_id                  UUID,
    crossover_chart_version_id        UUID,
    rig_tune_version_id               UUID,
    instrument_calibration_version_id UUID,
    rig_tune_band_id                  UUID,

    -- Constant tags, so each pointer's kind is enforced by the database rather than by
    -- convention. All five pointers are nullable and these FKs are MATCH SIMPLE, so a NULL
    -- pointer satisfies them. See ADR 0011.
    polar_kind        boat_setup_kind NOT NULL DEFAULT 'polar',
    crossover_kind    boat_setup_kind NOT NULL DEFAULT 'crossover_chart',
    rig_tune_kind     boat_setup_kind NOT NULL DEFAULT 'rig_tune',
    calibration_kind  boat_setup_kind NOT NULL DEFAULT 'instrument_calibration',

    created_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (polar_version_id, polar_kind)
        REFERENCES boat_setup_versions (id, kind) ON DELETE RESTRICT,
    FOREIGN KEY (crossover_chart_version_id, crossover_kind)
        REFERENCES boat_setup_versions (id, kind) ON DELETE RESTRICT,
    FOREIGN KEY (rig_tune_version_id, rig_tune_kind)
        REFERENCES boat_setup_versions (id, kind) ON DELETE RESTRICT,
    FOREIGN KEY (instrument_calibration_version_id, calibration_kind)
        REFERENCES boat_setup_versions (id, kind) ON DELETE RESTRICT,

    -- The recorded Wind Band must belong to the frozen Rig Tune Version.
    FOREIGN KEY (rig_tune_version_id, rig_tune_band_id)
        REFERENCES rig_tune_bands (version_id, id) ON DELETE RESTRICT,

    CONSTRAINT kinds_fixed CHECK (
        polar_kind = 'polar' AND crossover_kind = 'crossover_chart'
        AND rig_tune_kind = 'rig_tune' AND calibration_kind = 'instrument_calibration'
    ),
    -- MATCH SIMPLE would let a band be set with no Version, which is meaningless.
    CONSTRAINT band_requires_rig_tune CHECK (
        rig_tune_band_id IS NULL OR rig_tune_version_id IS NOT NULL
    ),
    CONSTRAINT race_window_ordered CHECK (window_finish > window_start)
);

CREATE INDEX races_window_start_idx ON races (window_start DESC);
```

Only four Version pointers, because a Crossover Chart and its Sail Definitions are one artifact
(ADR 0012). There is no `venue` column and no `date` column: every Recording Row carries GPS, so
a venue string would be Testimony duplicating something Position-Derived and more trustworthy,
and a Race's date derives from `window_start`.

All five pointers are nullable and all five are writable. Null means *not recorded*, never a
backdated guess — every one of the 13 seeded races carries a null Rig Tune pointer, because v1 of
the Rig Tune is the boat's own unmeasured tune. "Frozen" means the pointer does not follow the
current Version; it does not mean a person cannot change it.

### The window must intersect the data

ADR 0009's second blocking condition, as a deferred constraint trigger rather than as a
validator the amendment path could walk around. LAY-95 requires the two refusals to be shared
rather than reimplemented, and a database constraint is the strongest available form of sharing.

```sql
CREATE OR REPLACE FUNCTION public.enforce_race_window_intersects_rows()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.recording_rows r
        WHERE r.recording_id = NEW.recording_id
          AND r.row_time >= NEW.window_start
          AND r.row_time <= NEW.window_finish
    ) THEN
        RAISE EXCEPTION 'the Race Window contains no Recording Rows';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER races_window_intersects_rows
    AFTER INSERT OR UPDATE OF window_start, window_finish, recording_id ON races
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_race_window_intersects_rows();
```

A window reaching *past* the last row is explicitly legal — `08-22-26-glr`'s finish is 19.25 min
past its last row, which means the recording dropped out before the race finished. That is
stated on the race page, never refused, so no constraint bounds the window by
`recordings.last_row_time`.

## Annotations

Two kinds, each an ordered list of timestamped entries on the Race. An entry's `at` is
deliberately unbounded by the window: the sails were set before the start, and the resolution
rule is "the entry in force is the latest at or before the row's time, falling back to the
earliest".

```sql
CREATE TABLE IF NOT EXISTS race_sail_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id     UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    at          TIMESTAMP NOT NULL,
    reef        reef_state NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (race_id, at)
);

-- A Sail Configuration is a set of sails, so it is stored as a set. The composite primary
-- key is the set semantics: no sail twice in one entry, and a real FK into the inventory.
CREATE TABLE IF NOT EXISTS race_sail_entry_sails (
    entry_id  UUID NOT NULL REFERENCES race_sail_entries(id) ON DELETE CASCADE,
    sail_id   UUID NOT NULL REFERENCES sails(id) ON DELETE RESTRICT,
    PRIMARY KEY (entry_id, sail_id)
);

CREATE TABLE IF NOT EXISTS race_sea_state_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id     UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    at          TIMESTAMP NOT NULL,
    sea_state   sea_state NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (race_id, at)
);
```

An entry with no sails is bare poles and is a bug, so it is refused — deferred, because the
entry row necessarily exists before its sails do:

```sql
CREATE OR REPLACE FUNCTION public.enforce_sail_entry_non_empty()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.race_sail_entry_sails s WHERE s.entry_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'a Sail Configuration must name at least one sail';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER race_sail_entries_non_empty
    AFTER INSERT OR UPDATE ON race_sail_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_sail_entry_non_empty();
```

An **empty list of entries** is a different thing and entirely normal: six of the archive's
thirteen recordings have no sail or sea-state record at all, which means the sailor does not
remember the race. Nothing defaults it.

## `updated_at`, and why the annotation triggers are load-bearing

ADR 0010 makes `updated_at` the entire provenance of an Amendment and keys any future cache on
it. The most common amendment — adding, editing or deleting a sail change — writes to an
annotation table and never touches the `races` row, so a plain trigger on `races` would not fire
and the race page would serve a stale derivation. These three triggers are correctness, not
belt-and-braces.

```sql
-- `update_updated_at_column()` already exists (20260501215158_create_profiles_table.sql).
CREATE TRIGGER races_updated_at BEFORE UPDATE ON races
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- likewise on boats, sails, boat_setup_artifacts, calibration_events.

CREATE OR REPLACE FUNCTION public.touch_race_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    UPDATE public.races SET updated_at = NOW()
    WHERE id = COALESCE(NEW.race_id, OLD.race_id);
    RETURN NULL;
END;
$$;

CREATE TRIGGER race_sail_entries_touch_race
    AFTER INSERT OR UPDATE OR DELETE ON race_sail_entries
    FOR EACH ROW EXECUTE FUNCTION public.touch_race_updated_at();

CREATE TRIGGER race_sea_state_entries_touch_race
    AFTER INSERT OR UPDATE OR DELETE ON race_sea_state_entries
    FOR EACH ROW EXECUTE FUNCTION public.touch_race_updated_at();

-- The join table changes a Race's Testimony too, and has to reach the Race through its entry.
CREATE OR REPLACE FUNCTION public.touch_race_updated_at_via_entry()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    UPDATE public.races r SET updated_at = NOW()
    FROM public.race_sail_entries e
    WHERE e.id = COALESCE(NEW.entry_id, OLD.entry_id) AND r.id = e.race_id;
    RETURN NULL;
END;
$$;

CREATE TRIGGER race_sail_entry_sails_touch_race
    AFTER INSERT OR DELETE ON race_sail_entry_sails
    FOR EACH ROW EXECUTE FUNCTION public.touch_race_updated_at_via_entry();
```

## Deleting a Race

ADR 0010 says deleting a Race takes its Annotations, its Transcription and its stored bytes. The
foreign key runs the other way — the Race is the child of the Recording — so the operation is
expressed against the **Recording**:

```sql
DELETE FROM recordings WHERE id = $1;
```

That takes the Race, its annotations, its join rows and its ~1,700 Recording Rows in one
statement. It is correct precisely because `recording_id` is `UNIQUE`: there is no second Race to
orphan. The Storage object is deleted **after** the transaction commits, for the reason in
ADR 0013.

## Row-Level Security

Every table: `ENABLE ROW LEVEL SECURITY`, one `SELECT` policy for any signed-in user, one
`FOR ALL` admin policy for writes. Policies are OR'd, so the overlap on `SELECT` is harmless.

```sql
ALTER TABLE races ENABLE ROW LEVEL SECURITY;

CREATE POLICY "races readable by signed-in users"
    ON races FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "races writable by admins"
    ON races FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));
```

Three things this settles, and one thing it must not do:

- **A signed-in user with `role = NULL` can read.** This closes LAY-95's question 5. `role` is
  `NULL` by default at sign-up and there is no role-assignment UI, so requiring `'user'` would
  lock every self-signed-up account out of a section the drawer shows them. It also matches the
  Storage policy already shipped in `20260909190000_create_boat_storage_bucket.sql`
  (`FOR SELECT TO authenticated USING (bucket_id = 'boat')`) — anything stricter here would let
  a user download a recording's bytes but not see the race list that names it.
- **`(SELECT public.is_admin())`** wrapped in a subselect, and `TO authenticated` on every
  policy, so the planner hoists the predicate into an initPlan and evaluates it once per
  statement instead of once per row. Copy this exactly.
- **`recording_rows` and `boat_setup_versions` get no `DELETE` policy, and `recording_rows` gets
  no `UPDATE` policy.** That is how the Transcription's immutability is enforced rather than
  merely documented. Cascades still work, because referential actions bypass RLS — so a row can
  only be deleted by deleting its Recording.
- **Never emit `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`.** `postgres` lost that
  ownership on 2025-04-21 and it fails `42501`. Because a migration is one transaction, the
  abort surfaces on the *following* statement, which makes an innocent `CREATE POLICY` look like
  the culprit. This bit the storage migration once already.

Guests see nothing: with no `anon` policy anywhere, an unauthenticated request returns zero rows
rather than an error.

## Payload shapes

Validated by Zod schemas in `services/`, following ADR 0001's precedent that application code
owns JSON structure. The `CHECK`s above are presence tests only — enough that a malformed row
cannot exist, without pretending SQL does schema validation.

**Polar** (16 TWA × 9 TWS = 144 cells, boat speed in knots):

```json
{
  "twa_axis": [30, 35, 40, 45, 52, 60, 75, 90, 100, 110, 120, 135, 150, 160, 170, 180],
  "tws_axis": [4, 6, 8, 10, 12, 14, 16, 20, 24],
  "boat_speed": [[3.2, 4.4, "…9 values"], "…16 rows"],
  "source": { "format": "orc-pol", "header_token": "twa/tws" }
}
```

Rows 30° and 35° are manufactured filler — row 35 is exactly twice row 30 in every column — so
any consumer must suppress angles below about 45°. That is a display rule, not a storage rule:
the filler is stored as given.

**Crossover Chart**, now carrying its own Sail Definitions (26 TWA × 13 TWS = 338 cells):

```json
{
  "twa_axis": ["…26 values, 35–180"],
  "tws_axis": [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 30],
  "cells": [[1, 1, "…13 values"], "…26 rows"],
  "sail_definitions": [
    { "number": 1, "label": "Main + Jib 1" },
    { "number": 8, "label": "Main + A2" }
  ],
  "source": { "format": "qtvlm-sailselect", "header_token": "TWA/TWS" }
}
```

Zod enforces what SQL cannot reach: every cell resolves to a definition, and a definition need
not appear in any cell (number 7 is referenced by zero cells and is legal). Definitions are
authored with the corrected sail names at seed time — `A3`, not "Reaching Spin" — because nothing
outside Layline reads those files, so v1 starts right rather than recording a correction to a
name Layline never used.

**Instrument Calibration**, keyed by the same enum the database uses:

```json
{
  "AWA": { "offset": 2.0 },
  "AWS": { "multiplier": 1.02, "offset": 0.0 },
  "STW": { "multiplier": 1.02, "offset": 0.0 },
  "HDG": { "offset": 0.0 }
}
```

`multiplier` is *absent* for `AWA` and `HDG`, not null — those channels have no multiplier on the
display. Applied as `multiplier × reading + offset`, in the display's own encoding: `1.02`, never
`+2%`.

**Rig Tune band `shrouds`**, on the band row rather than the Version:

```json
{
  "V1": { "port": { "gap_mm": 12.5, "turns_from_base": -1.5 },
          "starboard": { "gap_mm": 12.5, "turns_from_base": -1.5 } },
  "D1": { "…" },
  "D2": { "…" }
}
```

Both figures for every position and side, per ADR 0007: turns are how the rig is re-geared at the
dock, the gap is how it is restored when nothing is trusted, and neither derives from the other
because no thread pitch is recorded. On the Base Tune band the gaps are absolute and
`turns_from_base` is `0`.

**Recording row `extras`**, keyed by the verbatim header:

```json
{ "DPH": "4.2", "HEEL": "-12.0" }
```

`NULL` when the header holds nothing unrecognised, which is every file in the archive today.
This is insurance against a fourth header variant, not a response to observed variance.

## Storage paths

Derived from `recordings.id` / `boat_setup_versions.id` plus the stored `filename`, using the
convention fixed by the storage migration:

```
recordings/{recording_id}/{filename}
boat-setup/{kind}/{version_id}/{filename}
tmp/{user_id}/{upload_id}/{filename}
```

`{kind}` is the `boat_setup_kind` label verbatim (`crossover_chart`), so there is no mapping to
get wrong. One TypeScript helper is the only implementation — deliberately no SQL function, since
two implementations of a derivation is the thing "derive, don't store" was avoiding.

## What is deliberately not here

- **Row Quality and Gap Seconds** — computed at read (ADR 0009).
- **A detector version column.** LAY-93 listed one, so this is a deliberate departure rather than
  an omission. It was asked for so a race page can say which rules produced what it shows — but
  since nothing computed is stored, a column would record which detector ran *at upload*, which is
  not the detector whose output the page is displaying. The requirement is met by rendering the
  detector version as a constant from `services/`, which is by construction the one that just ran.
- **Measured Offsets, Polar Efficiency, VMG Efficiency, Target Speed** — all derived, and the
  numerator question for Polar Efficiency is still open.
- **Maneuver detection** — a second axis from Row Quality, and not this effort's.
- **Polar penalties** — deliberately not stored (ADR 0006).
- **A `venue`, a race `date`, a `role` column change, or any overlap check between two Races
  from one file** — each ruled out above or in ADR 0010.

## Build notes for the migration

1. One migration file, following the style of `20260909190000_create_boat_storage_bucket.sql`:
   heavy `COMMENT ON TABLE` / `COMMENT ON COLUMN`, `CREATE TABLE IF NOT EXISTS`, explicit
   policies.
2. `boats`, `sails` and the four `boat_setup_artifacts` rows are seeded by the migration. Nothing
   else is: the 13 races go in through the upload UI, which is the acceptance test.
3. `metadata.yaml` is **not** read by anything. Annotations and the corrected sea-state
   vocabulary are typed by hand at seed time.
4. The 17-check verification suite from LAY-92 has still only been run against a local stack; the
   hosted re-run is outstanding and this migration should be verified the same way.
