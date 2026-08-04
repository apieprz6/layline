-- Add display_name column to profiles for storing user names at sign-up
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
