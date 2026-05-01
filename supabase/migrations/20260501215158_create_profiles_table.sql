-- User profiles table with JSONB preferences for data source configuration
-- Related ADR: docs/adr/0001-jsonb-user-preferences.md

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT profiles_user_id_key UNIQUE (user_id)
);

-- Default preferences structure (JSONB):
-- {
--   "dataSources": {
--     "chii2": {
--       "enabled": true,
--       "displayName": "Harrison Dever Crib"
--     },
--     "45198": {
--       "enabled": true,
--       "displayName": "Purdue Buoy"
--     }
--   }
-- }
--
-- Data source keys reference:
-- - "chii2": CHII2 (Harrison Dever Crib) - Primary buoy at 85ft elevation, always operational
-- - "45198": Purdue Buoy - Secondary buoy with surface measurements, seasonal (May-October)
--
-- The JSONB structure allows adding new data sources without schema migrations.
-- Per-source metadata (displayName, custom settings) can be extended arbitrarily.

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own profile
CREATE POLICY "Users can read their own profile"
    ON profiles
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON profiles
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
    ON profiles
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles(user_id);

-- Add comment to table
COMMENT ON TABLE profiles IS 'User profiles with JSONB preferences for data source configuration. See docs/adr/0001-jsonb-user-preferences.md for design rationale.';

-- Add comments to columns
COMMENT ON COLUMN profiles.id IS 'Primary key, references auth.users(id)';
COMMENT ON COLUMN profiles.user_id IS 'Foreign key to auth.users, used for RLS policies';
COMMENT ON COLUMN profiles.role IS 'User role (future use for crew/skipper permissions)';
COMMENT ON COLUMN profiles.preferences IS 'JSONB preferences including data source enable/disable configuration';
COMMENT ON COLUMN profiles.created_at IS 'Timestamp when profile was created';
COMMENT ON COLUMN profiles.updated_at IS 'Timestamp when profile was last updated (auto-managed by trigger)';
