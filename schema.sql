CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  salt TEXT NOT NULL,
  passhash TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'dark',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]',
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS routine_completions (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  xp_awarded INTEGER NOT NULL,
  UNIQUE(routine_id, user_id, day_key),
  FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, friend_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(friend_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS routine_shares (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  shared_by_user_id TEXT NOT NULL,
  shared_with_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(routine_id, shared_with_user_id),
  FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE,
  FOREIGN KEY(shared_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);
CREATE INDEX IF NOT EXISTS idx_routines_public ON routines(is_public);
CREATE INDEX IF NOT EXISTS idx_completions_user_day ON routine_completions(user_id, day_key);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON routine_shares(shared_with_user_id);