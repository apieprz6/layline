-- ===========================================================================
-- One sail vocabulary: a Sail Configuration names a Crossover Chart Sail Definition
-- ===========================================================================
-- Related: docs/adr/0023-one-sail-vocabulary-owned-by-the-crossover-chart.md
--          docs/adr/0012-frozen-config-snapshots-per-race.md (amended by 0023)
--          docs/adr/0011-one-versions-table-with-jsonb-payloads.md
--
-- Layline had two vocabularies for one thing. The Sail Inventory -- six rows in `sails`, seeded
-- by hand -- was what a Sail Configuration pointed at, and the Sail Definitions inside a
-- Crossover Chart payload were what the chart's cells resolved against. Nothing tied them
-- together, so "what the boat was flying" and "what the chart recommended" could not be compared
-- without a human reading both lists and deciding which `A2` was which. ADR 0023 collapses them:
-- the Crossover Chart Version owns the vocabulary, and a Sail Configuration names one Definition
-- of the Version its own Race points at.
--
-- Three consequences, all of them structural rather than documented:
--
--   * The Definitions become rows (`crossover_sail_definitions`), for the same reason
--     `rig_tune_bands` did: Postgres cannot reference into a JSONB array, and a Sail
--     Configuration pointing at "element 3 of a payload" is the positional index ADR 0007 and
--     ADR 0011 both refuse. The payload keeps `sail_definitions` -- it is the file's own
--     testimony, and the rows are a projection of it, written from the same parse in the same
--     transaction (`mint_boat_setup_version` below).
--
--   * A Sail Configuration carries the Version it was named against, and two ordinary composite
--     foreign keys do the rest: one to `races (id, crossover_chart_version_id)`, so an entry
--     cannot disagree with its own Race, and one to `crossover_sail_definitions
--     (version_id, number)`, so it cannot name sail 7 of a Version that never defined one. No
--     triggers. A Race with no chart Version can hold no Configurations at all, which falls out
--     of the first key rather than being checked anywhere.
--
--   * Reef stops being its own field. `reef_state` had exactly two values and duplicated what a
--     Definition already says -- the boat's own chart distinguishes `Main + Jib 1` from
--     `Main reefed + Jib 3` -- so recording it separately meant a Configuration could claim a
--     reef the Definition contradicted.
--
-- This migration is destructive, and deliberately so: **every existing `race_sail_entries` row
-- is deleted**. Those rows name `sails` ids, and there is no honest mapping from an inventory id
-- to a Definition number of a Version that no Race pointed at -- the chart pointer has never been
-- written, so there is nothing to translate against. The archive is hand-entered by its owner
-- through the finished UI, and re-entering a handful of sail changes is cheaper than a backfill
-- that guesses. No chart pointer is backdated either (ADR 0012): null means *not recorded*, and
-- inventing "the Version current in August 2026" for a race sailed before any Version existed
-- would be exactly the fabricated stand-in the core beliefs forbid.
--
-- Verification: scripts/verify-race-archive-schema.sql, sections "sail definitions as rows" and
-- "a Sail Configuration names a Definition of its Race's own Version".

-- ---------------------------------------------------------------------------
-- crossover_sail_definitions
-- ---------------------------------------------------------------------------
-- Keyed (version_id, number) because that pair is the identity: a Definition number means
-- nothing outside the Version that numbered it, and sail 7 of v1 and sail 7 of v2 are two
-- different sails (ADR 0023). No surrogate id, and no Layline slug per Definition -- the
-- number is qtVlm's own identifier and the label is what the sailor sees.
--
-- `kind` is the constant tag ADR 0011 describes, carried so the composite foreign key can state
-- that the Version pointed at is a Crossover Chart and not a Polar. Same shape as
-- rig_tune_bands.

CREATE TABLE IF NOT EXISTS crossover_sail_definitions (
    version_id  UUID NOT NULL,
    kind        boat_setup_kind NOT NULL DEFAULT 'crossover_chart',
    number      INTEGER NOT NULL,
    label       TEXT NOT NULL,

    PRIMARY KEY (version_id, number),

    FOREIGN KEY (version_id, kind)
        REFERENCES boat_setup_versions (id, kind) ON DELETE CASCADE,

    CONSTRAINT crossover_sail_definitions_kind_fixed CHECK (kind = 'crossover_chart'),
    -- Zero is legal and 2.5 is not: the number is an identifier the file gave us, whole and
    -- non-negative, stored as received and never renumbered (services/boat/crossoverPayload.ts).
    CONSTRAINT definition_number_whole CHECK (number >= 0),
    CONSTRAINT definition_label_non_empty CHECK (BTRIM(label) <> '')
);

COMMENT ON TABLE crossover_sail_definitions IS
    'The Sail Definitions of one Crossover Chart Version, projected out of its payload so a Sail Configuration can point at one (ADR 0023). The second payload interior promoted to rows, for the reason rig_tune_bands was: Postgres cannot reference into JSONB (ADR 0011). Written from the same parse as the payload, inside mint_boat_setup_version''s transaction -- a Version''s rows and its payload cannot be written apart.';
COMMENT ON COLUMN crossover_sail_definitions.version_id IS
    'The Crossover Chart Version that numbered this sail. Part of the key: sail identity does not span Versions.';
COMMENT ON COLUMN crossover_sail_definitions.kind IS
    'Constant tag, so the composite foreign key can say the Version pointed at is a Crossover Chart. See ADR 0011.';
COMMENT ON COLUMN crossover_sail_definitions.number IS
    'The chart''s own identifier for this sail, as the file gave it -- what the grid''s cells hold. Not required to start at 1 or to be contiguous.';
COMMENT ON COLUMN crossover_sail_definitions.label IS
    'What the sailor sees, verbatim from the definitions file. Includes whatever the file says about reef, which is why reef is no longer a field of its own (ADR 0023).';

ALTER TABLE crossover_sail_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crossover_sail_definitions readable by signed-in users"
    ON crossover_sail_definitions;
CREATE POLICY "crossover_sail_definitions readable by signed-in users"
    ON crossover_sail_definitions FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "crossover_sail_definitions writable by admins"
    ON crossover_sail_definitions;
CREATE POLICY "crossover_sail_definitions writable by admins"
    ON crossover_sail_definitions FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

-- Every Crossover Chart Version already in the archive, projected. Not a guess: the numbers and
-- labels are read straight out of the payload that Version was minted with, and
-- payload_keys_present has held `sail_definitions` present since the table existed. ON CONFLICT
-- is deliberately absent -- a payload defining one number twice is a Version that should never
-- have been written, and this migration is the right place to find out.
--
-- Skipping a Version already projected is a different thing from swallowing a conflict, and is
-- what makes this statement repeatable: a re-run adds nothing and still raises on a payload that
-- names one number twice.
INSERT INTO crossover_sail_definitions (version_id, number, label)
SELECT v.id,
       (definition->>'number')::INTEGER,
       definition->>'label'
FROM boat_setup_versions v,
     jsonb_array_elements(v.payload->'sail_definitions') AS definition
WHERE v.kind = 'crossover_chart'
  AND jsonb_typeof(v.payload->'sail_definitions') = 'array'
  AND NOT EXISTS (
      SELECT 1 FROM crossover_sail_definitions d WHERE d.version_id = v.id
  );

-- ---------------------------------------------------------------------------
-- mint_boat_setup_version writes the rows beside the payload
-- ---------------------------------------------------------------------------
-- The whole point of promoting the Definitions is that they and the payload are one act. This is
-- the same argument mint_rig_tune_version makes about its bands, and the reason both functions
-- exist at all: supabase-js cannot open a transaction, so two requests would leave a Version
-- whose payload names sails that no row of crossover_sail_definitions defines -- and a Sail
-- Configuration would then be refused for naming a sail the chart plainly recommends.
--
-- Everything else about the function is untouched: SECURITY INVOKER so RLS is the authorization
-- (ADR 0019), an empty search_path with every name qualified, the caller's version id, the
-- author from the session, and the forward-only pointer left to its deferred trigger.

CREATE OR REPLACE FUNCTION public.mint_boat_setup_version(
    p_version_id     UUID,
    p_kind           public.boat_setup_kind,
    p_effective_from DATE,
    p_payload        JSONB,
    p_note           TEXT DEFAULT NULL,
    p_filename       TEXT DEFAULT NULL,
    p_content_sha256 TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_artifact_id UUID;
    v_number      INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'a Version needs an author; nobody is signed in';
    END IF;

    -- One boat (boats_singleton), and UNIQUE (boat_id, kind) on the artifacts, so the kind
    -- names the artifact on its own. STRICT: a missing artifact means the seed did not run,
    -- which is a broken invariant and not a state to write around.
    SELECT id INTO STRICT v_artifact_id
    FROM public.boat_setup_artifacts
    WHERE kind = p_kind;

    -- The next number, read under the caller's own RLS. A concurrent second upload can read
    -- the same MAX; UNIQUE (artifact_id, version_number) is what settles it, and the loser is
    -- told to try again rather than quietly overwriting the winner.
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_number
    FROM public.boat_setup_versions
    WHERE artifact_id = v_artifact_id;

    INSERT INTO public.boat_setup_versions (
        id, artifact_id, kind, version_number, effective_from,
        note, created_by, filename, content_sha256, payload
    ) VALUES (
        p_version_id, v_artifact_id, p_kind, v_number, p_effective_from,
        -- A note the sailor left blank is no note. Stored as NULL rather than as an empty
        -- string, so "there is no note" has one spelling.
        NULLIF(BTRIM(COALESCE(p_note, '')), ''),
        -- The author is the session's, never the caller's to state (ADR 0018).
        auth.uid(),
        p_filename, p_content_sha256, p_payload
    );

    -- The Crossover Chart's own vocabulary, out of the payload it arrived in and into rows a
    -- Sail Configuration can point at (ADR 0023). Same parse, same transaction, and the payload
    -- keeps its copy: the file said this, and the rows are how Layline references it.
    --
    -- No COALESCE on either column: a definition missing its number or its label is a bug in
    -- the caller that the write gate (crossoverChartPayloadSchema) already refuses, and the NOT
    -- NULL constraints say so louder than a fabricated default would.
    IF p_kind = 'crossover_chart' THEN
        IF jsonb_typeof(p_payload->'sail_definitions') <> 'array'
           OR jsonb_array_length(p_payload->'sail_definitions') = 0 THEN
            RAISE EXCEPTION
                'a Crossover Chart Version needs at least one Sail Definition for its cells to resolve against'
                USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.crossover_sail_definitions (version_id, number, label)
        SELECT p_version_id,
               (definition->>'number')::INTEGER,
               definition->>'label'
        FROM jsonb_array_elements(p_payload->'sail_definitions') AS definition;
    END IF;

    UPDATE public.boat_setup_artifacts
    SET current_version_id = p_version_id,
        updated_at = NOW()
    WHERE id = v_artifact_id;

    -- A pointer that would move backwards is refused by the deferred constraint trigger at
    -- commit, not here: this function does not re-implement that check, so there is one
    -- place it lives.

    RETURN v_number;
END;
$$;

-- Not ADR 0023's business, and fixed here because this is the migration that replaces the
-- function. 20260915210000 revoked EXECUTE `FROM PUBLIC` only, and Supabase's default privileges
-- for schema `public` also grant it to `anon` *by name* -- so a guest reached the body and was
-- turned away by the author check inside it. The right answer for the wrong reason, and one
-- statement away from being a real one. `CREATE OR REPLACE` keeps the existing ACL, so nothing
-- above implies this. Same trap as `create_race_from_upload`, which names both
-- (docs/testing/race-upload-transaction.md, "A `REVOKE … FROM PUBLIC` is not enough to shut the
-- door"). Verified by scripts/verify-race-archive-schema.sql, "a guest cannot execute it at all".
REVOKE EXECUTE ON FUNCTION public.mint_boat_setup_version(UUID, public.boat_setup_kind, DATE, JSONB, TEXT, TEXT, TEXT) FROM anon;

COMMENT ON FUNCTION public.mint_boat_setup_version(UUID, public.boat_setup_kind, DATE, JSONB, TEXT, TEXT, TEXT) IS
    'Insert the next Version of one Boat Setup artifact and move its current pointer to it, in one transaction. A Crossover Chart Version also gets its Sail Definitions projected into crossover_sail_definitions from the same payload, in the same transaction, so a Version''s rows and its payload cannot be written apart (ADR 0023). Returns the version_number minted. SECURITY INVOKER: RLS decides who may, exactly as it does for a direct insert.';

-- ---------------------------------------------------------------------------
-- A Race's chart Version, referenceable as a unit
-- ---------------------------------------------------------------------------
-- `id` is already the primary key, so this adds no invariant a Race did not have. What it adds
-- is a key a child row can name, which is what lets a Sail Configuration state the Version it
-- was named against and have the database agree it is the Race's own.

-- The entry's key to it goes first. A UNIQUE constraint cannot be dropped while a foreign key
-- depends on it, and after one run of this file one does -- so without this line a second run
-- fails here rather than at anything it means to refuse.
ALTER TABLE race_sail_entries DROP CONSTRAINT IF EXISTS race_sail_entries_race_chart_fkey;

ALTER TABLE races DROP CONSTRAINT IF EXISTS races_id_crossover_chart_version_key;
ALTER TABLE races
    ADD CONSTRAINT races_id_crossover_chart_version_key
    UNIQUE (id, crossover_chart_version_id);

COMMENT ON COLUMN races.crossover_chart_version_id IS
    'Frozen pointer. A Crossover Chart and its Sail Definitions are one artifact, which is why there are four Version pointers and not five (ADR 0012). Also the vocabulary this Race''s Sail Configurations are named in (ADR 0023): while any Configuration stands, changing this is refused by ON UPDATE RESTRICT, and repoint_race_crossover_chart is how it changes. NULL means not recorded, and a Race with no chart Version can hold no Configurations.';

-- ---------------------------------------------------------------------------
-- The old vocabulary goes
-- ---------------------------------------------------------------------------
-- Every Sail Configuration first, because each one names `sails` ids and nothing else. See the
-- note at the top of this file: there is nothing to translate them into.
--
-- The new columns are added ahead of the delete, nullable, so the delete can *name* the rows it
-- takes. On the first run that is all of them, because no existing row has a Version. On any run
-- after it there is nothing with a NULL Version left to take -- which matters because a plain
-- `DELETE FROM race_sail_entries` reads identically on the first run and destroys hand-entered
-- Testimony on the second, in a file where every other statement can be repeated. `NOT NULL`
-- arrives below, once none of the old rows are left to fail it.

ALTER TABLE race_sail_entries
    ADD COLUMN IF NOT EXISTS crossover_chart_version_id UUID,
    ADD COLUMN IF NOT EXISTS definition_number INTEGER,
    ADD COLUMN IF NOT EXISTS note TEXT;

DELETE FROM race_sail_entries WHERE crossover_chart_version_id IS NULL;

-- "A Sail Configuration must name at least one sail" was a deferred trigger because the entry
-- row necessarily existed before its join rows did. With the sail named on the entry itself,
-- the same refusal is a CHECK (sail_entry_says_something, below) -- immediate, one row at a
-- time, and no function.
DROP TRIGGER IF EXISTS race_sail_entries_non_empty ON race_sail_entries;
DROP FUNCTION IF EXISTS public.enforce_sail_entry_non_empty();

-- The join table, and with it `race_sail_entry_sails_touch_race` -- the touch trigger that reached
-- the Race through the entry. Dropping the table is what takes that trigger, deliberately: `DROP
-- TRIGGER IF EXISTS ... ON race_sail_entry_sails` is an *error* rather than a no-op once the table
-- is gone, so naming it here would be the one statement in this file a second run could not
-- survive. `race_sail_entries_touch_race` stays and still covers the entry itself.
DROP TABLE IF EXISTS race_sail_entry_sails;
DROP FUNCTION IF EXISTS public.touch_race_updated_at_via_entry();

-- The Sail Inventory itself, and its six-row seed -- and `sails_updated_at` with it, for the same
-- reason. `retired_on` has no successor: it existed because a flown sail could not be deleted, and
-- a Definition is part of an immutable Version that is never edited at all.
DROP TABLE IF EXISTS sails;

-- ---------------------------------------------------------------------------
-- race_sail_entries names a Definition, or says something in words
-- ---------------------------------------------------------------------------

-- Added nullable above so the delete could name the old rows; NOT NULL now that none of them are
-- left. A Configuration in no vocabulary names nothing.
ALTER TABLE race_sail_entries
    ALTER COLUMN crossover_chart_version_id SET NOT NULL;

-- Reef is whatever the Definition says. Dropping the column drops the last use of the type.
ALTER TABLE race_sail_entries DROP COLUMN IF EXISTS reef;
DROP TYPE IF EXISTS reef_state;

-- The entry's Version is its Race's. MATCH SIMPLE is not a loophole here -- both columns are
-- NOT NULL, so the key always applies in full -- and it is what makes "no Configuration
-- without a Version" structural: a Race whose pointer is NULL matches no row of
-- races_id_crossover_chart_version_key, so the insert is refused.
--
-- ON UPDATE RESTRICT is the point of the whole key. Repointing a Race at another Version would
-- otherwise leave Configurations naming numbers of a Version this Race no longer records, so
-- the repoint is refused while any Configuration stands. repoint_race_crossover_chart below is
-- the way through, and it clears them in the same transaction after saying how many.
ALTER TABLE race_sail_entries DROP CONSTRAINT IF EXISTS race_sail_entries_race_chart_fkey;
ALTER TABLE race_sail_entries
    ADD CONSTRAINT race_sail_entries_race_chart_fkey
    FOREIGN KEY (race_id, crossover_chart_version_id)
        REFERENCES races (id, crossover_chart_version_id)
        ON UPDATE RESTRICT ON DELETE CASCADE;

-- The Definition named belongs to that same Version. MATCH SIMPLE *is* load-bearing here: a
-- NULL definition_number satisfies the key without matching anything, which is how a note-only
-- entry gets to exist. ON DELETE RESTRICT: a Definition that has been flown cannot vanish out
-- from under the Configuration that names it.
ALTER TABLE race_sail_entries DROP CONSTRAINT IF EXISTS race_sail_entries_definition_fkey;
ALTER TABLE race_sail_entries
    ADD CONSTRAINT race_sail_entries_definition_fkey
    FOREIGN KEY (crossover_chart_version_id, definition_number)
        REFERENCES crossover_sail_definitions (version_id, number)
        ON UPDATE RESTRICT ON DELETE RESTRICT;

-- An entry that says nothing is a timestamp with no testimony on it. A note *alone* is
-- testimony and not a gap -- "jib change, nobody wrote down which" is what the sailor
-- remembers -- and its NULL definition_number is what keeps it out of any comparison against
-- the chart, by construction rather than by a flag.
ALTER TABLE race_sail_entries DROP CONSTRAINT IF EXISTS sail_entry_says_something;
ALTER TABLE race_sail_entries
    ADD CONSTRAINT sail_entry_says_something
    CHECK (definition_number IS NOT NULL OR note IS NOT NULL);

-- A note the sailor left blank is no note, and would defeat the CHECK above by saying nothing
-- in a way that is not NULL.
ALTER TABLE race_sail_entries DROP CONSTRAINT IF EXISTS sail_entry_note_non_empty;
ALTER TABLE race_sail_entries
    ADD CONSTRAINT sail_entry_note_non_empty
    CHECK (note IS NULL OR BTRIM(note) <> '');

COMMENT ON TABLE race_sail_entries IS
    'What the boat was flying, from `at` until the next entry, named in the vocabulary of the Crossover Chart Version this Race points at (ADR 0023). Testimony: editable, and never generated from anything.';
COMMENT ON COLUMN race_sail_entries.crossover_chart_version_id IS
    'The Version this Configuration is named in, which is the Race''s own -- race_sail_entries_race_chart_fkey is what says so. NOT NULL: a Configuration in no vocabulary names nothing.';
COMMENT ON COLUMN race_sail_entries.definition_number IS
    'The Sail Definition of that Version the boat was flying. NULL when the sailor could only say it in words, which excludes the entry from any comparison against the chart by construction.';
COMMENT ON COLUMN race_sail_entries.note IS
    'What the sailor said, when no Definition is the answer or when the Definition needs a word beside it. Never generated, never a rewrite of a label.';

-- ---------------------------------------------------------------------------
-- Repointing a Race at another Crossover Chart Version
-- ---------------------------------------------------------------------------
-- The pointer stays changeable (ADR 0012): filling one in later, or correcting one, is an
-- Amendment under ADR 0010. But Definition numbers do not span Versions, so the Configurations
-- named against the old Version cannot come along -- sail 7 of v2 is not sail 7 of v1, and
-- carrying the number over would silently rewrite what the sailor said.
--
-- So the Configurations go, and they go in the same transaction as the repoint. Two requests
-- would leave a Race whose pointer moved and whose testimony did not, or the reverse; and
-- supabase-js cannot open a transaction.
--
-- p_clearing is what the caller told the sailor it would clear. If the count has moved since
-- they were told, the repoint is refused rather than clearing more than they agreed to -- which
-- is the one thing that must not happen quietly here, because deleted Testimony is not
-- recoverable from anything.
--
-- SECURITY INVOKER, and the SELECT ... FOR UPDATE is what applies the Race's admin-only write
-- policy: a viewer reaching this function directly finds no row and is refused before anything
-- is deleted.

CREATE OR REPLACE FUNCTION public.repoint_race_crossover_chart(
    p_race_id    UUID,
    p_version_id UUID,
    p_clearing   INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_locked  BOOLEAN;
    v_present INTEGER;
BEGIN
    SELECT TRUE INTO v_locked
      FROM public.races
     WHERE id = p_race_id
       FOR UPDATE;

    IF NOT COALESCE(v_locked, FALSE) THEN
        RAISE EXCEPTION 'no such Race, or it is not writable by this account'
            USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_present
      FROM public.race_sail_entries
     WHERE race_id = p_race_id;

    IF p_clearing IS DISTINCT FROM v_present THEN
        RAISE EXCEPTION
            'this Race has % Sail Configuration(s) and the repoint was agreed for %; nobody has been told what this would clear',
            v_present, p_clearing
            USING ERRCODE = '22023';
    END IF;

    -- Before the UPDATE, necessarily: ON UPDATE RESTRICT refuses the repoint while any
    -- Configuration still names the old Version.
    DELETE FROM public.race_sail_entries WHERE race_id = p_race_id;

    UPDATE public.races
       SET crossover_chart_version_id = p_version_id
     WHERE id = p_race_id;

    RETURN v_present;
END;
$$;

COMMENT ON FUNCTION public.repoint_race_crossover_chart(UUID, UUID, INTEGER) IS
    'Move a Race''s Crossover Chart Version pointer, clearing the Sail Configurations named in the old vocabulary, in one transaction (ADR 0023). Refuses unless p_clearing is the number of Configurations actually standing, so the sailor is told what will go before it goes. NULL p_version_id clears the pointer, which means not recorded (ADR 0012). Returns the number cleared. SECURITY INVOKER: the admin-only write policies on races and race_sail_entries are what refuse a viewer.';

-- A guest has no boat screens at all (ADR 0015), and Postgres grants EXECUTE on a new function
-- to PUBLIC while Supabase's default privileges grant it to `anon` by name.
REVOKE ALL ON FUNCTION public.repoint_race_crossover_chart(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repoint_race_crossover_chart(UUID, UUID, INTEGER) TO authenticated;
