-- frequency127 schema (D1)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  salt TEXT NOT NULL,
  passhash TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  time TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS routine_steps (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL,
  FOREIGN KEY(routine_id) REFERENCES routines(id)
);

CREATE TABLE IF NOT EXISTS routine_completions (
  user_id TEXT NOT NULL,
  routine_id TEXT NOT NULL,
  day_key INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, routine_id, day_key),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(routine_id) REFERENCES routines(id)
);
