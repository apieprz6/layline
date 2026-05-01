# JSONB for User Data Source Preferences

We store user preferences for data source configuration (which buoys to display) in a JSONB column rather than normalized tables. This prioritizes extensibility over queryability — adding new data sources requires no schema changes.

## Context

Users need to enable/disable individual data sources (CHII2, Purdue Buoy, future sources). We expect frequent additions of new data sources as the project evolves. The preferences structure needs to accommodate arbitrary metadata per source (display names, custom refresh intervals, etc.).

## Decision

Store preferences as JSONB in `profiles.preferences`:

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

## Considered Options

**Normalized tables** (`data_source_preferences` table with foreign keys):
- Rejected: Requires migration for every new data source
- Rejected: Harder to add per-source metadata fields
- Benefit: Easier to query "all users who have CHII2 enabled" (not a use case we have)

**Flat boolean columns** (`enable_chii2`, `enable_45198`):
- Rejected: Requires migration for every new data source
- Rejected: No place for per-source metadata

## Consequences

- Adding new data sources requires no database schema changes
- Per-source metadata can be added arbitrarily (display names, colors, custom settings)
- Cannot easily query "which users have source X enabled" (acceptable — not a use case)
- Application code responsible for validating JSON structure
