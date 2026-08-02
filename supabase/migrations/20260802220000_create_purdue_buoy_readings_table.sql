-- Purdue Buoy (Station 45198) readings table
-- Stores raw metric observations from the IISEAGrant XML endpoint at 10-minute intervals

CREATE TABLE IF NOT EXISTS purdue_buoy_readings (
    timestamp TIMESTAMPTZ NOT NULL,
    wind_speed REAL,
    wind_direction SMALLINT,
    wind_gust REAL,
    air_temp REAL,
    water_temp REAL,
    pressure REAL,
    humidity REAL,
    wave_height REAL,
    wave_period REAL,
    wave_direction SMALLINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT purdue_buoy_readings_timestamp_key UNIQUE (timestamp)
);

CREATE INDEX IF NOT EXISTS purdue_buoy_readings_timestamp_desc_idx
    ON purdue_buoy_readings (timestamp DESC);

-- No RLS — public environmental data accessible via anon key
-- Write access controlled at application level (service role key used for inserts)
GRANT SELECT ON purdue_buoy_readings TO anon;
GRANT ALL ON purdue_buoy_readings TO service_role;

COMMENT ON TABLE purdue_buoy_readings IS 'Raw 10-minute observations from Purdue Buoy (Station 45198). All values stored in metric units as received.';
COMMENT ON COLUMN purdue_buoy_readings.timestamp IS 'Observation time from the buoy sensor';
COMMENT ON COLUMN purdue_buoy_readings.wind_speed IS 'Wind speed in m/s';
COMMENT ON COLUMN purdue_buoy_readings.wind_direction IS 'Wind direction in degrees (0-360)';
COMMENT ON COLUMN purdue_buoy_readings.wind_gust IS 'Wind gust speed in m/s';
COMMENT ON COLUMN purdue_buoy_readings.air_temp IS 'Air temperature in °C';
COMMENT ON COLUMN purdue_buoy_readings.water_temp IS 'Water temperature in °C';
COMMENT ON COLUMN purdue_buoy_readings.pressure IS 'Atmospheric pressure in mbar';
COMMENT ON COLUMN purdue_buoy_readings.humidity IS 'Relative humidity in %';
COMMENT ON COLUMN purdue_buoy_readings.wave_height IS 'Significant wave height in meters';
COMMENT ON COLUMN purdue_buoy_readings.wave_period IS 'Dominant wave period in seconds';
COMMENT ON COLUMN purdue_buoy_readings.wave_direction IS 'Dominant wave direction in degrees (0-360)';
COMMENT ON COLUMN purdue_buoy_readings.created_at IS 'Row insertion time (tracks ingestion lag vs observation time)';
