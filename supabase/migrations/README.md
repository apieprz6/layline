# Supabase Migrations

## Testing Migrations Locally

1. **Start Supabase**:
   ```bash
   supabase start
   ```

2. **Apply all migrations**:
   ```bash
   supabase db reset
   ```

3. **Verify specific tables**:
   ```bash
   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\d profiles"
   ```

4. **Stop Supabase**:
   ```bash
   supabase stop
   ```

## Migration: 20260501215158_create_profiles_table.sql

**Purpose**: User preferences database schema for per-user data source configuration.

**What it creates**:
- `profiles` table with JSONB preferences column
- Auto-update trigger for `updated_at` column
- RLS policies for user isolation (read/update/insert own profile only)
- Index on `user_id` for faster lookups

**JSONB preferences structure**:
```json
{
  "dataSources": {
    "chii2": {
      "enabled": true,
      "displayName": "Harrison Dever Crib"
    },
    "45198": {
      "enabled": true,
      "displayName": "Purdue Buoy"
    }
  }
}
```

**Rollback** (if needed):
```sql
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON profiles;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP INDEX IF EXISTS profiles_user_id_idx;
DROP TABLE IF EXISTS profiles CASCADE;
```

**Testing**:
- ✅ Table structure verified
- ✅ RLS policies verified (3 policies: SELECT, UPDATE, INSERT)
- ✅ Trigger verified (auto-updates `updated_at` on UPDATE)
- ✅ JSONB preferences insert/query tested
- ✅ Rollback tested (clean removal)

See `/docs/adr/0001-jsonb-user-preferences.md` for design rationale.
