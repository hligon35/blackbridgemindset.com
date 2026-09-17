-- Admin submissions inbox and activity log.
-- Apply to the existing bb_guest_schedule D1 database before using the inbox:
-- npx wrangler d1 execute bb_guest_schedule --remote --file=./worker/src/api/schedule/migration-add-admin-inbox.sql

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
