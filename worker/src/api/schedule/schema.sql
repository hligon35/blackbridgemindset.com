-- D1 schema for invite-only scheduler
--
-- Apply with Wrangler (example):
--   wrangler d1 execute <DB_NAME> --file=./src/api/schedule/schema.sql
--
-- Replace <DB_NAME> with your D1 database name.

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  datetime TEXT NOT NULL,
  notes TEXT,
  createdAt INTEGER NOT NULL,
  status TEXT DEFAULT 'confirmed',
  cancellationToken TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_datetime ON bookings(datetime);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_cancellation_token ON bookings(cancellationToken);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  origin TEXT,
  ip TEXT,
  userAgent TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  deliveryStatus TEXT NOT NULL DEFAULT 'pending',
  createdAt INTEGER NOT NULL,
  readAt INTEGER,
  archivedAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_createdAt ON contact_submissions(createdAt);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON contact_submissions(email);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT,
  actorEmail TEXT,
  detail TEXT,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_log_createdAt ON activity_log(createdAt);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
