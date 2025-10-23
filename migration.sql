-- Migration to add missing columns from recent feature update
-- Run this on your Cloudflare D1 database

-- Add theme column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark';

-- Add is_public column to routines table if it doesn't exist
ALTER TABLE routines ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

-- Create friends table if it doesn't exist
CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, friend_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(friend_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create routine_shares table if it doesn't exist
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

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_routines_public ON routines(is_public);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON routine_shares(shared_with_user_id);
