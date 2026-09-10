-- The race archive and the four Boat Setup artifacts.
--
-- Design: docs/design-docs/race-archive-schema.md (settled by LAY-93; where this file and
-- that document disagree, the document wins).
-- Reasoning: docs/adr/0005 (calibration as Version plus event log),
--            docs/adr/0007 (what a Rig Tune records),
--            docs/adr/0008 (provenance, not rawness),
--            docs/adr/0009 (quality gates, row quality computed at read),
--            docs/adr/0010 (a Race is Testimony over an immutable Transcription),
--            docs/adr/0011 (one versions table with JSONB payloads),
--            docs/adr/0012 (frozen config snapshots per race),
--            docs/adr/0013 (orphaned bytes over orphaned rows).
--
-- Nothing here is user-facing. What it delivers is a schema where the invariants every
-- later ticket relies on are enforced by Postgres rather than by discipline. The suite that
-- tries to break each one is scripts/verify-race-archive-schema.sql.
--
-- Two conventions run through the whole file and are not style choices:
--
--   * `timestamp` for anything in a recording's own naive wall-clock frame — Recording Row
--     times, the Race Window, annotation entry times — because the qtVlm export carries no
--     offset and any conversion at storage time could silently move a boundary.
--     `timestamptz` only for moments in Layline's own life: created_at, updated_at,
--     recorded_at. A sailor-supplied calendar date is `date`.
--
--   * Bare `numeric` for every recorded channel. Not `numeric(6,1)` and not
--     `double precision`. ADR 0008's commitment is a round trip, `double precision` cannot
--     round-trip 20.1, and a declared scale is a rounding rule — precisely what ADR 0008
--     forbids. Observed precision is recorded in a COMMENT, never in the type.
--
-- Storage paths are derived, never stored. The one implementation is lib/storage/paths.ts;
-- there is deliberately no SQL equivalent, so there is nothing to drift.
--
-- Seeded here: the boat, its six sails, and the four boat_setup_artifacts rows. Nothing
-- else. There is no importer and no backfill — the owner enters the archive by hand through
-- the finished UI as ordinary use, and that is the acceptance test for the tickets above.

-- ===========================================================================
-- Enums
-- ===========================================================================
-- Enums rather than TEXT + CHECK throughout. Adding a value is a migration either way, so
-- the cost is equal and the enum buys generated types and a name that appears in the error.
--
-- Guarded rather than IF NOT EXISTS, which CREATE TYPE does not have.

DO $$ BEGIN
    CREATE TYPE boat_setup_kind AS ENUM (
        'polar', 'crossover_chart', 'rig_tune', 'instrument_calibration'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE calibration_channel AS ENUM ('AWA', 'AWS', 'STW', 'HDG');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE calibration_event_type AS ENUM ('autocompensation', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sea_state AS ENUM ('calm', 'slight', 'moderate', 'rough');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Will gain 'reef-2' if Handsome Pete's main ever grows a second reef point. That is
-- ALTER TYPE ... ADD VALUE, a non-blocking one-liner.
DO $$ BEGIN
    CREATE TYPE reef_state AS ENUM ('full', 'reef-1');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Exactly one value is in use: all 13 archive files are MDY, 6 of them unambiguously (a day
-- > 12). 'DMY' exists so a wrong reading of an ambiguous file is fixable without re-upload.
DO $$ BEGIN
    CREATE TYPE recording_date_order AS ENUM ('MDY', 'DMY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE boat_setup_kind IS
    'The four Boat Setup artifacts. The label is used verbatim in the Storage path boat-setup/{kind}/{version_id}/{filename}, so there is no mapping to get wrong.';
COMMENT ON TYPE calibration_channel IS
    'The four calibrated instrument channels. The same enum names the keys inside an Instrument Calibration payload, so the two representations cannot drift.';
COMMENT ON TYPE recording_date_order IS
    'How a Recording Row''s date_verbatim is read. Correctable in place, because date_verbatim is untouched and re-parsing is always possible.';

-- ===========================================================================
-- boats
-- ===========================================================================
-- A table rather than a constant because boat_id is what makes the four artifacts and the
-- races hang off something nameable, and because the mockup's placeholder identity
-- (Wayward Wind / J/105) needs somewhere real to be replaced.

CREATE TABLE IF NOT EXISTS boats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    model       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly one boat exists. This is one line to drop when a second one is real, and until
-- then it stops every read path from having to decide what to do with the second row.
CREATE UNIQUE INDEX IF NOT EXISTS boats_singleton ON boats ((TRUE));

COMMENT ON TABLE boats IS
    'The boat every artifact and race hangs off. Exactly one row, enforced by boats_singleton.';
COMMENT ON COLUMN boats.name IS 'The boat''s name, as the sailor writes it.';
COMMENT ON COLUMN boats.model IS 'Design, e.g. Beneteau 10R. Free text: PHRF fleets are mixed and nothing keys off this.';

INSERT INTO boats (name, model)
SELECT 'Handsome Pete', 'Beneteau 10R'
WHERE NOT EXISTS (SELECT 1 FROM boats);

-- ===========================================================================
-- sails -- the Sail Inventory
-- ===========================================================================
-- A table, not an enum and not a JSONB list, because a Sail Configuration points at it and
-- the thing a Sail Configuration points at should be a row. The immediate payoff is the
-- rename this project is about to perform: `reaching-spin` becoming `A3` is one UPDATE of
-- one row rather than a text rewrite across every entry that mentions it, which is exactly
-- the failure CONTEXT.md records as three spellings of one sail.

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

COMMENT ON TABLE sails IS
    'The boat''s Sail Inventory. One of the three tables that carry boat_id; everything else reaches the boat through one of them.';
COMMENT ON COLUMN sails.key IS 'Stable slug a Sail Configuration is read against: main, jib-1, A2. Never rendered.';
COMMENT ON COLUMN sails.label IS 'What the sailor sees. Renaming a sail is an UPDATE of this column and nothing else.';
COMMENT ON COLUMN sails.retired_on IS
    'Retires a sail out of the picker. Exists because race_sail_entry_sails references sails ON DELETE RESTRICT: a sail that has been flown cannot be deleted, only retired.';

INSERT INTO sails (boat_id, key, label, sort_order)
SELECT b.id, s.key, s.label, s.sort_order
FROM boats b, (VALUES
    ('main',  'Main',  1),
    ('jib-1', 'Jib 1', 2),
    ('jib-2', 'Jib 2', 3),
    ('jib-3', 'Jib 3', 4),
    ('A2',    'A2',    5),
    ('A3',    'A3',    6)
) AS s(key, label, sort_order)
ON CONFLICT (boat_id, key) DO NOTHING;

-- ===========================================================================
-- boat_setup_artifacts
-- ===========================================================================
-- Four rows, forever. current_version_id is nullable so the four rows can exist before
-- anything has been uploaded, which is the state the app ships in.

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

COMMENT ON TABLE boat_setup_artifacts IS
    'One row per Boat Setup kind, holding the current pointer. Four rows, forever.';
COMMENT ON COLUMN boat_setup_artifacts.current_version_id IS
    'The Version in force. Null until the first Version exists; moves forward only and can never be cleared (boat_setup_artifacts_forward_only_current).';

INSERT INTO boat_setup_artifacts (boat_id, kind)
SELECT b.id, k.kind FROM boats b,
    (VALUES ('polar'::boat_setup_kind), ('crossover_chart'), ('rig_tune'),
            ('instrument_calibration')) AS k(kind)
ON CONFLICT (boat_id, kind) DO NOTHING;

-- ===========================================================================
-- boat_setup_versions
-- ===========================================================================
-- One table for all four kinds. The machinery -- version number, dates, note, author,
-- filename -- is identical across kinds and carries every invariant worth enforcing; the
-- payloads share nothing and are never queried cell-wise. ADR 0011 has the argument.

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

    -- A Rig Tune's value rests as much on its note as on its numbers: the per-band spread
    -- is only one to three turns because the headstay is not adjustable on this boat
    -- (ADR 0007).
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

    -- Presence only. Structure is validated by Zod on write; see the design doc's
    -- "Payload shapes". These CHECKs are enough that a malformed row cannot exist, without
    -- pretending SQL does schema validation.
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

CREATE INDEX IF NOT EXISTS boat_setup_versions_artifact_idx
    ON boat_setup_versions (artifact_id, version_number DESC);

COMMENT ON TABLE boat_setup_versions IS
    'Every Version of every Boat Setup kind, payload as JSONB. Immutable, with one exception: an instrument_calibration Version may be corrected in payload, note and effective_from. See ADR 0011.';
COMMENT ON COLUMN boat_setup_versions.kind IS
    'Duplicated from the parent artifact and tied to it by a composite foreign key, which is what lets rig_tune_bands and races state the kind they point at. See ADR 0011.';
COMMENT ON COLUMN boat_setup_versions.effective_from IS
    'The calendar date the sailor says this Version took effect. Correctable on an instrument_calibration Version.';
COMMENT ON COLUMN boat_setup_versions.recorded_at IS
    'When Layline first recorded this Version. Immutable, including through a calibration correction: there is no history, so it keeps meaning when this Version was first entered.';
COMMENT ON COLUMN boat_setup_versions.created_by IS
    'NOT NULL for every kind. ADR 0005 ruled calibration events needed no author on the grounds of one boat and one writer; that is true today and would be a schema change the day a second admin exists, so it is uniform now. ON DELETE RESTRICT means deleting an admin fails while their Versions stand -- deliberately, because "who tuned the rig" is not something to erase silently.';
COMMENT ON COLUMN boat_setup_versions.filename IS
    'The sailor''s own filename, verbatim, for the two file-backed kinds. Present exactly when the kind is polar or crossover_chart. Nothing ever parses the Storage path to recover it.';
COMMENT ON COLUMN boat_setup_versions.content_sha256 IS
    'Hex SHA-256 of the stored bytes. Present exactly when filename is.';
COMMENT ON COLUMN boat_setup_versions.payload IS
    'The Version''s content. Empty object for rig_tune, whose bands are rows. Structure is Zod''s to enforce (ADR 0001''s precedent); the CHECK is presence only.';

-- The circular half of the artifact/version relationship. DEFERRABLE INITIALLY DEFERRED so
-- one transaction can insert a Version and point the artifact at it.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'boat_setup_artifacts_current_version_fkey'
          AND conrelid = 'public.boat_setup_artifacts'::REGCLASS
    ) THEN
        ALTER TABLE boat_setup_artifacts
            ADD CONSTRAINT boat_setup_artifacts_current_version_fkey
            FOREIGN KEY (current_version_id) REFERENCES boat_setup_versions(id)
            ON DELETE RESTRICT
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- The current pointer moves forward only
-- ---------------------------------------------------------------------------
-- A constraint trigger rather than a CHECK, because it needs two lookups, and *deferred* so
-- it can be satisfied inside the same transaction that inserts both rows -- which is what
-- the deferrable FK above is for.
--
-- Applied to all four kinds, not just the uploaded ones. "Current" going backwards is a bug
-- in every case, and a Rig Tune is the one where it would be least visible.

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

COMMENT ON FUNCTION public.enforce_forward_only_current_version() IS
    'The current Version pointer may only move to a higher version_number of the same artifact, and can never be cleared once set.';

DROP TRIGGER IF EXISTS boat_setup_artifacts_forward_only_current ON boat_setup_artifacts;
CREATE CONSTRAINT TRIGGER boat_setup_artifacts_forward_only_current
    AFTER INSERT OR UPDATE OF current_version_id ON boat_setup_artifacts
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_forward_only_current_version();

-- ---------------------------------------------------------------------------
-- Immutability, with the calibration exception
-- ---------------------------------------------------------------------------
-- An Instrument Calibration Version is a transcription off a display. Left uncorrectable, a
-- mistyped figure would stand permanently as what the boat ran, and every Race pointing at
-- it would report against a number that never existed. Nothing else in Boat Setup can be
-- edited: an upload is re-uploaded, and a wrong Rig Tune is superseded by the right one.

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

COMMENT ON FUNCTION public.enforce_version_immutability() IS
    'Refuses any UPDATE of a Boat Setup Version except a correction to an instrument_calibration Version''s payload, note or effective_from.';

DROP TRIGGER IF EXISTS boat_setup_versions_immutable ON boat_setup_versions;
CREATE TRIGGER boat_setup_versions_immutable
    BEFORE UPDATE ON boat_setup_versions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_version_immutability();

-- ===========================================================================
-- rig_tune_bands
-- ===========================================================================
-- The one place a payload's interior is pointed at from outside, and therefore the one
-- deliberate departure from ADR 0011's JSONB rule. A Race records which Wind Band the boat
-- was set to; under a pure JSONB payload that pointer would be a positional index or a
-- magic key, both of which ADR 0007 forbids.

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
CREATE UNIQUE INDEX IF NOT EXISTS rig_tune_bands_one_base
    ON rig_tune_bands (version_id) WHERE is_base;

-- Exactly one open-ended band per Version, which falls out for free.
CREATE UNIQUE INDEX IF NOT EXISTS rig_tune_bands_one_open_top
    ON rig_tune_bands (version_id) WHERE high_kt IS NULL;

COMMENT ON TABLE rig_tune_bands IS
    'The Wind Bands of a Rig Tune Version. Rows rather than JSONB because a Race points at one of them (ADR 0007, ADR 0011). Contiguity -- every wind speed falling in exactly one band -- stays application-level: expressing it in SQL needs a window function over siblings, which a CHECK cannot do and a trigger can only do awkwardly.';
COMMENT ON COLUMN rig_tune_bands.low_kt IS 'Inclusive lower bound of the band, in knots of true wind.';
COMMENT ON COLUMN rig_tune_bands.high_kt IS 'Upper bound, or NULL for the open-ended top band. At most one per Version.';
COMMENT ON COLUMN rig_tune_bands.is_base IS
    'The Base Tune, from which turns_from_base is counted. Exactly one per Version (rig_tune_bands_one_base).';
COMMENT ON COLUMN rig_tune_bands.label IS
    'Free text from the tuning guide the numbers came from. Deliberately not an enum, and must never be indexed against the dashboard''s Light / Medium / Heavy / Storm classification: rig `medium` is 15-20 kt while classifyBin calls that range `heavy`, so keying one off the other compiles and returns the wrong rig.';
COMMENT ON COLUMN rig_tune_bands.shrouds IS
    'Per position (V1, D1, D2) and side, both gap_mm and turns_from_base. Both figures always, per ADR 0007: turns are how the rig is re-geared at the dock, the gap is how it is restored when nothing is trusted, and neither derives from the other because no thread pitch is recorded.';

-- ===========================================================================
-- calibration_events
-- ===========================================================================
-- The valueless dated acts (ADR 0005). Hangs off the instrument_calibration artifact rather
-- than off boats, which gives the Calibration Log a single join and adds no fourth boat_id.

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

    -- COALESCE, not a bare ARRAY_LENGTH: array_length('{}', 1) is NULL, and a CHECK that
    -- evaluates to NULL is satisfied, so `>= 1` alone admits the empty array it exists to
    -- refuse.
    CONSTRAINT channels_non_empty CHECK (COALESCE(ARRAY_LENGTH(channels, 1), 0) >= 1),
    CONSTRAINT note_non_empty CHECK (BTRIM(note) <> ''),
    -- an autocompensation is a compass operation by definition
    CONSTRAINT autocompensation_is_hdg_only CHECK (
        type <> 'autocompensation' OR channels = ARRAY['HDG']::calibration_channel[]
    )
);

CREATE INDEX IF NOT EXISTS calibration_events_timeline_idx
    ON calibration_events (artifact_id, occurred_on);

COMMENT ON TABLE calibration_events IS
    'Dated acts on the instruments that changed no stored value -- an autocompensation swing, a paddlewheel clean. Both rules ADR 0005 states in prose are in the database. Duplicate channels within one array are left to the application: a CHECK cannot contain the subquery that would catch them.';
COMMENT ON COLUMN calibration_events.occurred_on IS 'The calendar date of the act, as the sailor recalls it.';
COMMENT ON COLUMN calibration_events.channels IS
    'The channels the act touched. Exactly {HDG} for an autocompensation, which is a compass operation by definition.';
COMMENT ON COLUMN calibration_events.note IS 'Required: an event with no account of itself records nothing.';

-- The archive's one existing event -- 2026-07-04, autocompensation, {HDG} -- is not seeded
-- here, because created_by references auth.users and no user exists at migration time. It
-- is entered by hand through the Calibration Log like every other row.

-- ===========================================================================
-- recordings
-- ===========================================================================

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
    -- COALESCE for the same reason as calibration_events.channels_non_empty.
    CONSTRAINT source_columns_non_empty CHECK (COALESCE(ARRAY_LENGTH(source_columns, 1), 0) >= 1)
);

-- Plain, NOT unique. A duplicate hash is a legitimate second Race from one file, so
-- ADR 0009 makes it a confirmation and never a refusal; a unique constraint would break
-- that path.
CREATE INDEX IF NOT EXISTS recordings_content_sha256_idx ON recordings (content_sha256);

COMMENT ON TABLE recordings IS
    'One qtVlm VDR export, as recorded. The immutable half of ADR 0010''s split; its Race is the child.';
COMMENT ON COLUMN recordings.id IS
    'Supplied by the caller -- deliberately no DEFAULT. The permanent Storage path recordings/{id}/{filename} contains this id, so it must exist before the bytes are moved and therefore cannot be assigned by the INSERT (ADR 0013).';
COMMENT ON COLUMN recordings.filename IS 'The sailor''s own filename, verbatim.';
COMMENT ON COLUMN recordings.content_sha256 IS 'Hex SHA-256 of the stored bytes. Not unique: one file may legitimately back several Recordings.';
COMMENT ON COLUMN recordings.source_columns IS
    'The header exactly as recorded, in order -- ''TWA (calc)'' with its space and parentheses, not the SQL name. Two header variants exist across the archive, identical apart from RPM inserted mid-header at position 16, and storing the header verbatim means a third variant needs no migration.';
COMMENT ON COLUMN recordings.trailing_newline IS
    'Whether the file ends with a newline. All 13 archive files do; it is recorded rather than assumed so the round-trip test can be byte-exact.';
COMMENT ON COLUMN recordings.row_count IS 'A fact about the file, written once. It cannot drift, because the rows it summarises are immutable.';
COMMENT ON COLUMN recordings.first_row_time IS 'The recording''s own naive wall-clock frame -- no offset exists in the file and none is invented.';
COMMENT ON COLUMN recordings.last_row_time IS 'As first_row_time. A Race Window may legitimately reach past this: a recording can drop out before the race finishes.';

-- ===========================================================================
-- recording_rows -- the Transcription
-- ===========================================================================
-- Twenty-one columns, one per header field, in file order. Sane SQL names for the three
-- awkward headers; the verbatim header lives in recordings.source_columns.
--
-- Nothing is dropped, including the five columns that carry zero information in this
-- archive: PRE, XTE and OBSERVATIONS are empty in all 6,337 rows, ALARM has the single
-- value None, and RPM is 0.0 wherever present. Deciding which columns are redundant is
-- exactly the judgement CONTEXT.md refuses to make.

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

CREATE INDEX IF NOT EXISTS recording_rows_time_idx ON recording_rows (recording_id, row_time);

COMMENT ON TABLE recording_rows IS
    'The Transcription: one row per line of the export, in file order. Immutable -- there is no UPDATE or DELETE policy, so a row can only be removed by deleting its Recording. Row Quality (Frozen / Not Water-Referenced / Low-Speed) and Gap Seconds are deliberately not columns: ADR 0009 computes them at read over the whole Transcription and then filters to the window, so a Dropout beginning before the start is still seen.';
COMMENT ON COLUMN recording_rows.row_index IS '1-based, preserving file order. Half of the primary key, so order survives any rewrite of the table.';
COMMENT ON COLUMN recording_rows.date_verbatim IS
    'The date field exactly as written. Kept so an ambiguous MM/DD vs DD/MM reading can be corrected by flipping recordings.date_order rather than re-uploading.';
COMMENT ON COLUMN recording_rows.row_time IS 'date_verbatim parsed under recordings.date_order. Naive, no conversion.';
COMMENT ON COLUMN recording_rows.longitude IS 'Degrees, as recorded. Observed precision in this archive is 10 dp; the type declares no scale, so a future export at another precision is stored rather than rounded.';
COMMENT ON COLUMN recording_rows.latitude IS 'Degrees, as recorded. See longitude.';
COMMENT ON COLUMN recording_rows.cog IS 'Course over ground, degrees. Observed precision 1 dp.';
COMMENT ON COLUMN recording_rows.sog IS 'Speed over ground, knots. Observed precision 1 dp.';
COMMENT ON COLUMN recording_rows.twd IS 'True wind direction, degrees, as the instruments reported it.';
COMMENT ON COLUMN recording_rows.tws IS 'True wind speed, knots, as the instruments reported it. Never adjusted for anything.';
COMMENT ON COLUMN recording_rows.twa IS 'True wind angle, degrees. Signed: negative to port.';
COMMENT ON COLUMN recording_rows.gwd IS 'Ground wind direction, degrees. Empty in some rows; empty is not zero.';
COMMENT ON COLUMN recording_rows.gws IS 'Ground wind speed, knots. Empty in some rows; empty is not zero.';
COMMENT ON COLUMN recording_rows.ctw IS 'Course through water, degrees. Absent when the boat is not water-referenced.';
COMMENT ON COLUMN recording_rows.stw IS 'Speed through water, knots. Absent when the paddlewheel is not reporting.';
COMMENT ON COLUMN recording_rows.pol IS 'The navigation software''s own polar figure for the row. Stored as given; Layline derives nothing from it (ADR 0006).';
COMMENT ON COLUMN recording_rows.pre IS 'Empty in all 6,337 rows of this archive. Kept because deciding a column is redundant is not Layline''s judgement to make.';
COMMENT ON COLUMN recording_rows.xte IS 'Cross-track error. Empty in all 6,337 rows of this archive. Kept for the same reason as pre.';
COMMENT ON COLUMN recording_rows.rpm IS 'Engine RPM. 0.0 wherever present, and absent from one of the two header variants.';
COMMENT ON COLUMN recording_rows.twa_calc IS 'The header ''TWA (calc)'', verbatim in recordings.source_columns.';
COMMENT ON COLUMN recording_rows.awa_calc IS 'The header ''AWA (calc)''.';
COMMENT ON COLUMN recording_rows.aws_calc IS 'The header ''AWS (calc)''.';
COMMENT ON COLUMN recording_rows.alarm IS 'The alarm field as written. Its no-alarm value is UI-localised -- None in this archive, Aucune in a French-locale export -- so nothing compares it against an English string.';
COMMENT ON COLUMN recording_rows.observations IS 'Empty in all 6,337 rows of this archive.';
COMMENT ON COLUMN recording_rows.extras IS
    'Unrecognised header fields, keyed by the verbatim header name, values as written. NULL when the header holds nothing unrecognised, which is every file in the archive today. Insurance against a fourth header variant, not a response to observed variance.';
COMMENT ON COLUMN recording_rows.water_referenced IS
    'The only thing Layline computes onto a row, and generated rather than written because it is a pure function of that row''s own values (ADR 0008). Everything else derived is computed at read.';

-- ===========================================================================
-- races
-- ===========================================================================
-- The editable half of ADR 0010's split. There is no venue column and no date column:
-- every Recording Row carries GPS, so a venue string would be Testimony duplicating
-- something Position-Derived and more trustworthy, and a Race's date derives from
-- window_start.

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

CREATE INDEX IF NOT EXISTS races_window_start_idx ON races (window_start DESC);

COMMENT ON TABLE races IS
    'A Race: its Window over a Recording, its Testimony and the Boat Setup Versions frozen against it. Deleting a Race is expressed against its Recording -- DELETE FROM recordings WHERE id = $1 -- which takes the Race, its annotations and its Transcription in one statement, correct precisely because recording_id is UNIQUE. See ADR 0010, ADR 0012.';
COMMENT ON COLUMN races.recording_id IS 'The Recording this Race is a window over. UNIQUE: a Recording is never shared between Races.';
COMMENT ON COLUMN races.title IS 'Optional, free text, never generated. A race with no title is normal.';
COMMENT ON COLUMN races.window_start IS 'The recording''s own naive wall-clock frame. The window must contain at least one Recording Row (races_window_intersects_rows).';
COMMENT ON COLUMN races.window_finish IS
    'As window_start. A window reaching past the last row is explicitly legal -- 08-22-26-glr''s finish is 19.25 min past its last row, which means the recording dropped out before the race finished. That is stated on the race page, never refused.';
COMMENT ON COLUMN races.polar_version_id IS 'Frozen pointer. NULL means not recorded, never a backdated guess (ADR 0012).';
COMMENT ON COLUMN races.crossover_chart_version_id IS 'Frozen pointer. A Crossover Chart and its Sail Definitions are one artifact, which is why there are four Version pointers and not five (ADR 0012).';
COMMENT ON COLUMN races.rig_tune_version_id IS
    'Frozen pointer. NULL for every race in the existing archive, because v1 of the Rig Tune is the boat''s own unmeasured tune.';
COMMENT ON COLUMN races.rig_tune_band_id IS
    'The Wind Band the boat was set to, tied by composite FK to rig_tune_version_id so a band from another Version cannot be recorded.';
COMMENT ON COLUMN races.updated_at IS
    'The entire provenance of an Amendment (ADR 0010), and what any future cache keys on. Touched by the annotation tables and the sail join table as well as by UPDATEs here, because the commonest amendment never writes to this row.';

-- ---------------------------------------------------------------------------
-- The window must intersect the data
-- ---------------------------------------------------------------------------
-- ADR 0009's second blocking condition, as a deferred constraint trigger rather than as a
-- validator the amendment path could walk around. LAY-95 requires the two refusals to be
-- shared rather than reimplemented, and a database constraint is the strongest available
-- form of sharing. (The first refusal, finish <= start, is race_window_ordered above.)

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

COMMENT ON FUNCTION public.enforce_race_window_intersects_rows() IS
    'Refuses a Race Window with no Recording Row inside it. Deferred, so the window and the rows may be written in either order within one transaction.';

DROP TRIGGER IF EXISTS races_window_intersects_rows ON races;
CREATE CONSTRAINT TRIGGER races_window_intersects_rows
    AFTER INSERT OR UPDATE OF window_start, window_finish, recording_id ON races
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_race_window_intersects_rows();

-- ===========================================================================
-- Annotations
-- ===========================================================================
-- Two kinds, each an ordered list of timestamped entries on the Race. An entry's `at` is
-- deliberately unbounded by the window: the sails were set before the start, and the
-- resolution rule is "the entry in force is the latest at or before the row's time, falling
-- back to the earliest".
--
-- An empty list of entries is entirely normal: six of the archive's thirteen recordings have
-- no sail or sea-state record at all, which means the sailor does not remember the race.
-- Nothing defaults it.

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

COMMENT ON TABLE race_sail_entries IS
    'What the boat was flying, from `at` until the next entry. Testimony: editable, and never generated from anything.';
COMMENT ON COLUMN race_sail_entries.at IS
    'The recording''s own naive wall-clock frame, deliberately unbounded by the Race Window -- the sails were set before the start.';
COMMENT ON TABLE race_sail_entry_sails IS
    'The sails in one Sail Configuration. A set, so no sail can appear twice and every sail is a real row of the inventory. ON DELETE RESTRICT on sail_id: a sail that has been flown is retired, never deleted.';
COMMENT ON TABLE race_sea_state_entries IS
    'The sea state in force from `at`. The corrected four-value vocabulary, not the recording''s.';

-- An entry with no sails is bare poles and is a bug, so it is refused -- deferred, because
-- the entry row necessarily exists before its sails do.

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

COMMENT ON FUNCTION public.enforce_sail_entry_non_empty() IS
    'Refuses a Sail Configuration naming no sails. Deferred, because the entry row necessarily exists before its join rows do.';

DROP TRIGGER IF EXISTS race_sail_entries_non_empty ON race_sail_entries;
CREATE CONSTRAINT TRIGGER race_sail_entries_non_empty
    AFTER INSERT OR UPDATE ON race_sail_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_sail_entry_non_empty();

-- ===========================================================================
-- updated_at
-- ===========================================================================
-- ADR 0010 makes updated_at the entire provenance of an Amendment and keys any future cache
-- on it. The most common amendment -- adding, editing or deleting a sail change -- writes to
-- an annotation table and never touches the races row, so a plain trigger on races would not
-- fire and the race page would serve a stale derivation. The three touch triggers below are
-- correctness, not belt-and-braces.
--
-- update_updated_at_column() already exists (20260501215158_create_profiles_table.sql).

DROP TRIGGER IF EXISTS boats_updated_at ON boats;
CREATE TRIGGER boats_updated_at BEFORE UPDATE ON boats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS sails_updated_at ON sails;
CREATE TRIGGER sails_updated_at BEFORE UPDATE ON sails
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS boat_setup_artifacts_updated_at ON boat_setup_artifacts;
CREATE TRIGGER boat_setup_artifacts_updated_at BEFORE UPDATE ON boat_setup_artifacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS calibration_events_updated_at ON calibration_events;
CREATE TRIGGER calibration_events_updated_at BEFORE UPDATE ON calibration_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS races_updated_at ON races;
CREATE TRIGGER races_updated_at BEFORE UPDATE ON races
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.touch_race_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    UPDATE public.races SET updated_at = NOW()
    WHERE id = COALESCE(NEW.race_id, OLD.race_id);
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.touch_race_updated_at() IS
    'Touches the Race an annotation entry belongs to, so an Amendment that never writes to the races row still moves its updated_at (ADR 0010).';

DROP TRIGGER IF EXISTS race_sail_entries_touch_race ON race_sail_entries;
CREATE TRIGGER race_sail_entries_touch_race
    AFTER INSERT OR UPDATE OR DELETE ON race_sail_entries
    FOR EACH ROW EXECUTE FUNCTION public.touch_race_updated_at();

DROP TRIGGER IF EXISTS race_sea_state_entries_touch_race ON race_sea_state_entries;
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

COMMENT ON FUNCTION public.touch_race_updated_at_via_entry() IS
    'As touch_race_updated_at, but reaching the Race through the sail entry the join row belongs to. Adding a sail to a configuration touches its Race.';

DROP TRIGGER IF EXISTS race_sail_entry_sails_touch_race ON race_sail_entry_sails;
CREATE TRIGGER race_sail_entry_sails_touch_race
    AFTER INSERT OR DELETE ON race_sail_entry_sails
    FOR EACH ROW EXECUTE FUNCTION public.touch_race_updated_at_via_entry();

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
-- Every table: ENABLE ROW LEVEL SECURITY, one SELECT policy for any signed-in user, one
-- FOR ALL admin policy for writes. Policies are OR'd, so the overlap on SELECT is harmless.
--
-- Four things this settles, and one thing it must not do:
--
--   * A signed-in user with role = NULL can read. `role` is NULL by default at sign-up and
--     there is no role-assignment UI, so requiring 'user' would lock every self-signed-up
--     account out of a section the drawer shows them. It also matches the Storage policy in
--     20260909190000_create_boat_storage_bucket.sql (FOR SELECT TO authenticated USING
--     (bucket_id = 'boat')) -- anything stricter here would let a user download a
--     recording's bytes but not see the race list that names it.
--
--   * (SELECT public.is_admin()) wrapped in a subselect, and TO authenticated on every
--     policy, so the planner hoists the predicate into an initPlan and evaluates it once
--     per statement instead of once per row. is_admin() is reused rather than re-derived as
--     an inline subquery on profiles: a policy body runs as `authenticated`, so an inline
--     subquery would be filtered by profiles' own RLS -- which permits it today and would
--     fail closed and silently the moment those policies change.
--
--   * recording_rows and boat_setup_versions get no DELETE policy, and recording_rows gets
--     no UPDATE policy. That is how the Transcription's immutability is enforced rather than
--     merely documented -- an absent policy cannot be argued with. Cascades still work,
--     because referential actions are not subject to RLS, so a row can only be deleted by
--     deleting its Recording.
--
--   * Guests see nothing: with no `anon` policy anywhere, an unauthenticated request returns
--     zero rows rather than an error.
--
-- NEVER add "ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY" to a migration. The
-- postgres role lost that ownership on 2025-04-21 and the statement fails 42501; because a
-- migration is one transaction, the abort surfaces on the *following* statement, which makes
-- an innocent CREATE POLICY look like the culprit. This bit the storage migration once
-- already. This file touches no storage schema object at all.

ALTER TABLE boats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boats readable by signed-in users" ON boats;
CREATE POLICY "boats readable by signed-in users"
    ON boats FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "boats writable by admins" ON boats;
CREATE POLICY "boats writable by admins"
    ON boats FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE sails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sails readable by signed-in users" ON sails;
CREATE POLICY "sails readable by signed-in users"
    ON sails FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "sails writable by admins" ON sails;
CREATE POLICY "sails writable by admins"
    ON sails FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE boat_setup_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boat_setup_artifacts readable by signed-in users" ON boat_setup_artifacts;
CREATE POLICY "boat_setup_artifacts readable by signed-in users"
    ON boat_setup_artifacts FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "boat_setup_artifacts writable by admins" ON boat_setup_artifacts;
CREATE POLICY "boat_setup_artifacts writable by admins"
    ON boat_setup_artifacts FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

-- No DELETE policy: a Version is never removed, only superseded. Cascades from
-- boat_setup_artifacts still work, because referential actions are not subject to RLS.
ALTER TABLE boat_setup_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boat_setup_versions readable by signed-in users" ON boat_setup_versions;
CREATE POLICY "boat_setup_versions readable by signed-in users"
    ON boat_setup_versions FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "boat_setup_versions insertable by admins" ON boat_setup_versions;
CREATE POLICY "boat_setup_versions insertable by admins"
    ON boat_setup_versions FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "boat_setup_versions correctable by admins" ON boat_setup_versions;
CREATE POLICY "boat_setup_versions correctable by admins"
    ON boat_setup_versions FOR UPDATE TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE rig_tune_bands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rig_tune_bands readable by signed-in users" ON rig_tune_bands;
CREATE POLICY "rig_tune_bands readable by signed-in users"
    ON rig_tune_bands FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "rig_tune_bands writable by admins" ON rig_tune_bands;
CREATE POLICY "rig_tune_bands writable by admins"
    ON rig_tune_bands FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE calibration_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calibration_events readable by signed-in users" ON calibration_events;
CREATE POLICY "calibration_events readable by signed-in users"
    ON calibration_events FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "calibration_events writable by admins" ON calibration_events;
CREATE POLICY "calibration_events writable by admins"
    ON calibration_events FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recordings readable by signed-in users" ON recordings;
CREATE POLICY "recordings readable by signed-in users"
    ON recordings FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "recordings writable by admins" ON recordings;
CREATE POLICY "recordings writable by admins"
    ON recordings FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

-- No UPDATE and no DELETE policy: the Transcription is immutable, and an absent policy is a
-- stronger statement of that than a trigger would be. A row goes only by deleting its
-- Recording, which cascades.
ALTER TABLE recording_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recording_rows readable by signed-in users" ON recording_rows;
CREATE POLICY "recording_rows readable by signed-in users"
    ON recording_rows FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "recording_rows insertable by admins" ON recording_rows;
CREATE POLICY "recording_rows insertable by admins"
    ON recording_rows FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE races ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "races readable by signed-in users" ON races;
CREATE POLICY "races readable by signed-in users"
    ON races FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "races writable by admins" ON races;
CREATE POLICY "races writable by admins"
    ON races FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE race_sail_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_sail_entries readable by signed-in users" ON race_sail_entries;
CREATE POLICY "race_sail_entries readable by signed-in users"
    ON race_sail_entries FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "race_sail_entries writable by admins" ON race_sail_entries;
CREATE POLICY "race_sail_entries writable by admins"
    ON race_sail_entries FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE race_sail_entry_sails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_sail_entry_sails readable by signed-in users" ON race_sail_entry_sails;
CREATE POLICY "race_sail_entry_sails readable by signed-in users"
    ON race_sail_entry_sails FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "race_sail_entry_sails writable by admins" ON race_sail_entry_sails;
CREATE POLICY "race_sail_entry_sails writable by admins"
    ON race_sail_entry_sails FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE race_sea_state_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_sea_state_entries readable by signed-in users" ON race_sea_state_entries;
CREATE POLICY "race_sea_state_entries readable by signed-in users"
    ON race_sea_state_entries FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "race_sea_state_entries writable by admins" ON race_sea_state_entries;
CREATE POLICY "race_sea_state_entries writable by admins"
    ON race_sea_state_entries FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));
