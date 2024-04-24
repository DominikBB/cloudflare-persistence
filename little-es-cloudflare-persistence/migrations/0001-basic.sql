DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS projections;

CREATE TABLE IF NOT EXISTS events (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT,
    subject_sequence_id TEXT,
    event_id TEXT,
    source TEXT,
    time BIGINT,
    event TEXT
);

CREATE TABLE IF NOT EXISTS projections (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    last_considered_event_id TEXT,
    version INT,
    snapshot TEXT
);

-- Create an index on the subject and sequence id column for optimized querying
CREATE INDEX IF NOT EXISTS idx_events_id ON events (subject, subject_sequence_id);
