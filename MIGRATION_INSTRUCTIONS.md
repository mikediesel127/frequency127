# Database Migration Instructions

## Problem
The recent feature update added new database columns and tables, but the production database wasn't migrated. This causes 500 errors on `/api/auth/me` and other endpoints.

## What's Missing

### Missing Columns:
- `users.theme` - User's selected theme (dark, light, ocean, etc.)
- `routines.is_public` - Flag for public routine sharing

### Missing Tables:
- `friends` - User friendship relationships
- `routine_shares` - Shared routines between users

## How to Fix

### Option 1: Wrangler CLI (Recommended)
```bash
# Find your database name
wrangler d1 list

# Apply migration
wrangler d1 execute <YOUR_DATABASE_NAME> --file=migration.sql
```

### Option 2: Cloudflare Dashboard
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **Workers & Pages** → **D1**
3. Select your database (likely named something like `frequency127` or `f127-db`)
4. Click **Console** tab
5. Copy the entire contents of `migration.sql`
6. Paste into the console and click **Execute**

### Option 3: Manual SQL (Quick Fix)
If you just want to get the site working quickly, run these commands in the D1 Console:

```sql
-- Add missing columns
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE routines ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

-- Add missing tables
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

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_routines_public ON routines(is_public);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON routine_shares(shared_with_user_id);
```

## Verification

After running the migration, test these endpoints:
- `GET /api/auth/me` - Should return user info with theme
- `POST /api/auth/signup` - Should work for new users
- `POST /api/auth/login` - Should work for existing users

## Prevention

For future deployments, always:
1. Run migrations BEFORE deploying code changes
2. Keep `schema.sql` as the source of truth
3. Create migration files for any schema changes
4. Test locally with `wrangler dev` before production deploy

## Root Cause

The code in `_worker.js` was updated to select new columns:
- Line 119: `SELECT id, username, xp, streak, theme FROM users`
- Line 199: `SELECT id, name, steps, is_public, created_at FROM routines`

But the database schema wasn't updated to include these columns, causing SQL errors that resulted in 500 responses.
