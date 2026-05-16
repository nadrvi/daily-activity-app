CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE activities ADD COLUMN user_id INTEGER;
ALTER TABLE activities ADD COLUMN status TEXT DEFAULT 'plan';

UPDATE activities
SET user_id = 1
WHERE user_id IS NULL;

UPDATE activities
SET status = 'plan'
WHERE status IS NULL;