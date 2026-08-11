-- Enable RLS on purdue_buoy_readings to prevent unauthorized writes/deletes
-- The table stores public environmental data, so anonymous reads remain open.
-- service_role bypasses RLS and continues to handle ingestion inserts.

ALTER TABLE purdue_buoy_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
    ON purdue_buoy_readings
    FOR SELECT
    USING (true);
