CREATE TABLE IF NOT EXISTS reis_sessions (
  token TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  document TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reis_sessions_expires_at ON reis_sessions(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reis_sessions_updated_at ON reis_sessions(updated_at);
