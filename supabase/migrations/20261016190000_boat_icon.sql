-- The boat's icon (LAY-180).
--
-- Related: docs/adr/0015-locked-boat-sections-over-a-silent-drawer.md (amended by LAY-180)
--
-- Identity, like the name — not a Boat Setup artifact. Exactly one current icon and no versions,
-- because nothing points at it: no Race, no Version, no annotation. When it is replaced or removed
-- the old object is deleted, by the Server Action that saves the identity.
--
-- The bytes live in the private `boat` bucket at boat-identity/icon/{filename}, exactly as
-- uploaded (the path convention in 20260909190000_create_boat_storage_bucket.sql). The bucket's
-- existing policies already make that readable to any signed-in user and writable by an admin
-- only, so no policy changes here; the boats policies cover the two new columns the same way.
--
-- Additive and nullable: a boat with no icon is the state every row starts in.

ALTER TABLE boats ADD COLUMN IF NOT EXISTS icon_path TEXT;
ALTER TABLE boats ADD COLUMN IF NOT EXISTS icon_updated_at TIMESTAMPTZ;

-- Both or neither. A path with no timestamp would have no cache key for the header to use, and a
-- timestamp with no path would claim an icon that is not there.
ALTER TABLE boats DROP CONSTRAINT IF EXISTS boats_icon_both_or_neither;
ALTER TABLE boats ADD CONSTRAINT boats_icon_both_or_neither
    CHECK ((icon_path IS NULL) = (icon_updated_at IS NULL));

COMMENT ON COLUMN boats.icon_path IS
    'The boat''s one current icon: boat-identity/icon/{filename} in the boat bucket, bytes exactly as uploaded (PNG, JPEG or WebP). Null when there is none.';
COMMENT ON COLUMN boats.icon_updated_at IS
    'When the current icon was saved. The header''s cache key for /boat/icon. Null exactly when icon_path is.';
