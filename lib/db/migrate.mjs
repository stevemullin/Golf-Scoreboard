import pg from "pg";

// Idempotent schema migrations, run from the build BEFORE the server starts.
// We do column changes here instead of relying on `drizzle-kit push`: in CI,
// push stalls on interactive prompts (e.g. when it wants to add a unique
// constraint to a populated table) and can silently skip the change — which is
// exactly what dropped the cut_size column and 500'd the scoreboard. Every
// statement is IF NOT EXISTS so this is always safe to re-run.
const connectionString =
  process.env.DATABASE_URL || process.env.APP_DATABASE_URL;

const statements = [
  // ── Full base DDL (fresh-DB bootstrap) ────────────────────────────────────
  // This file is the ONLY schema authority — `drizzle-kit push` was removed
  // from the build because `--force` auto-accepts destructive changes if the
  // schema and DB ever drift. Base tables first (referenced by the others).
  `CREATE TABLE IF NOT EXISTS tournaments (
     id text PRIMARY KEY,
     name text NOT NULL,
     year integer NOT NULL,
     espn_event_id text,
     status text NOT NULL DEFAULT 'upcoming',
     current_round integer NOT NULL DEFAULT 0,
     is_active boolean NOT NULL DEFAULT false,
     cut_size integer,
     picks_lock_at timestamptz,
     start_date timestamptz,
     end_date timestamptz,
     broadcasts text,
     status_detail text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS pool_members (
     id text PRIMARY KEY,
     name text NOT NULL,
     email text,
     access_token text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS golfers (
     id text PRIMARY KEY,
     espn_id text UNIQUE,
     name text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS golfer_scores (
     id text PRIMARY KEY,
     tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
     golfer_id text NOT NULL REFERENCES golfers(id) ON DELETE CASCADE,
     round_number integer NOT NULL,
     score_to_par integer,
     holes_completed integer NOT NULL DEFAULT 0,
     is_cut boolean NOT NULL DEFAULT false,
     is_wd boolean NOT NULL DEFAULT false,
     is_dq boolean NOT NULL DEFAULT false,
     tee_time text,
     hole_scores text,
     updated_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (tournament_id, golfer_id, round_number)
   )`,
  `CREATE TABLE IF NOT EXISTS team_picks (
     id text PRIMARY KEY,
     tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
     pool_member_id text NOT NULL REFERENCES pool_members(id) ON DELETE CASCADE,
     golfer_id text NOT NULL REFERENCES golfers(id) ON DELETE CASCADE,
     UNIQUE (tournament_id, pool_member_id, golfer_id)
   )`,
  `CREATE TABLE IF NOT EXISTS manual_scores (
     id text PRIMARY KEY,
     tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
     pool_member_id text NOT NULL REFERENCES pool_members(id) ON DELETE CASCADE,
     round_1 integer,
     round_2 integer,
     round_3 integer,
     round_4 integer,
     updated_by text,
     updated_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (tournament_id, pool_member_id)
   )`,
  `CREATE TABLE IF NOT EXISTS api_cache (
     id text PRIMARY KEY,
     tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
     last_fetched_at timestamptz,
     refresh_interval_minutes integer NOT NULL DEFAULT 5,
     UNIQUE (tournament_id)
   )`,
  // ── Incremental column adds (no-ops on fresh DBs, upgrades for existing) ──
  `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS cut_size integer`,
  `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS picks_lock_at timestamptz`,
  `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS start_date timestamptz`,
  `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS end_date timestamptz`,
  `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS broadcasts text`,
  `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS status_detail text`,
  `ALTER TABLE golfer_scores ADD COLUMN IF NOT EXISTS hole_scores text`,
  `CREATE TABLE IF NOT EXISTS golfer_tiers (
     id text PRIMARY KEY,
     tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
     golfer_id text NOT NULL REFERENCES golfers(id) ON DELETE CASCADE,
     tier integer NOT NULL,
     odds integer,
     UNIQUE (tournament_id, golfer_id)
   )`,
  // Self-service picks: per-member email + secret access token, plus a
  // submission marker table. Backfill tokens for any existing members.
  `ALTER TABLE pool_members ADD COLUMN IF NOT EXISTS email text`,
  `ALTER TABLE pool_members ADD COLUMN IF NOT EXISTS access_token text`,
  `UPDATE pool_members SET access_token = gen_random_uuid() WHERE access_token IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pool_members_access_token_key ON pool_members (access_token)`,
  `CREATE TABLE IF NOT EXISTS pick_submissions (
     id text PRIMARY KEY,
     tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
     pool_member_id text NOT NULL REFERENCES pool_members(id) ON DELETE CASCADE,
     submitted_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (tournament_id, pool_member_id)
   )`,
];

async function run() {
  if (!connectionString) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString });
  try {
    for (const sql of statements) {
      await pool.query(sql);
      console.log("[migrate] ok:", sql);
    }
    console.log("[migrate] done");
  } catch (e) {
    console.error("[migrate] failed:", e.message);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

run();
